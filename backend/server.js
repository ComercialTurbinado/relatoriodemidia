/**
 * Auditoria Expressa IA — Backend Orchestrator v2
 * Node.js + Express
 *
 * Endpoints chamados pelo Typebot:
 *  POST /api/fetch-instagram      → MCP: busca dados do perfil
 *  POST /api/analyze-deepseek     → DeepSeek R1: análise competitiva
 *  POST /api/generate-message     → GPT-4o: mensagem de confirmação do handle
 *  POST /api/generate-messages    → GPT-4o: bloco de mensagens da espera ativa + paywall
 *  POST /api/create-payment       → Stripe/Kiwify: gera link de checkout
 *  POST /api/generate-pdf         → PDFKit: gera relatório personalizado
 *  POST /api/webhook/pagamento    → recebe confirmação do gateway e aciona Nó 5
 */

require('dotenv').config();
const express     = require('express');
const axios       = require('axios');
const OpenAI      = require('openai');
const PDFDocument = require('pdfkit');
const { chromium } = require('playwright-core');
const fs          = require('fs');
const path        = require('path');
const crypto      = require('crypto');
const { exec, spawn } = require('child_process');
const os          = require('os');
const multer      = require('multer');
// ─── Supabase REST (sem SDK — usa axios direto) ───────────────────────────────
const SUPA_URL  = process.env.SUPABASE_URL  || 'https://mblntoimrkfoocbztozb.supabase.co';
const SUPA_KEY  = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1ibG50b2ltcmtmb29jYnp0b3piIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg1MDE3MzYsImV4cCI6MjA5NDA3NzczNn0.SOhorLxV8GDBMaWEwhnGhaVfvENgdP_RleaAl5o92Tw';
const supaHeaders = () => ({
  'apikey': SUPA_KEY,
  'Authorization': `Bearer ${SUPA_KEY}`,
  'Content-Type': 'application/json',
  'Prefer': 'return=representation',
});

const CHROME_PATH = process.env.CHROME_PATH
  || (process.platform === 'darwin' ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' : '/usr/bin/chromium');

// Flags para --print-to-pdf one-shot (sem CDP).
// Combinações testadas em ordem de preferência — chromeOneShotPdf tenta
// cada variante até uma funcionar ou todas falharem.
const CHROME_FLAG_VARIANTS = [
  // Variant A: headless clássico sem single-process (Docker padrão)
  [
    '--headless',
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-gpu',
  ],
  // Variant B: headless=new (Chrome 112+) sem single-process
  [
    '--headless=new',
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-gpu',
  ],
  // Variant C: headless=shell com single-process (anterior)
  [
    '--headless=shell',
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-gpu',
    '--no-zygote',
    '--single-process',
  ],
];

const CHROME_ONE_SHOT_ARGS = CHROME_FLAG_VARIANTS[0];

// Tenta uma variante de flags do Chrome com --print-to-pdf.
// Resolve com Buffer do PDF ou rejeita com { sigtrap: true } para sinalizar seccomp.
function tryChromePdf(htmlPath, flags) {
  const tmpPdf = htmlPath.replace(/\.html$/, `_${Date.now()}.pdf`);
  return new Promise((resolve, reject) => {
    const args = [
      ...flags,
      '--print-to-pdf-no-header',
      `--print-to-pdf=${tmpPdf}`,
      `file://${htmlPath}`,
    ];
    const proc = spawn(CHROME_PATH, args);
    let stderr = '';
    proc.stderr.on('data', d => { stderr += d.toString(); });
    const timer = setTimeout(() => {
      proc.kill();
      reject(new Error('timeout'));
    }, 30000);
    proc.on('exit', (code, signal) => {
      clearTimeout(timer);
      if (signal === 'SIGTRAP') {
        const err = new Error(`SIGTRAP`);
        err.sigtrap = true;
        return reject(err);
      }
      try {
        const buf = fs.readFileSync(tmpPdf);
        try { fs.unlinkSync(tmpPdf); } catch (_) {}
        resolve(buf);
      } catch {
        reject(new Error(`PDF não gerado: code=${code} signal=${signal}\nstderr: ${stderr.slice(0, 300)}`));
      }
    });
  });
}

// Tenta cada variante de flags em sequência até uma funcionar.
async function chromeOneShotPdf(htmlPath) {
  let lastErr;
  for (const flags of CHROME_FLAG_VARIANTS) {
    try {
      return await tryChromePdf(htmlPath, flags);
    } catch (err) {
      lastErr = err;
      if (!err.sigtrap) break; // só tenta próxima se for seccomp
    }
  }
  throw lastErr || new Error('Chrome falhou em todas as variantes de flags');
}

const app  = express();
app.use(express.json({ limit: '10mb' }));

// ─── Clientes de IA ──────────────────────────────────────────────────────────

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || '' });

const deepseek = new OpenAI({
  apiKey:  process.env.DEEPSEEK_API_KEY || '',
  baseURL: 'https://api.deepseek.com/v1',
});

// ─── Auth simples ─────────────────────────────────────────────────────────────

// Rotas internas do Agente Sofia (chamadas pelo n8n — sem auth pública)
const SOFIA_ROUTES = new Set([
  '/cadastrar-cliente',
  '/verificar-cliente',
  '/historico-analises',
  '/iniciar-auditoria',
  '/debitar-credito',
  '/fetch-instagram',
  '/transcribe',
]);

app.use('/api', (req, res, next) => {
  if (req.path === '/webhook/pagamento') return next(); // gateway não manda header
  if (SOFIA_ROUTES.has(req.path)) return next();        // rotas internas Sofia
  const key = req.headers['x-api-key'];
  if (key !== process.env.API_SECRET) return res.status(401).json({ error: 'Unauthorized' });
  next();
});

// ═════════════════════════════════════════════════════════════════════════════
// DIAGNÓSTICO: testa cada variante de flags do Chrome com --print-to-pdf
// GET /api/test-chrome — não requer auth, retorna resultado de cada variante
// ═════════════════════════════════════════════════════════════════════════════
app.get('/api/test-chrome', async (req, res) => {
  const tmpHtml = path.join(os.tmpdir(), `chrome_test_${Date.now()}.html`);
  fs.writeFileSync(tmpHtml, '<html><body><h1>Chrome PDF test</h1></body></html>', 'utf8');
  const results = [];
  for (let i = 0; i < CHROME_FLAG_VARIANTS.length; i++) {
    const flags = CHROME_FLAG_VARIANTS[i];
    const start = Date.now();
    try {
      const buf = await tryChromePdf(tmpHtml, flags);
      results.push({ variant: i, flags, ok: true, bytes: buf.length, ms: Date.now() - start });
      break; // primeiro que funcionar é suficiente
    } catch (err) {
      results.push({ variant: i, flags, ok: false, sigtrap: !!err.sigtrap, error: err.message, ms: Date.now() - start });
    }
  }
  try { fs.unlinkSync(tmpHtml); } catch (_) {}
  res.json({ chromePath: CHROME_PATH, results });
});

// ═════════════════════════════════════════════════════════════════════════════
// 1. MCP — FETCH INSTAGRAM
// ═════════════════════════════════════════════════════════════════════════════

app.post('/api/fetch-instagram', async (req, res) => {
  const { handle } = req.body;
  const cleanHandle = handle.replace('@', '').replace(/.*instagram\.com\//, '').split('/')[0];

  // ── helpers ──────────────────────────────────────────────────────────────
  async function fetchViaApify() {
    const r = await axios.post(
      `https://api.apify.com/v2/acts/apify~instagram-profile-scraper/run-sync-get-dataset-items?token=${process.env.APIFY_TOKEN}`,
      { usernames: [cleanHandle] },
      { timeout: 30000 }
    );
    const p = r.data[0];
    if (!p || !p.followersCount) throw new Error('apify: no data');
    return {
      followers:   p.followersCount || 0,
      following:   p.followsCount   || 0,
      posts_count: p.postsCount     || 0,
      full_name:   p.fullName       || '',
      biography:   p.biography      || '',
      verified:    !!(p.verified || p.isVerified),
      private:     !!(p.private  || p.isPrivate),
      is_business: !!(p.businessCategory || p.isBusinessAccount),
      external_url:p.externalUrl   || p.bioLinks?.[0]?.url || '',
      foto_perfil: p.profilePicUrlHD || p.profilePicUrl || '',
      posts: (p.latestPosts || []).slice(0, 6).map(x => ({
        curtidas:   x.likesCount    || 0,
        comentarios:x.commentsCount || 0,
        caption:    (x.caption      || '').slice(0, 120),
      })),
    };
  }

  async function fetchViaRapidAPI() {
    const RAPIDAPI_KEY  = process.env.RAPIDAPI_KEY || '0127634a29msh4a303edef58f6dbp1430c6jsnd00af7a6bc1e';
    const r = await axios.get(
      `https://instagram-looter2.p.rapidapi.com/profile`,
      {
        params:  { username: cleanHandle },
        headers: { 'X-RapidAPI-Key': RAPIDAPI_KEY, 'X-RapidAPI-Host': 'instagram-looter2.p.rapidapi.com' },
        timeout: 20000,
      }
    );
    const p = r.data;
    if (!p || p.status === false) throw new Error('rapidapi: no data');
    const followers    = p.edge_followed_by?.count || 0;
    const following    = p.edge_follow?.count       || 0;
    const posts_nodes  = p.edge_owner_to_timeline_media?.edges || [];
    const posts        = posts_nodes.slice(0, 6).map(e => ({
      curtidas:    e.node?.edge_liked_by?.count       || e.node?.edge_media_preview_like?.count || 0,
      comentarios: e.node?.edge_media_to_comment?.count || 0,
      caption:     (e.node?.edge_media_to_caption?.edges?.[0]?.node?.text || '').slice(0, 120),
    }));
    return {
      followers,
      following,
      posts_count: p.edge_owner_to_timeline_media?.count || 0,
      full_name:   p.full_name    || '',
      biography:   p.biography    || '',
      verified:    !!(p.is_verified),
      private:     !!(p.is_private),
      is_business: !!(p.is_business_account),
      external_url:p.external_url || '',
      foto_perfil: p.profile_pic_url_hd || p.profile_pic_url || '',
      posts,
    };
  }

  try {
    // Tenta Apify primeiro, cai no RapidAPI se falhar
    let profile;
    try {
      profile = await fetchViaApify();
      console.log('[fetch-instagram] via Apify:', cleanHandle);
    } catch (apifyErr) {
      console.warn('[fetch-instagram] Apify falhou, usando RapidAPI:', apifyErr.message);
      profile = await fetchViaRapidAPI();
      console.log('[fetch-instagram] via RapidAPI:', cleanHandle);
    }

    const { followers, following, posts_count, full_name, biography,
            verified, private: is_private, is_business, external_url,
            foto_perfil, posts } = profile;

    const avgLikes    = posts.length ? Math.round(posts.reduce((s,p) => s + p.curtidas,    0) / posts.length) : 0;
    const avgComments = posts.length ? Math.round(posts.reduce((s,p) => s + p.comentarios, 0) / posts.length) : 0;
    const taxa_engajamento = followers > 0
      ? (((avgLikes + avgComments) / followers) * 100).toFixed(2)
      : '0.00';

    // Detectar nicho via GPT-4o mini
    const nichoRes = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'Classifique o nicho do perfil em UMA palavra em português. Exemplos: restaurante, coach, ecommerce, academia, clínica, barbearia, infoprodutor, moda, pet, imóveis. Responda apenas a palavra.' },
        { role: 'user',   content: `Bio: ${biography}\nÚltimas legendas: ${posts.slice(0,5).map(p=>p.caption).join(' | ')}` },
      ],
      max_tokens: 10,
    });
    const nicho = nichoRes.choices[0].message.content.trim().toLowerCase();

    return res.json({
      ok:              true,
      handle:          cleanHandle,
      nicho,
      full_name,
      biografia:       biography,
      seguidores:      followers,
      seguindo:        following,
      qtd_posts:       posts_count,
      is_verificado:   verified,
      is_privado:      is_private,
      is_business,
      has_website:     !!external_url,
      site_externo:    external_url,
      foto_perfil,
      taxa_engajamento,
      avg_likes:       avgLikes,
      avg_comments:    avgComments,
      ultimos_posts:   posts.slice(0, 3).map(p => ({
        curtidas:        p.curtidas,
        comentarios:     p.comentarios,
        legenda_preview: p.caption,
      })),
    });

  } catch (err) {
    console.error('[fetch-instagram]', err.message);
    return res.json({
      ok:              false,
      handle:          cleanHandle,
      nicho:           '',
      full_name:       '',
      biografia:       '',
      seguidores:      0,
      seguindo:        0,
      qtd_posts:       0,
      is_verificado:   false,
      is_privado:      false,
      is_business:     false,
      has_website:     false,
      site_externo:    '',
      foto_perfil:     '',
      taxa_engajamento:'0.00',
      avg_likes:       0,
      avg_comments:    0,
      ultimos_posts:   [],
    });
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// 2. DEEPSEEK R1 — ANÁLISE COMPETITIVA
// ═════════════════════════════════════════════════════════════════════════════

app.post('/api/analyze-deepseek', async (req, res) => {
  const { handle_cliente, concorrentes, nicho, taxa_cliente } = req.body;

  const systemPrompt = `
Você é um analista sênior de marketing digital especializado em Instagram.
Pense passo a passo (chain-of-thought) antes de responder.
Seja específico, use dados reais quando disponíveis e evite generalidades.
Retorne APENAS um JSON válido, sem markdown.
`.trim();

  const userPrompt = `
Perfil analisado: ${handle_cliente}
Nicho: ${nicho}
Taxa de engajamento do cliente: ${taxa_cliente}%
Concorrentes informados: ${concorrentes}

Faça a análise competitiva e retorne este JSON:
{
  "taxa_concorrente": "<taxa estimada de engajamento dos concorrentes, ex: 4.2%>",
  "gap_principal": "<diferença mais crítica entre o cliente e os concorrentes em 1 frase curta>",
  "oportunidade_principal": "<maior oportunidade não explorada pelo cliente em 1 frase de ação>",
  "erro_critico": "<erro mais grave identificado nos últimos posts em 1 frase>",
  "raciocinio": "<seu chain-of-thought interno resumido, para log>"
}
`.trim();

  try {
    const completion = await deepseek.chat.completions.create({
      model: 'deepseek-reasoner', // DeepSeek R1
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user',   content: userPrompt   },
      ],
      response_format: { type: 'json_object' },
      max_tokens: 800,
    });

    const result = JSON.parse(completion.choices[0].message.content);
    console.log('[deepseek] raciocinio:', result.raciocinio);
    return res.json(result);

  } catch (err) {
    console.error('[analyze-deepseek]', err.message);
    return res.json({
      taxa_concorrente:      '4.5%',
      gap_principal:         'Uso de Reels curtos (< 15s) que os concorrentes dominam',
      oportunidade_principal:'Criar série de Reels educativos de 10s com CTA direto',
      erro_critico:          'Últimos 5 posts sem CTA claro afastando leads qualificados',
    });
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// 3. GPT-4o — MENSAGEM DE CONFIRMAÇÃO DO HANDLE
// ═════════════════════════════════════════════════════════════════════════════

app.post('/api/generate-message', async (req, res) => {
  const { template, handle, nicho, followers } = req.body;

  const prompts = {
    confirmacao_handle: `
Você é um consultor de marketing direto, tom confiante e humano, nunca robótico.
O lead informou o handle "${handle}". Nicho detectado: ${nicho}. Seguidores: ${followers}.
Gere UMA mensagem curta (máx 2 linhas) confirmando que encontrou o perfil.
Varie o vocabulário. Não use a frase "Achei aqui". Não use emoji excessivo.
Responda APENAS a mensagem, sem aspas.
`.trim(),
  };

  try {
    const res2 = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: prompts[template] }],
      max_tokens: 80,
      temperature: 0.9,
    });
    return res.json({ message: res2.choices[0].message.content.trim() });
  } catch (err) {
    console.error('[generate-message]', err.message);
    return res.json({ message: `Encontrei o perfil ${handle}. Já estou rodando a pré-leitura dos seus últimos posts...` });
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// 4. GPT-4o — BLOCO DE MENSAGENS (ESPERA ATIVA + PAYWALL)
// ═════════════════════════════════════════════════════════════════════════════

app.post('/api/generate-messages', async (req, res) => {
  const { nicho, taxa_cliente, taxa_concorrente, gap, erro, oportunidade } = req.body;

  const prompt = `
Você é um copywriter de alta conversão especializado em chatbots de vendas.
Tom: direto, confiante, levemente urgente. Nunca robótico. Frases curtas.

Contexto da análise:
- Nicho: ${nicho}
- Taxa de engajamento do cliente: ${taxa_cliente}%
- Taxa de engajamento dos concorrentes: ${taxa_concorrente}
- Gap principal: ${gap}
- Erro crítico detectado: ${erro}
- Oportunidade: ${oportunidade}

Gere exatamente este JSON (sem markdown):
{
  "msg_espera_1": "<mensagem 1 da espera ativa — conectando dados, revelando um dado numérico real do comparativo. Máx 3 linhas.>",
  "msg_espera_2": "<mensagem 2 — revelar o erro crítico de forma intrigante, criando curiosidade para o paywall. Terminar com reticências ou gancho. Máx 2 linhas.>",
  "msg_paywall_intro": "<frase de introdução antes de mostrar o que tem no relatório. Máx 1 linha.>",
  "prova_social": "<case de resultado fictício mas crível de um cliente do mesmo nicho (${nicho}). Inclua números. Máx 2 linhas.>"
}
`.trim();

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      max_tokens: 400,
      temperature: 0.85,
    });
    return res.json(JSON.parse(completion.choices[0].message.content));
  } catch (err) {
    console.error('[generate-messages]', err.message);
    return res.json({
      msg_espera_1:     `Cruzei os dados dos três perfis. Seu engajamento está em ${taxa_cliente}% contra ${taxa_concorrente} dos seus concorrentes. A diferença não é tamanho de audiência.`,
      msg_espera_2:     `É formato e CTA. ${gap}. E tem mais uma coisa que encontrei que está afastando quem quase comprou...`,
      msg_paywall_intro:'O relatório ficou pronto. Olha o que ele traz:',
      prova_social:     `Um cliente do mesmo nicho usou esse relatório e triplicou o alcance orgânico em 3 semanas — sem pagar tráfego.`,
    });
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// 5. PAGAMENTO — CRIAR LINK DE CHECKOUT
// ═════════════════════════════════════════════════════════════════════════════

app.post('/api/create-payment', async (req, res) => {
  const { handle, produto, valor } = req.body;

  // Exemplo com Stripe Payment Links dinâmicos
  // Troque pela Kiwify ou Hotmart se preferir
  try {
    const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'brl',
          product_data: { name: `Auditoria Expressa IA — ${handle}` },
          unit_amount: valor || 4700,
        },
        quantity: 1,
      }],
      mode: 'payment',
      success_url: `${process.env.BACKEND_URL}/pagamento/sucesso?handle=${handle}`,
      cancel_url:  `${process.env.BACKEND_URL}/pagamento/cancelado`,
      metadata: { handle, produto },
    });
    return res.json({ checkout_url: session.url });
  } catch (err) {
    console.error('[create-payment]', err.message);
    // Fallback: link fixo do .env
    return res.json({ checkout_url: process.env.CHECKOUT_URL_FALLBACK });
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// 6. GERAR PDF PERSONALIZADO
// ═════════════════════════════════════════════════════════════════════════════

app.post('/api/generate-pdf', async (req, res) => {
  const { handle, nicho, concorrentes, taxa_cliente, taxa_concorrente, gap, oportunidade, erro } = req.body;

  // Gerar conteúdo do PDF via GPT-4o
  let conteudo;
  try {
    const pdfPrompt = `
Você é um consultor de marketing digital. Escreva um relatório de auditoria de Instagram
para o perfil @${handle} no nicho de ${nicho}.

Dados:
- Engajamento do cliente: ${taxa_cliente}%
- Engajamento dos concorrentes (${concorrentes}): ${taxa_concorrente}
- Gap principal: ${gap}
- Erro crítico: ${erro}
- Oportunidade: ${oportunidade}

Estrutura do relatório (escreva o conteúdo completo):
1. DIAGNÓSTICO DO PERFIL
2. ANÁLISE COMPETITIVA vs ${concorrentes}
3. OS 3 ERROS QUE ESTÃO CUSTANDO DINHEIRO
4. PLANO DE AÇÃO — 5 TAREFAS PARA ESSA SEMANA
5. PRÓXIMOS PASSOS

Tom: profissional, direto, orientado a resultado. Use dados específicos.
`.trim();

    const pdfRes = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: pdfPrompt }],
      max_tokens: 1500,
    });
    conteudo = pdfRes.choices[0].message.content;
  } catch (err) {
    conteudo = `Relatório de Auditoria\n\nGap: ${gap}\nErro: ${erro}\nOportunidade: ${oportunidade}`;
  }

  // Montar PDF
  const pdfDir  = path.join(__dirname, 'pdfs');
  if (!fs.existsSync(pdfDir)) fs.mkdirSync(pdfDir);

  const fileName = `auditoria_${handle}_${crypto.randomBytes(4).toString('hex')}.pdf`;
  const filePath = path.join(pdfDir, fileName);

  const doc = new PDFDocument({ margin: 50 });
  doc.pipe(fs.createWriteStream(filePath));

  doc.fontSize(22).fillColor('#1a1a2e').text(`Auditoria Expressa IA`, { align: 'center' });
  doc.fontSize(14).fillColor('#e94560').text(`@${handle} — ${nicho}`, { align: 'center' });
  doc.moveDown(2);

  doc.fontSize(10).fillColor('#333333').text(conteudo, { lineGap: 4 });
  doc.end();

  await new Promise(r => doc.on('end', r));

  const publicUrl = `${process.env.BACKEND_URL}/pdfs/${fileName}`;
  return res.json({ pdf_url: publicUrl });
});

// Servir PDFs gerados
app.use('/pdfs', express.static(path.join(__dirname, 'pdfs')));

// ─── Dashboard estático ───────────────────────────────────────────────────────
app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'dashboard.html'));
});

// ═════════════════════════════════════════════════════════════════════════════
// DASHBOARD — Área do usuário (leitura e edição de diretrizes via Supabase)
// GET /api/dashboard/:handle  → busca plano_diretor mais recente do cliente
// PUT /api/dashboard/:handle  → salva edições do usuário no plano_diretor
// ═════════════════════════════════════════════════════════════════════════════

// Helper: monta objeto diretrizes_tecnicas a partir de uma row do planos_diretores
function rowToDiretrizes(row) {
  return {
    tom_de_voz:             row.tom_de_voz            || {},
    seo_instagram:          row.seo_instagram          || {},
    frequencia_publicacao:  row.frequencia_publicacao  || {},
    pilares_conteudo:       row.pilares_conteudo       || [],
    assuntos_quentes:       row.assuntos_quentes       || [],
    ideias_de_titulos:      row.ideias_titulos         || [],
    ganchos_modelo:         row.ganchos_modelo         || [],
    ctas_recomendados:      row.ctas_recomendados      || [],
    hashtags_estrategicas:  row.hashtags_estrategicas  || {},
    identidade_visual:      row.identidade_visual      || {},
    stories_recorrentes:    row.stories_recorrentes    || [],
    kpis_acompanhar:        row.kpis_acompanhar        || [],
    briefing_redatores:     row.briefing_redatores     || '',
    briefing_designers:     row.briefing_designers     || '',
    calendario_30_dias:     row.calendario_30_dias     || [],
  };
}

// GET /api/dashboard/:handle — sem autenticação (URL é privada por handle)
app.get('/api/dashboard/:handle', async (req, res) => {
  const handle = req.params.handle.replace(/^@/, '').toLowerCase().trim();
  try {
    const resp = await axios.get(
      `${SUPA_URL}/rest/v1/planos_diretores?cliente_handle=eq.${handle}&order=criado_em.desc&limit=1&select=*,analises(nicho)`,
      { headers: supaHeaders() }
    );
    const rows = resp.data;
    if (!rows || rows.length === 0) {
      return res.status(404).json({ error: 'Nenhum plano encontrado para este handle.' });
    }
    const row = rows[0];
    res.json({
      plano_id:            row.id,
      handle_cliente:      handle,
      nicho:               row.analises?.nicho || '',
      diretrizes_tecnicas: rowToDiretrizes(row),
    });
  } catch (e) {
    res.status(500).json({ error: e.response?.data || e.message });
  }
});

// PUT /api/dashboard/:handle — salva edições do usuário
app.put('/api/dashboard/:handle', async (req, res) => {
  const handle = req.params.handle.replace(/^@/, '').toLowerCase().trim();
  const { diretrizes_tecnicas: dt, plano_id } = req.body;
  if (!dt) return res.status(400).json({ error: 'Campo diretrizes_tecnicas ausente.' });

  // Monta payload apenas com campos presentes
  const payload = {};
  const map = {
    tom_de_voz:            dt.tom_de_voz,
    seo_instagram:         dt.seo_instagram,
    frequencia_publicacao: dt.frequencia_publicacao,
    pilares_conteudo:      dt.pilares_conteudo,
    assuntos_quentes:      dt.assuntos_quentes,
    ideias_titulos:        dt.ideias_de_titulos,
    ganchos_modelo:        dt.ganchos_modelo,
    ctas_recomendados:     dt.ctas_recomendados,
    hashtags_estrategicas: dt.hashtags_estrategicas,
    identidade_visual:     dt.identidade_visual,
    stories_recorrentes:   dt.stories_recorrentes,
    kpis_acompanhar:       dt.kpis_acompanhar,
    briefing_redatores:    dt.briefing_redatores,
    briefing_designers:    dt.briefing_designers,
    calendario_30_dias:    dt.calendario_30_dias,
  };
  Object.entries(map).forEach(([k, v]) => { if (v !== undefined) payload[k] = v; });

  try {
    const filter = plano_id
      ? `id=eq.${plano_id}`
      : `cliente_handle=eq.${handle}&order=criado_em.desc&limit=1`;

    await axios.patch(
      `${SUPA_URL}/rest/v1/planos_diretores?${filter}`,
      payload,
      { headers: supaHeaders() }
    );
    res.json({ ok: true, salvo_em: new Date().toISOString() });
  } catch (e) {
    res.status(500).json({ error: e.response?.data || e.message });
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// 8. INFOGRÁFICO DE SLIDES — recebe JSON de marketing, retorna HTML visual
//
//  POST /api/slides?section=overview_cliente   → só slides do cliente
//  POST /api/slides?section=diretrizes_tecnicas → só slides técnicos
//  POST /api/slides                            → todos os slides
//
//  Body: o JSON completo gerado pela análise (overview_cliente + diretrizes_tecnicas)
//  Response: text/html — página de slides pronta para abrir no browser
// ═════════════════════════════════════════════════════════════════════════════

const SLIDES_TEMPLATE = path.join(__dirname, '..', 'infografico-marketing.html');

function parseSlideBody(body) {
  const mapPost = (p) => {
    const tipo = p.tipo_conteudo || p.tipo || '';
    const isVideo = tipo === 'video';
    return {
      link_post:         p.link_post         || '',
      tipo_conteudo:     tipo,
      formato_midia:     p.formato_midia     || tipo,
      thumb:             p.thumb             || null,
      link_midia:        p.link_midia        || null,
      midia_url:         isVideo ? (p.thumb || p.link_midia || null) : (p.link_midia || p.thumb || null),
      legenda:           p.legenda           || '',
      curtidas:          p.curtidas          ?? 0,
      comentarios:       p.comentarios       ?? 0,
      views:             p.views             ?? 0,
      engajamento_total: p.engajamento_total ?? 0,
      publicado_em:      p.publicado_em      || '',
    };
  };

  if (Array.isArray(body) && body[0]?.plano_diretor) {
    return { data: body[0].plano_diretor, auditData: body[0] };
  }

  if (Array.isArray(body) && body[0]?.overview_cliente) {
    const raw = body[0];
    const data = { overview_cliente: raw.overview_cliente, diretrizes_tecnicas: raw.diretrizes_tecnicas };
    const dm = raw.dados_metricas_perfis;
    const auditData = dm ? {
      nome_cliente:    dm.cliente?.handle ?? '',
      handle_cliente:  dm.cliente?.handle ?? '',
      cliente: {
        handle: dm.cliente?.handle ?? '',
        perfil: {
          metricas: {
            seguidores:              dm.cliente?.metricas_perfil?.seguidores              ?? 0,
            seguindo:                dm.cliente?.metricas_perfil?.seguindo                ?? 0,
            qtd_posts:               dm.cliente?.metricas_perfil?.qtd_posts               ?? 0,
            ratio_seguidor_seguindo: dm.cliente?.metricas_perfil?.ratio_seguidor_seguindo ?? 0,
          },
          biografia:      dm.cliente?.metricas_perfil?.biografia || '',
          foto_perfil:    dm.cliente?.foto_perfil    || null,
          foto_perfil_hd: dm.cliente?.foto_perfil_hd || null,
        },
        // todos os posts com mídia (para cruzar shortcode no slide)
        posts: (dm.cliente?.posts ?? dm.cliente?.top_3_melhores_posts ?? []).map(mapPost),
      },
      concorrentes: (dm.concorrentes ?? []).map((c) => ({
        handle:     c.handle,
        encontrado: true,
        perfil: {
          metricas: {
            seguidores: c.metricas_perfil?.seguidores ?? c.perfil?.metricas?.seguidores ?? 0,
            qtd_posts:  c.metricas_perfil?.qtd_posts  ?? c.perfil?.metricas?.qtd_posts  ?? 0,
          },
          foto_perfil:    c.foto_perfil    || null,
          foto_perfil_hd: c.foto_perfil_hd || null,
        },
        posts: [],
        metricas_posts: {
          taxa_engajamento:  c.metricas_posts?.taxa_engajamento  ?? '0',
          media_curtidas:    c.metricas_posts?.media_curtidas    ?? 0,
          media_comentarios: c.metricas_posts?.media_comentarios ?? 0,
          media_views:       c.metricas_posts?.media_views       ?? 0,
          mix_formatos:      c.metricas_posts?.mix_formatos      ?? { reels_pct: 0, carrossel_pct: 0, foto_pct: 0 },
          top_posts: (c.top_posts ?? c.top_3_melhores_posts ?? []).map(mapPost),
        },
      })),
      analise_conteudo: {
        cliente: {
          // usa ganchos_top do dm se disponível (com shortcode), senão deriva dos top posts
          ganchos_top: dm.cliente?.ganchos_top?.length
            ? dm.cliente.ganchos_top.map((g) => ({
                shortcode:      g.shortcode      || (g.link_post || '').match(/\/p\/([^/]+)/)?.[1] || '',
                primeira_linha: g.primeira_linha || '',
                tipo_conteudo:  g.tipo_conteudo  || '',
                engajamento:    g.engajamento    ?? 0,
                curtidas:       g.curtidas       ?? 0,
                comentarios:    g.comentarios    ?? 0,
              }))
            : (dm.cliente?.top_3_melhores_posts ?? []).map((p) => ({
                shortcode:      (p.link_post || '').match(/\/p\/([^/]+)/)?.[1] ?? '',
                primeira_linha: (p.legenda   || '').split('\n')[0],
                tipo_conteudo:  p.tipo_conteudo || p.tipo || '',
                engajamento:    p.engajamento_total ?? 0,
                curtidas:       p.curtidas          ?? 0,
                comentarios:    p.comentarios       ?? 0,
              })),
        },
      },
    } : null;
    return { data, auditData };
  }

  // Format 4: objeto plano com plano_diretor + cliente/concorrentes na raiz (saída do Consolidar Saída Final)
  if (!Array.isArray(body) && body.plano_diretor && (body.cliente || body.concorrentes)) {
    return { data: body.plano_diretor, auditData: body };
  }

  return { data: body, auditData: null };
}

app.post('/api/slides', (req, res) => {
  const body    = req.body;
  const section = ['overview_cliente', 'diretrizes_tecnicas'].includes(req.query.section)
    ? req.query.section
    : 'all';

  const { data, auditData } = parseSlideBody(body);

  if (!data || (!data.overview_cliente && !data.diretrizes_tecnicas)) {
    return res.status(400).json({
      error: 'Body inválido. Envie o JSON com os campos overview_cliente e/ou diretrizes_tecnicas.',
    });
  }

  let template;
  try {
    template = fs.readFileSync(SLIDES_TEMPLATE, 'utf8');
  } catch {
    return res.status(500).json({ error: 'Template de slides não encontrado no servidor.' });
  }

  const injection = auditData
    ? `<script>window.__MARKETING_DATA__=${JSON.stringify(data)};window.__AUDIT_DATA__=${JSON.stringify(auditData)};window.__SECTION__=${JSON.stringify(section)};</script>`
    : `<script>window.__MARKETING_DATA__=${JSON.stringify(data)};window.__SECTION__=${JSON.stringify(section)};</script>`;

  const anchor = template.includes('</head>') ? '</head>' : '<style>';
  const html   = template.replace(anchor, injection + anchor);

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="relatorio-marketing.html"');
  res.setHeader('Cache-Control', 'no-store');
  res.send(html);
});

// ═════════════════════════════════════════════════════════════════════════════
// 8b. INFOGRÁFICO — EXPORTAR PDF
//
//  POST /api/slides/pdf?section=overview_cliente&orientation=portrait
//
//  Mesmos parâmetros de /api/slides.
//  Retorna application/pdf diretamente (pronto para download ou redirect).
// ═════════════════════════════════════════════════════════════════════════════

app.post('/api/slides/pdf', async (req, res) => {
  const { data, auditData } = parseSlideBody(req.body);
  const section     = ['overview_cliente', 'diretrizes_tecnicas'].includes(req.query.section)
    ? req.query.section : 'all';
  const orientation = req.query.orientation === 'portrait' ? 'portrait' : 'landscape';
  const isLandscape = orientation === 'landscape';

  if (!data || (!data.overview_cliente && !data.diretrizes_tecnicas)) {
    return res.status(400).json({ error: 'Body inválido. Envie o JSON com overview_cliente e/ou diretrizes_tecnicas.' });
  }

  let template;
  try {
    template = fs.readFileSync(SLIDES_TEMPLATE, 'utf8');
  } catch {
    return res.status(500).json({ error: 'Template de slides não encontrado no servidor.' });
  }

  const injection = auditData
    ? `<script>window.__MARKETING_DATA__=${JSON.stringify(data)};window.__AUDIT_DATA__=${JSON.stringify(auditData)};window.__SECTION__=${JSON.stringify(section)};</script>`
    : `<script>window.__MARKETING_DATA__=${JSON.stringify(data)};window.__SECTION__=${JSON.stringify(section)};</script>`;
  const anchor    = template.includes('</head>') ? '</head>' : '<style>';
  const html      = template.replace(anchor, injection + anchor);

  const tmpPath = path.join(os.tmpdir(), `slides_${Date.now()}.html`);
  fs.writeFileSync(tmpPath, html, 'utf8');
  try {
    const pdfBuf = await chromeOneShotPdf(tmpPath);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="radar-marketing.pdf"');
    res.send(pdfBuf);
  } catch (err) {
    console.error('[slides/pdf]', err.message);
    res.status(500).json({ error: 'Falha ao gerar PDF', detail: err.message });
  } finally {
    try { fs.unlinkSync(tmpPath); } catch (_) {}
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// 8c. HTML → PDF
//
//  POST /api/html-to-pdf?orientation=landscape
//  Content-Type: text/html  (body = HTML raw)
//  x-api-key: <API_SECRET>
//  Retorna application/pdf
// ═════════════════════════════════════════════════════════════════════════════

app.post('/api/html-to-pdf', express.text({ type: 'text/html', limit: '20mb' }), async (req, res) => {
  if (req.headers['x-api-key'] !== process.env.API_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const externalUrl = req.query.url || null;
  const html = req.body;

  if (!externalUrl && (!html || html.trim().length === 0)) {
    return res.status(400).json({ error: 'Informe ?url=https://... ou envie HTML no body com Content-Type: text/html.' });
  }

  const orientation = req.query.orientation === 'portrait' ? 'portrait' : 'landscape';
  const isLandscape = orientation === 'landscape';
  const useA4       = req.query.format === 'A4';

  // Para URLs externas: baixa o HTML antes de converter
  let finalHtml = html;
  if (externalUrl) {
    try {
      const resp = await axios.get(externalUrl, { responseType: 'text', timeout: 30000 });
      finalHtml = resp.data;
    } catch (e) {
      return res.status(400).json({ error: 'Falha ao buscar URL', detail: e.message });
    }
  }

  // Injeta @page CSS se não houver: controla tamanho e orientação
  if (!finalHtml.includes('@page')) {
    const pageSize = useA4
      ? `A4 ${isLandscape ? 'landscape' : 'portrait'}`
      : (isLandscape ? '1920px 1080px' : '1080px 1920px');
    const pageStyle = `<style>@page{size:${pageSize};margin:0}body{margin:0}</style>`;
    finalHtml = finalHtml.replace(/<head>|<html>/, m => m + pageStyle);
    if (!finalHtml.includes(pageStyle)) finalHtml = pageStyle + finalHtml;
  }

  let fileName = 'documento';
  if (externalUrl) {
    try { fileName = new URL(externalUrl).hostname.replace(/\./g, '_'); } catch (_) {}
  }

  const tmpPath = path.join(os.tmpdir(), `html2pdf_${Date.now()}.html`);
  fs.writeFileSync(tmpPath, finalHtml, 'utf8');
  try {
    const pdfBuf = await chromeOneShotPdf(tmpPath);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}.pdf"`);
    res.end(pdfBuf);
  } catch (err) {
    console.error('[html-to-pdf]', err.message);
    res.status(500).json({ error: 'Falha ao gerar PDF', detail: err.message });
  } finally {
    try { fs.unlinkSync(tmpPath); } catch (_) {}
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// 8d. ANALISAR LANDING PAGE
//
//  POST /api/lp/analyze
//  x-api-key: <API_SECRET>
//  Body JSON: { url: "https://...", screenshot: true }
//
//  Retorna JSON com título, meta, texto limpo, links, vídeos,
//  tempo de carregamento e screenshot em base64 (opcional).
// ═════════════════════════════════════════════════════════════════════════════

app.post('/api/lp/analyze', async (req, res) => {
  if (req.headers['x-api-key'] !== process.env.API_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { url, screenshot = false } = req.body || {};
  if (!url || url === 'about:blank') {
    return res.json({ ok: true, _skip: true, url, url_final: url });
  }

  let browser;
  try {
    browser = await launchBrowser();

    const page = await browser.newPage();
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.setExtraHTTPHeaders({ 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36' });

    // Bloqueia recursos pesados desnecessários (fontes, imagens grandes)
    await page.route('**/*', (route) => {
      const type = route.request().resourceType();
      if (['font', 'media'].includes(type)) route.abort();
      else route.continue();
    });

    const t0 = Date.now();
    await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 });
    const load_time_ms = Date.now() - t0;
    const url_final = page.url();

    // Extrai dados via evaluate no browser
    const pageData = await page.evaluate(() => {
      // Título e meta
      const title = document.title || '';
      const metaDesc = document.querySelector('meta[name="description"]')?.content || '';
      const metaOgTitle = document.querySelector('meta[property="og:title"]')?.content || '';
      const metaOgDesc = document.querySelector('meta[property="og:description"]')?.content || '';
      const metaOgImage = document.querySelector('meta[property="og:image"]')?.content || '';

      // Texto limpo (sem scripts/styles)
      const clone = document.body?.cloneNode(true);
      clone?.querySelectorAll('script, style, noscript, svg').forEach(el => el.remove());
      const text = (clone?.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 5000);

      // Links externos
      const links = [];
      document.querySelectorAll('a[href]').forEach(a => {
        const href = a.href;
        if (href && /^https?:\/\//.test(href) && href !== window.location.href) {
          links.push({ href, text: (a.innerText || a.textContent || '').trim().slice(0, 100) });
        }
      });
      // Deduplicar links por href
      const linksUniq = [...new Map(links.map(l => [l.href, l])).values()].slice(0, 50);

      // Vídeos
      const videos = [];
      document.querySelectorAll('video source, video[src]').forEach(el => {
        const src = el.src || el.getAttribute('src');
        if (src) videos.push({ type: 'html5', src });
      });
      document.querySelectorAll('iframe[src]').forEach(el => {
        const src = el.src;
        if (/youtube\.com|youtu\.be/.test(src)) videos.push({ type: 'youtube', src });
        else if (/vimeo\.com/.test(src))         videos.push({ type: 'vimeo', src });
        else if (/wistia\.com/.test(src))        videos.push({ type: 'wistia', src });
      });

      return { title, meta: { description: metaDesc, og_title: metaOgTitle, og_description: metaOgDesc, og_image: metaOgImage }, text, links: linksUniq, videos };
    });

    // Screenshot opcional (PNG base64)
    let screenshot_base64 = null;
    if (screenshot) {
      const scBuf = await page.screenshot({ type: 'png', fullPage: false });
      screenshot_base64 = Buffer.from(scBuf).toString('base64');
    }

    await browser.close(); browser = null;

    return res.json({
      ok: true,
      url,
      url_final,
      load_time_ms,
      ...pageData,
      screenshot_base64,
    });

  } catch (err) {
    if (browser) await browser.close().catch(() => {});
    console.error('[lp/analyze]', err.message);
    return res.json({ ok: false, url, error: err.message });
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// 9. VIDEO INFO — extrai metadados e URL de download via yt-dlp
//
//  POST /api/video-info
//  x-api-key: <API_SECRET>
//  Body JSON: { url: "https://...", tipo: "instagram|tiktok|youtube" }
//
//  Retorna: { ok, link_download, duracao_segundos, legenda, titulo, tipo }
//  Se duracao_segundos > 120 → ok: false, motivo: "video_longo"
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Busca metadados e URL de download via RapidAPI (social-download-all-in-one).
 * Suporta Instagram, TikTok, YouTube, Twitter/X sem bloqueio de IP.
 * Retorna: { title, duration, thumbnail, medias[], source }
 */
async function rapidapiVideoInfo(url) {
  const RAPIDAPI_KEY  = process.env.RAPIDAPI_KEY || '0127634a29msh4a303edef58f6dbp1430c6jsnd00af7a6bc1e';
  const RAPIDAPI_HOST = 'social-download-all-in-one.p.rapidapi.com';

  const resp = await axios.post(
    `https://${RAPIDAPI_HOST}/v1/social/autolink`,
    { url },
    {
      headers: {
        'X-Rapidapi-Key':  RAPIDAPI_KEY,
        'X-Rapidapi-Host': RAPIDAPI_HOST,
        'Content-Type':    'application/json',
      },
      timeout: 20000,
    }
  );

  const data = resp.data;
  if (!data || data.message === 'Too many requests') {
    throw new Error('RapidAPI rate limit atingido. Tente novamente em alguns segundos.');
  }
  if (!data.medias || data.medias.length === 0) {
    throw new Error('Nenhuma mídia encontrada para esse link.');
  }

  return data;
}

/**
 * Seleciona a melhor URL de download para extração de áudio.
 * Prioridade: áudio puro → menor vídeo com áudio → qualquer mídia.
 */
function selecionarUrlAudio(medias) {
  // 1. Áudio puro (is_audio: true)
  const audioOnly = medias.find(m => m.is_audio === true && m.url);
  if (audioOnly) return audioOnly.url;

  // 2. Menor vídeo que tenha áudio (audioQuality não nulo)
  const comAudio = medias
    .filter(m => m.url && m.audioQuality && m.type === 'video')
    .sort((a, b) => (a.width || 9999) - (b.width || 9999));
  if (comAudio.length > 0) return comAudio[0].url;

  // 3. Qualquer URL disponível
  const qualquer = medias.find(m => m.url);
  return qualquer ? qualquer.url : null;
}

/**
 * Extrai áudio de uma URL de vídeo direta (CDN) usando ffmpeg.
 * Muito mais confiável que yt-dlp -x para CDN URLs (Instagram, TikTok, etc.)
 * Retorna o caminho do arquivo mp3 temporário gerado.
 */
function ffmpegExtractAudio(cdnUrl) {
  return new Promise((resolve, reject) => {
    const tmpPath = path.join(os.tmpdir(), `radar_audio_${Date.now()}_${Math.random().toString(36).slice(2)}.mp3`);

    // ffmpeg lê o stream direto da URL CDN, extrai só o áudio, converte para mp3 mono 16kHz
    // -ss 0 -t 180 limita a 3 min por segurança; -vn ignora a faixa de vídeo
    const cmd = `ffmpeg -y -i "${cdnUrl}" -vn -ar 16000 -ac 1 -b:a 64k -t 180 "${tmpPath}"`;

    exec(cmd, { timeout: 90000 }, (err, stdout, stderr) => {
      if (err) return reject(new Error(stderr || err.message));
      resolve(tmpPath);
    });
  });
}

/**
 * Transcreve um arquivo de áudio via OpenAI Whisper.
 * Remove o arquivo temporário após a transcrição.
 */
async function transcreveAudio(filePath) {
  try {
    const transcription = await openai.audio.transcriptions.create({
      file:     fs.createReadStream(filePath),
      model:    'whisper-1',
      language: 'pt',
    });
    return transcription.text || '';
  } finally {
    // Sempre limpa o arquivo temporário, mesmo se der erro
    try { fs.unlinkSync(filePath); } catch (_) {}
  }
}

app.post('/api/video-info', async (req, res) => {
  const { url, tipo, transcribe } = req.body || {};

  if (!url) {
    return res.status(400).json({ ok: false, motivo: 'url_ausente' });
  }

  const MAX_DURACAO = parseInt(process.env.VIDEO_MAX_SECONDS || '120', 10);

  try {
    // 1. Busca metadados e links via RapidAPI
    let info;
    try {
      info = await rapidapiVideoInfo(url);
    } catch (e) {
      console.error('[video-info] RapidAPI error:', e.message);
      return res.status(422).json({
        ok: false,
        motivo: 'erro_extracao',
        detalhe: e.message.slice(0, 300),
      });
    }

    const titulo  = info.title || info.fulltitle || '';
    const legenda = info.description || '';

    // Duração: se vier > 3600s provavelmente é metadata errado (Facebook, etc.)
    // Nesse caso trata como desconhecida (0) e deixa passar
    const duracaoBruta     = Math.round(info.duration || 0);
    const duracao_segundos = duracaoBruta > 3600 ? 0 : duracaoBruta;

    // 2. Verifica duração máxima permitida (só bloqueia se soubermos a duração real)
    if (duracao_segundos > 0 && duracao_segundos > MAX_DURACAO) {
      return res.json({
        ok: false,
        motivo: 'video_longo',
        duracao_segundos,
        titulo,
        mensagem: `O vídeo tem ${Math.ceil(duracao_segundos / 60)} minuto(s). Só analiso vídeos de até ${Math.ceil(MAX_DURACAO / 60)} minuto(s). 🎬`,
      });
    }

    // 3. Seleciona URL de áudio puro (ou menor vídeo com áudio) das mídias da RapidAPI
    const link_audio = selecionarUrlAudio(info.medias || []);

    // 4. Retorna metadados + URL de áudio (sem download, sem Whisper)
    return res.json({
      ok:            true,
      link_audio,                               // URL direta de áudio puro (pronto para Whisper)
      duracao_segundos,
      titulo,
      legenda:       (info.description || '').slice(0, 2000),
      autor:         info.author || info.source || '',
      tipo:          tipo || info.source || 'desconhecido',
      thumbnail:     info.thumbnail || '',
    });

  } catch (err) {
    console.error('[video-info] Erro geral:', err.message);
    return res.status(500).json({
      ok: false,
      motivo: 'erro_interno',
      detalhe: err.message,
    });
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// 10c. DOWNLOAD BASE64 — baixa qualquer URL e devolve o arquivo em base64
//
//  POST /api/download-base64
//  x-api-key: <API_SECRET>
//  Body JSON: { url: "https://...", mime: "audio/mp4" }
//
//  Aceita tanto URLs diretas (CDN) quanto URLs originais (youtube.com, instagram.com, etc).
//  Se o download direto falhar com 403 (CDN IP-locked), usa yt-dlp para obter
//  uma URL fresca assinada para o IP do servidor, depois baixa.
//
//  mime (opcional) — usado no data URI retornado (default: application/octet-stream)
//  Retorna: { ok, base64, mime, bytes, data_uri }
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Usa yt-dlp para extrair a melhor URL de áudio de uma URL de vídeo social.
 * Retorna a URL CDN fresca (assinada para o IP do servidor).
 */
function ytdlpGetAudioUrl(videoUrl) {
  return new Promise((resolve, reject) => {
    // -f bestaudio: áudio puro de menor tamanho
    // --get-url: imprime só a URL, sem baixar
    // --no-playlist: não expande playlists
    const cmd = `yt-dlp -f bestaudio --get-url --no-playlist --js-runtimes node "${videoUrl}"`;
    exec(cmd, { timeout: 30000 }, (err, stdout, stderr) => {
      if (err) return reject(new Error((stderr || err.message).slice(0, 300)));
      const url = stdout.trim().split('\n')[0];
      if (!url) return reject(new Error('yt-dlp não retornou URL'));
      resolve(url);
    });
  });
}

app.post('/api/download-base64', async (req, res) => {
  const { url, mime = 'application/octet-stream' } = req.body || {};

  if (!url) return res.status(400).json({ ok: false, motivo: 'url ausente' });

  // Detecta se é URL de plataforma social (vai precisar de yt-dlp)
  const isSocialUrl = /instagram\.com|tiktok\.com|youtube\.com|youtu\.be|facebook\.com|fb\.watch/i.test(url);

  async function downloadDirect(targetUrl) {
    const resp = await axios.get(targetUrl, {
      responseType: 'arraybuffer',
      timeout: 90000,
      maxContentLength: 50 * 1024 * 1024,
      maxRedirects: 10,
      headers: {
        'User-Agent':      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept':          '*/*',
        'Accept-Encoding': 'identity',
        'Referer':         'https://www.youtube.com/',
      },
    });
    return resp;
  }

  try {
    let buffer, mimeReal;

    if (isSocialUrl) {
      // URL social → yt-dlp gera CDN URL fresca para o IP do servidor
      console.log(`[download-base64] URL social detectada, usando yt-dlp: ${url.slice(0, 60)}...`);
      let cdnUrl;
      try {
        cdnUrl = await ytdlpGetAudioUrl(url);
      } catch (ytErr) {
        console.error('[download-base64] yt-dlp falhou:', ytErr.message);
        return res.status(422).json({ ok: false, motivo: 'yt-dlp falhou', detalhe: ytErr.message });
      }
      const resp = await downloadDirect(cdnUrl);
      buffer   = Buffer.from(resp.data);
      mimeReal = resp.headers['content-type']?.split(';')[0] || mime;

    } else {
      // URL direta (CDN) → tenta download direto
      let resp;
      try {
        resp = await downloadDirect(url);
      } catch (err) {
        const status = err.response?.status;
        // Se 403 e parece URL de googlevideo, não tem como contornar sem a URL original
        if (status === 403 && url.includes('googlevideo.com')) {
          return res.status(422).json({
            ok: false,
            motivo: 'cdn_ip_locked',
            detalhe: 'URL do Google Video é assinada para outro IP. Envie a URL original do YouTube (youtube.com/watch ou youtu.be) em vez da URL do CDN.',
          });
        }
        throw err;
      }
      buffer   = Buffer.from(resp.data);
      mimeReal = resp.headers['content-type']?.split(';')[0] || mime;
    }

    const base64 = buffer.toString('base64');
    console.log(`[download-base64] OK → ${buffer.length} bytes, mime: ${mimeReal}`);

    return res.json({
      ok:       true,
      base64,
      mime:     mimeReal,
      bytes:    buffer.length,
      data_uri: `data:${mimeReal};base64,${base64}`,
    });

  } catch (err) {
    console.error('[download-base64] Erro:', err.message);
    return res.status(500).json({ ok: false, motivo: err.message.slice(0, 300) });
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// 10b. TRANSCRIÇÃO — baixa URL de áudio CDN e transcreve via Whisper
//
//  POST /api/transcribe
//  x-api-key: <API_SECRET>
//  Body JSON: { link_audio: "https://...", idioma: "pt" }
//
//  Retorna: { ok, transcricao, chars, duracao_ms }
// ═════════════════════════════════════════════════════════════════════════════
app.post('/api/transcribe', async (req, res) => {
  const { link_audio, idioma = 'pt' } = req.body || {};

  if (!link_audio) {
    return res.status(400).json({ ok: false, motivo: 'link_audio ausente' });
  }

  const t0 = Date.now();
  let tmpPath;

  try {
    // 1. Baixa e converte para mp3 mono 16kHz via ffmpeg
    tmpPath = await ffmpegExtractAudio(link_audio);

    // 2. Transcreve via Whisper (apaga o arquivo ao final)
    const transcricao = await transcreveAudio(tmpPath);
    tmpPath = null; // já foi apagado dentro de transcreveAudio

    const duracao_ms = Date.now() - t0;
    console.log(`[transcribe] ${link_audio.slice(0, 60)}... → ${transcricao.length} chars em ${duracao_ms}ms`);

    return res.json({
      ok: true,
      transcricao,
      chars:       transcricao.length,
      duracao_ms,
    });

  } catch (err) {
    // Garante limpeza se transcreveAudio não apagou
    if (tmpPath) try { fs.unlinkSync(tmpPath); } catch (_) {}

    console.error('[transcribe] Erro:', err.message);
    return res.status(500).json({
      ok:     false,
      motivo: 'erro_transcricao',
      detalhe: err.message.slice(0, 300),
    });
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// 7. WEBHOOK — CONFIRMAÇÃO DE PAGAMENTO (Stripe/Kiwify)
// ═════════════════════════════════════════════════════════════════════════════

app.post('/api/webhook/pagamento', express.raw({ type: 'application/json' }), async (req, res) => {
  // Validar assinatura Stripe
  let event;
  try {
    const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
    event = stripe.webhooks.constructEvent(
      req.body,
      req.headers['stripe-signature'],
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const handle  = session.metadata?.handle;

    console.log(`[webhook] Pagamento confirmado para @${handle}`);

    // Aqui você notifica o Typebot via API deles para avançar o fluxo
    // ou usa o sistema de sessão da plataforma escolhida
    // Exemplo com Typebot Start Session API:
    if (process.env.TYPEBOT_API_URL && handle) {
      await axios.post(`${process.env.TYPEBOT_API_URL}/api/v1/sendMessage`, {
        typebotId: process.env.TYPEBOT_ID,
        sessionId: handle,
        message:   'PAGAMENTO_CONFIRMADO',
      }).catch(e => console.error('[typebot notify]', e.message));
    }
  }

  res.json({ received: true });
});

// ═════════════════════════════════════════════════════════════════════════════

const PORT = process.env.PORT || 3000;
// ═════════════════════════════════════════════════════════════════════════════
// 10. UPLOAD DE COOKIES — salva arquivo cookies.txt para uso do yt-dlp
//
//  POST /api/upload-cookies
//  x-api-key: <API_SECRET>
//  Content-Type: text/plain  (cole o conteúdo do cookies.txt no body)
//
//  Salva em /app/cookies.txt e define YTDLP_COOKIES_FILE automaticamente.
// ═════════════════════════════════════════════════════════════════════════════
app.post('/api/upload-cookies', (req, res) => {
  if (req.headers['x-api-key'] !== process.env.API_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const cookiesPath = '/app/cookies.txt';
  let body = '';

  req.on('data', chunk => { body += chunk.toString(); });
  req.on('end', () => {
    if (!body.trim() || !body.includes('Netscape HTTP Cookie File')) {
      return res.status(400).json({ ok: false, erro: 'Arquivo inválido. Exporte no formato Netscape (cookies.txt).' });
    }
    try {
      fs.writeFileSync(cookiesPath, body, 'utf8');
      process.env.YTDLP_COOKIES_FILE = cookiesPath;
      const linhas = body.split('\n').filter(l => l.trim() && !l.startsWith('#')).length;
      console.log(`[cookies] Salvo ${linhas} cookies em ${cookiesPath}`);
      res.json({ ok: true, path: cookiesPath, cookies: linhas });
    } catch (e) {
      res.status(500).json({ ok: false, erro: e.message });
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 11. PAGE TEXT — abre URL no Chromium e retorna texto do DOM
//
//  POST /api/page-text
//  x-api-key: <API_SECRET>
//  Body JSON: { url: "https://...", wait_ms: 2000, selector: "article" }
//
//  wait_ms    (opcional) — ms para aguardar após load (default 1500)
//  selector   (opcional) — seletor CSS para extrair texto de elemento específico
//                          ex: "article", "main", ".content" (default: body)
//
//  Retorna: { ok, url, texto, chars, titulo }
// ═════════════════════════════════════════════════════════════════════════════
app.post('/api/page-text', async (req, res) => {
  if (req.headers['x-api-key'] !== process.env.API_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { url, wait_ms = 1500, selector = 'body' } = req.body || {};

  if (!url) return res.status(400).json({ ok: false, erro: 'url obrigatória' });

  let browser;
  try {
    browser = await launchBrowser(['--window-size=1280,800']);

    const page = await browser.newPage();

    // User-agent de browser real para contornar bloqueios básicos
    await page.setExtraHTTPHeaders({ 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36' });
    await page.setViewportSize({ width: 1280, height: 800 });

    // Bloqueia imagens, fontes e CSS para carregar mais rápido
    await page.route('**/*', (route) => {
      if (['image', 'font', 'stylesheet', 'media'].includes(route.request().resourceType())) {
        route.abort();
      } else {
        route.continue();
      }
    });

    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

    // Aguarda conteúdo dinâmico (JS que renderiza após load)
    if (wait_ms > 0) await new Promise(r => setTimeout(r, Math.min(wait_ms, 5000)));

    // Extrai título e texto do seletor escolhido
    const { titulo, texto } = await page.evaluate((sel) => {
      const el = document.querySelector(sel) || document.body;
      // Remove scripts, styles e elementos ocultos do texto
      const clone = el.cloneNode(true);
      clone.querySelectorAll('script, style, noscript, [aria-hidden="true"]').forEach(e => e.remove());
      const texto = (clone.innerText || clone.textContent || '')
        .replace(/\n{3,}/g, '\n\n')   // colapsa linhas em branco múltiplas
        .replace(/[ \t]{2,}/g, ' ')   // colapsa espaços múltiplos
        .trim();
      return { titulo: document.title || '', texto };
    }, selector);

    await browser.close();

    console.log(`[page-text] ${url} → ${texto.length} chars`);

    return res.json({
      ok:    true,
      url,
      titulo,
      texto: texto.slice(0, 50000), // limita a 50k chars (~37k tokens)
      chars: texto.length,
    });

  } catch (err) {
    if (browser) await browser.close().catch(() => {});
    console.error('[page-text] Erro:', err.message);
    return res.status(500).json({ ok: false, erro: err.message });
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// 12. SAVE ANALISE — persiste JSON completo de análise no Supabase
//
//  POST /api/save-analise
//  x-api-key: <API_SECRET>
//  Body JSON: o objeto completo gerado pelo pipeline de análise
//
//  Salva em ordem:
//   1. clientes (upsert)
//   2. concorrentes (upsert)
//   3. analises (insert)
//   4. analises_concorrentes (insert)
//   5. planos_diretores (insert)
//   6. analise_conteudo (insert — cliente + concorrentes)
//   7. metricas_semanais (insert snapshot)
//   8. hashtags_oportunidade (insert)
//   9. videos_transcritos (insert)
//  10. keywords_google (insert)
//
//  Retorna: { ok, analise_id }
// ═════════════════════════════════════════════════════════════════════════════

async function supaPost(table, payload, options = '') {
  const r = await axios.post(
    `${SUPA_URL}/rest/v1/${table}${options}`,
    payload,
    { headers: supaHeaders() }
  );
  return r.data;
}

async function supaUpsert(table, payload, onConflict) {
  const r = await axios.post(
    `${SUPA_URL}/rest/v1/${table}?on_conflict=${onConflict}`,
    payload,
    {
      headers: {
        ...supaHeaders(),
        'Prefer': 'resolution=merge-duplicates,return=representation',
      },
    }
  );
  return r.data;
}

app.post('/api/save-analise', async (req, res) => {
  const body = req.body;

  // Suporta tanto array[0] quanto objeto direto
  const raw = Array.isArray(body) ? body[0] : body;

  // Extrai as seções principais
  const pd  = raw.plano_diretor || {};
  const ov  = pd.overview_cliente || {};
  const dt  = pd.diretrizes_tecnicas || {};
  const dm  = pd.dados_metricas_perfis || {};
  const cli = dm.cliente || raw.cliente || {};
  const mp  = cli.metricas_perfil || cli.metricas || {};
  const mpp = cli.metricas_posts_resumo || cli.metricas_posts || {};

  const handle = (raw.handle_cliente || cli.handle || '').replace('@', '').toLowerCase().trim();
  if (!handle) return res.status(400).json({ ok: false, motivo: 'handle_cliente ausente' });

  try {
    // ── 1. Upsert cliente ────────────────────────────────────────────────────
    const perfil = cli.perfil || {};
    await supaUpsert('clientes', {
      handle,
      nome_completo:  perfil.full_name  || raw.nome_cliente || '',
      username:       perfil.username   || handle,
      nicho:          raw.nicho         || '',
      biografia:      perfil.biografia  || '',
      is_verificado:  perfil.is_verificado  ?? false,
      is_privado:     perfil.is_privado     ?? false,
      is_business:    perfil.is_business    ?? false,
      categoria:      perfil.categoria  || '',
      email:          perfil.contato?.email || '',
      site_externo:   perfil.links?.site_externo || '',
      atualizado_em:  new Date().toISOString(),
    }, 'handle');

    // ── 2. Upsert concorrentes ───────────────────────────────────────────────
    const concorrentes = dm.concorrentes || raw.concorrentes || [];
    for (const c of concorrentes) {
      const cp = c.perfil || {};
      await supaUpsert('concorrentes', {
        handle:        (c.handle || '').replace('@', '').toLowerCase(),
        nome_completo: cp.full_name  || '',
        nicho:         raw.nicho     || '',
        biografia:     cp.biografia  || '',
        is_verificado: cp.is_verificado ?? false,
        email:         cp.contato?.email || '',
        site_externo:  cp.links?.site_externo || '',
        atualizado_em: new Date().toISOString(),
      }, 'handle');
    }

    // ── 3. Insert analise ────────────────────────────────────────────────────
    const sc = raw.score_comparativo || {};
    const analisePayload = {
      cliente_handle:    handle,
      gerado_em:         raw.gerado_em || new Date().toISOString(),
      nicho:             raw.nicho || '',
      titulo_documento:  raw.titulo_documento || '',
      tokens_dossie:     raw.tokens_dossie   || 0,
      tokens_diretor:    raw.tokens_diretor  || 0,
      tokens_total:      raw.tokens_total    || 0,
      dossie_completo:   (raw.dossie_completo || '').slice(0, 500000),

      // Métricas do cliente
      instagram_id:     perfil.id || '',
      foto_perfil:      perfil.foto_perfil    || cli.foto_perfil    || '',
      foto_perfil_hd:   perfil.foto_perfil_hd || cli.foto_perfil_hd || '',
      seguidores:       mp.seguidores  || 0,
      seguindo:         mp.seguindo    || 0,
      qtd_posts:        mp.qtd_posts   || 0,
      qtd_reels:        mp.qtd_reels   || 0,
      ratio_seguidor:   mp.ratio_seguidor_seguindo || 0,
      tem_destaques:    mp.tem_destaques ?? false,
      taxa_engajamento: parseFloat(mpp.taxa_engajamento || 0),
      media_curtidas:   mpp.media_curtidas   || 0,
      media_comentarios:mpp.media_comentarios|| 0,
      media_views:      mpp.media_views      || 0,
      mix_reels_pct:    mpp.mix_formatos?.reels_pct     || 0,
      mix_carrossel_pct:mpp.mix_formatos?.carrossel_pct || 0,
      mix_foto_pct:     mpp.mix_formatos?.foto_pct      || 0,
      score_comparativo: sc,
    };

    const [analise] = await supaPost('analises', analisePayload, '?select=id');
    const analise_id = analise.id;

    // ── 4. Insert analises_concorrentes ──────────────────────────────────────
    for (const c of concorrentes) {
      const cmp  = c.metricas_perfil  || c.perfil?.metricas || {};
      const cmpp = c.metricas_posts   || {};
      const cp   = c.perfil || {};
      await supaPost('analises_concorrentes', {
        analise_id,
        concorrente_handle: (c.handle || '').replace('@', '').toLowerCase(),
        foto_perfil:        cp.foto_perfil    || c.foto_perfil    || '',
        biografia:          cp.biografia      || '',
        seguidores:         cmp.seguidores    || 0,
        seguindo:           cmp.seguindo      || 0,
        qtd_posts:          cmp.qtd_posts     || 0,
        qtd_reels:          cmp.qtd_reels     || 0,
        ratio_seguidor:     cmp.ratio_seguidor_seguindo || 0,
        tem_destaques:      cmp.tem_destaques ?? false,
        taxa_engajamento:   parseFloat(cmpp.taxa_engajamento || 0),
        media_curtidas:     cmpp.media_curtidas    || 0,
        media_comentarios:  cmpp.media_comentarios || 0,
        media_views:        cmpp.media_views       || 0,
        mix_reels_pct:      cmpp.mix_formatos?.reels_pct     || 0,
        mix_carrossel_pct:  cmpp.mix_formatos?.carrossel_pct || 0,
        mix_foto_pct:       cmpp.mix_formatos?.foto_pct      || 0,
        ganchos_top:        c.ganchos_top || null,
        top_posts:          (c.top_3_melhores_posts || c.top_posts || []).slice(0, 5),
      });
    }

    // ── 5. Insert plano_diretor ──────────────────────────────────────────────
    await supaPost('planos_diretores', {
      analise_id,
      cliente_handle:          handle,
      diagnostico_identidade:  ov.diagnostico_identidade  || '',
      posicionamento_atual:    ov.posicionamento_atual     || '',
      pontos_fortes:           ov.pontos_fortes            || [],
      pontos_fracos:           ov.pontos_fracos            || [],
      carta_para_cliente:      ov.carta_para_cliente_markdown || '',
      previsao_30_dias:        ov.previsao_resultados?.['30_dias'] || '',
      previsao_60_dias:        ov.previsao_resultados?.['60_dias'] || '',
      previsao_90_dias:        ov.previsao_resultados?.['90_dias'] || '',
      caminhos_crescimento:    ov.caminhos_de_crescimento  || [],
      comparativo_concorrentes:ov.comparativo_concorrentes || [],
      tom_de_voz:              dt.tom_de_voz               || {},
      seo_instagram:           dt.seo_instagram            || {},
      frequencia_publicacao:   dt.frequencia_publicacao    || {},
      pilares_conteudo:        dt.pilares_conteudo         || [],
      assuntos_quentes:        dt.assuntos_quentes         || [],
      ideias_titulos:          dt.ideias_de_titulos        || [],
      ganchos_modelo:          dt.ganchos_modelo           || [],
      ctas_recomendados:       dt.ctas_recomendados        || [],
      hashtags_estrategicas:   dt.hashtags_estrategicas    || {},
      identidade_visual:       dt.identidade_visual        || {},
      stories_recorrentes:     dt.stories_recorrentes      || [],
      kpis_acompanhar:         dt.kpis_acompanhar          || [],
      briefing_redatores:      dt.briefing_redatores       || '',
      briefing_designers:      dt.briefing_designers       || '',
      calendario_30_dias:      dt.calendario_30_dias       || [],
    });

    // ── 6. Insert analise_conteudo (cliente + concorrentes) ──────────────────
    const ac = raw.analise_conteudo || {};
    const acEntries = [
      ...(ac.cliente ? [{ ...ac.cliente, tipo: 'cliente' }] : []),
      ...(ac.concorrentes || []).map(c => ({ ...c, tipo: 'concorrente' })),
    ];
    for (const entry of acEntries) {
      await supaPost('analise_conteudo', {
        analise_id,
        handle:                        (entry.handle || '').replace('@', '').toLowerCase(),
        tipo:                          entry.tipo,
        ganchos_top:                   entry.ganchos_top           || [],
        hashtags_frequentes:           entry.hashtags_frequentes   || [],
        cta_dominante:                 entry.cta_dominante         || '',
        comprimento_legenda_media_todos: entry.comprimento_legenda_media_todos || 0,
        comprimento_legenda_media_top:   entry.comprimento_legenda_media_top   || 0,
        temas_pilares:                 entry.temas_pilares         || [],
      });
    }

    // ── 7. Insert metricas_semanais (snapshot) ───────────────────────────────
    await supaPost('metricas_semanais', {
      cliente_handle:    handle,
      analise_id,
      capturado_em:      raw.gerado_em || new Date().toISOString(),
      seguidores:        mp.seguidores  || 0,
      seguindo:          mp.seguindo    || 0,
      qtd_posts:         mp.qtd_posts   || 0,
      qtd_reels:         mp.qtd_reels   || 0,
      ratio_seguidor:    mp.ratio_seguidor_seguindo || 0,
      tem_destaques:     mp.tem_destaques ?? false,
      taxa_engajamento:  parseFloat(mpp.taxa_engajamento || 0),
      media_curtidas:    mpp.media_curtidas    || 0,
      media_comentarios: mpp.media_comentarios || 0,
      media_views:       mpp.media_views       || 0,
      reels_pct:         mpp.mix_formatos?.reels_pct     || 0,
      carrossel_pct:     mpp.mix_formatos?.carrossel_pct || 0,
      foto_pct:          mpp.mix_formatos?.foto_pct      || 0,
      score_comparativo: sc,
      hashtags_oportunidade: raw.hashtags_oportunidade || [],
    });

    // ── 8. Insert hashtags_oportunidade ──────────────────────────────────────
    const hashtags = raw.hashtags_oportunidade || [];
    if (hashtags.length > 0) {
      await supaPost('hashtags_oportunidade',
        hashtags.map(h => ({
          analise_id,
          hashtag:               h.hashtag || h,
          freq_entre_concorrentes: h.freq_entre_concorrentes || 0,
        }))
      );
    }

    // ── 9. Insert videos_transcritos ─────────────────────────────────────────
    const videos = raw.videos_transcritos || [];
    for (const v of videos) {
      await supaPost('videos_transcritos', {
        analise_id,
        handle:      (v.handle || '').replace('@', '').toLowerCase(),
        shortcode:   (v.link_post || '').match(/\/p\/([^/]+)/)?.[1] || null,
        legenda:     (v.legenda || '').slice(0, 5000),
        curtidas:    v.curtidas   || 0,
        comentarios: v.comentarios || 0,
        engajamento: v.engajamento || 0,
        transcricao: (v.transcricao || '').slice(0, 50000),
      }).catch(e => console.warn('[save-analise] video_transcrito skip:', e.response?.data || e.message));
    }

    // ── 10. Insert keywords_google ───────────────────────────────────────────
    const keywords = raw.keywords_google || [];
    if (keywords.length > 0) {
      await supaPost('keywords_google',
        keywords.map(k => ({
          analise_id,
          titulo:  k.titulo  || '',
          snippet: k.snippet || '',
        }))
      );
    }

    console.log(`[save-analise] @${handle} salvo — analise_id: ${analise_id}`);
    return res.json({ ok: true, analise_id, handle });

  } catch (err) {
    const detail = err.response?.data || err.message;
    console.error('[save-analise] Erro:', detail);
    return res.status(500).json({ ok: false, motivo: 'erro_ao_salvar', detalhe: detail });
  }
});

// ═════════════════════════════════════════════════════════════════════════════
//  POST /api/save-roteiros
//  x-api-key: <API_SECRET>
//  Body: { handle_cliente, nicho, roteiros_virais_10: [...] }
//
//  Salva os 10 roteiros virais gerados pelo pipeline de auditoria.
//  Busca o analise_id mais recente do cliente para linkar.
//  Retorna: { ok, roteiro_id }
// ═════════════════════════════════════════════════════════════════════════════
app.post('/api/save-roteiros', async (req, res) => {
  const body = Array.isArray(req.body) ? req.body[0] : req.body;
  const handle = (body.handle_cliente || '').replace('@', '').toLowerCase().trim();
  const roteiros = body.roteiros_virais_10 || [];

  if (!handle) return res.status(400).json({ ok: false, motivo: 'handle_cliente ausente' });
  if (!roteiros.length) return res.status(400).json({ ok: false, motivo: 'roteiros_virais_10 vazio' });

  try {
    // Busca analise_id mais recente para linkar (pode ser null se save-analise ainda não rodou)
    let analise_id = null;
    try {
      const r = await axios.get(
        `${SUPA_URL}/rest/v1/analises?cliente_handle=eq.${handle}&order=criado_em.desc&limit=1&select=id`,
        { headers: supaHeaders() }
      );
      analise_id = r.data?.[0]?.id || null;
    } catch (_) {}

    const [row] = await supaPost('roteiros_virais', {
      analise_id,
      cliente_handle: handle,
      nicho:          body.nicho || '',
      roteiros:       roteiros,
    }, '?select=id');

    console.log(`[save-roteiros] @${handle} — ${roteiros.length} roteiros salvos, id: ${row?.id}`);
    return res.json({ ok: true, roteiro_id: row?.id, handle, qtd: roteiros.length });

  } catch (err) {
    const detail = err.response?.data || err.message;
    console.error('[save-roteiros] Erro:', detail);
    return res.status(500).json({ ok: false, motivo: 'erro_ao_salvar_roteiros', detalhe: detail });
  }
});

// ═════════════════════════════════════════════════════════════════════════════
//  POST /api/salvar-analise-pendente
//  Salva análise de vídeo aguardando aprovação do cliente.
//  Campos: phone, handle, nome_cliente, analise_texto, titulo_video
// ═════════════════════════════════════════════════════════════════════════════
app.post('/api/salvar-analise-pendente', async (req, res) => {
  const body = Array.isArray(req.body) ? req.body[0] : req.body;
  const phone         = (body.phone        || '').replace(/\D/g, '').trim();
  const handle        = (body.handle       || '').replace('@', '').toLowerCase().trim();
  const nome          = (body.nome_cliente || body.nome || '').trim();
  const analise       = (body.analise_texto || '').trim();
  const roteiroFalas  = (body.roteiro_falas || '').trim();
  const titulo        = (body.titulo || body.titulo_video || 'Análise de Vídeo').trim();

  let roteiroEstruturado = null;
  if (body.roteiro_estruturado) {
    roteiroEstruturado = typeof body.roteiro_estruturado === 'string'
      ? (() => { try { return JSON.parse(body.roteiro_estruturado); } catch (_) { return null; } })()
      : body.roteiro_estruturado;
  }

  if (!phone)   return res.status(400).json({ ok: false, motivo: 'phone ausente' });
  if (!analise) return res.status(400).json({ ok: false, motivo: 'analise_texto ausente' });

  try {
    await axios.post(
      `${SUPA_URL}/rest/v1/aprovacoes_pendentes`,
      { phone, handle, nome_cliente: nome, analise_texto: analise, roteiro_falas: roteiroFalas, roteiro_estruturado: roteiroEstruturado, titulo },
      {
        headers: {
          ...supaHeaders(),
          'Prefer': 'resolution=merge-duplicates',
        },
        params: { on_conflict: 'phone' }
      }
    );
    console.log(`[salvar-analise-pendente] @${handle} (${phone}) — análise salva`);
    return res.json({ ok: true, phone, handle });
  } catch (err) {
    const detail = err.response?.data || err.message;
    console.error('[salvar-analise-pendente] Erro:', detail);
    return res.status(500).json({ ok: false, motivo: 'erro_ao_salvar', detalhe: detail });
  }
});

// ═════════════════════════════════════════════════════════════════════════════
//  POST /api/aprovar-roteiro
//  Busca análise pendente pelo phone, envia ao painel Teleprompter Firemode.
//  Campos: phone, nome_cliente (opcional), titulo (opcional)
// ═════════════════════════════════════════════════════════════════════════════
app.post('/api/aprovar-roteiro', async (req, res) => {
  const body  = Array.isArray(req.body) ? req.body[0] : req.body;
  const phone = (body.phone || '').replace(/\D/g, '').trim();

  if (!phone) return res.status(400).json({ ok: false, motivo: 'phone ausente' });

  try {
    // Busca análise pendente no Supabase
    const { data: rows } = await axios.get(
      `${SUPA_URL}/rest/v1/aprovacoes_pendentes?phone=eq.${phone}&limit=1`,
      { headers: supaHeaders() }
    );
    const pendente = rows?.[0];
    if (!pendente) {
      return res.status(404).json({ ok: false, motivo: 'nenhuma_analise_pendente' });
    }

    const titulo      = body.titulo       || pendente.titulo       || 'Análise de Vídeo';
    const nomeCLiente = body.nome_cliente || pendente.nome_cliente || '';
    const handle      = pendente.handle   || '';

    // Chama Teleprompter Firemode
    // roteiro_estruturado (quando presente) traz os hooks como opções separadas
    // para o cliente escolher/gravar individualmente no painel.
    const estrut = pendente.roteiro_estruturado || null;
    const tpPayload = {
      script: pendente.roteiro_falas || pendente.analise_texto,
      title:  titulo,
      client: {
        name:         nomeCLiente,
        phone:        `55${phone}`,
        external_ref: handle || `wa-${phone}`,
      },
    };
    if (estrut) {
      tpPayload.hooks               = estrut.hooks || [];               // [{ index, texto, recomendado }]
      tpPayload.hook_recomendado_index = estrut.hook_recomendado_index || 1;
      tpPayload.corpo               = estrut.corpo || '';                // roteiro principal, sem o hook
      tpPayload.cta                 = estrut.cta || '';                  // fala de encerramento
      tpPayload.legenda_post        = estrut.legenda_post || '';         // não usado na gravação — viaja junto pra referência
      tpPayload.headline_thumbnail  = estrut.headline_thumbnail || '';
    }

    const tpResp = await axios.post(
      'https://tp.firemode.com.br/api/integrations/sessions',
      tpPayload,
      {
        headers: {
          'Authorization': 'Bearer tp_int_3a3fb641b9a9d706f7f40b0483c7182f7acbc8c3b5cfc7e9',
          'Content-Type': 'application/json',
        },
        timeout: 15000,
      }
    );

    const { client_url, record_url, client_id, record_id } = tpResp.data || {};

    // Persiste a legenda separadamente, vinculada ao ID que o Teleprompter
    // devolveu pra essa sessão de gravação — é esse ID que o sistema de edição
    // deve mandar de volta quando o vídeo editado estiver pronto, pra buscar
    // e enviar a legenda certa (evita ambiguidade se o cliente tiver múltiplos
    // roteiros pendentes ao mesmo tempo).
    if (estrut?.legenda_post) {
      await axios.post(
        `${SUPA_URL}/rest/v1/legendas_pendentes`,
        {
          phone, handle, nome_cliente: nomeCLiente, titulo,
          legenda_post: estrut.legenda_post,
          headline_thumbnail: estrut.headline_thumbnail || '',
          record_id: record_id || record_url || null,
          client_id: client_id || null,
        },
        { headers: supaHeaders() }
      ).catch(e => console.warn('[aprovar-roteiro] legenda não salva:', e.response?.data || e.message));
    }

    // Remove do pendente após aprovação
    await axios.delete(
      `${SUPA_URL}/rest/v1/aprovacoes_pendentes?phone=eq.${phone}`,
      { headers: supaHeaders() }
    ).catch(() => {});

    console.log(`[aprovar-roteiro] @${handle} (${phone}) → ${client_url}`);
    return res.json({ ok: true, client_url, record_url, client_id, handle, phone });

  } catch (err) {
    const detail = err.response?.data || err.message;
    console.error('[aprovar-roteiro] Erro:', detail);
    return res.status(500).json({ ok: false, motivo: 'erro_ao_aprovar', detalhe: detail });
  }
});

// ═════════════════════════════════════════════════════════════════════════════
//  GET /api/legenda-pendente/:identificador
//  Busca a legenda salva (aguardando vídeo editado).
//  Aceita: record_id/client_id do Teleprompter (preferível — sem ambiguidade),
//  ou phone/handle como fallback (pega a mais recente não enviada).
//  Usado pelo n8n quando o webhook de vídeo editado dispara.
// ═════════════════════════════════════════════════════════════════════════════
app.get('/api/legenda-pendente/:identificador', async (req, res) => {
  const id = (req.params.identificador || '').replace('@', '').trim();
  const isPhone = /^\d+$/.test(id);
  const filtro = isPhone
    ? `phone=eq.${id}`
    : `or=(record_id.eq.${id},client_id.eq.${id},handle.eq.${id.toLowerCase()})`;

  try {
    const { data: rows } = await axios.get(
      `${SUPA_URL}/rest/v1/legendas_pendentes?${filtro}&enviada=eq.false&order=criado_em.desc&limit=1`,
      { headers: supaHeaders() }
    );
    const pendente = rows?.[0];
    if (!pendente) return res.status(404).json({ ok: false, motivo: 'nenhuma_legenda_pendente' });
    return res.json({ ok: true, ...pendente });
  } catch (err) {
    const detail = err.response?.data || err.message;
    console.error('[legenda-pendente] Erro:', detail);
    return res.status(500).json({ ok: false, motivo: 'erro_ao_buscar', detalhe: detail });
  }
});

// ═════════════════════════════════════════════════════════════════════════════
//  POST /api/marcar-legenda-enviada
//  Marca a legenda como enviada após o n8n disparar a mensagem com o vídeo editado.
//  Campos: phone
// ═════════════════════════════════════════════════════════════════════════════
app.post('/api/marcar-legenda-enviada', async (req, res) => {
  const body  = Array.isArray(req.body) ? req.body[0] : req.body;
  const phone = (body.phone || '').replace(/\D/g, '').trim();
  if (!phone) return res.status(400).json({ ok: false, motivo: 'phone ausente' });

  try {
    await axios.patch(
      `${SUPA_URL}/rest/v1/legendas_pendentes?phone=eq.${phone}&enviada=eq.false`,
      { enviada: true, enviada_em: new Date().toISOString() },
      { headers: supaHeaders() }
    );
    return res.json({ ok: true, phone });
  } catch (err) {
    const detail = err.response?.data || err.message;
    console.error('[marcar-legenda-enviada] Erro:', detail);
    return res.status(500).json({ ok: false, motivo: 'erro_ao_marcar', detalhe: detail });
  }
});

// ═════════════════════════════════════════════════════════════════════════════
//  POST /api/video-editado
//  Chamado pelo bridge do video-editor quando o vídeo final (já editado) fica pronto.
//  Busca a legenda pendente pelo record_id (ou client_id) do Teleprompter, dispara
//  o envio pro cliente via n8n (que tem as credenciais da Evolution API) e marca
//  a legenda como enviada.
//  Campos: record_id, video_url
// ═════════════════════════════════════════════════════════════════════════════
const N8N_WEBHOOK_BASE_URL = process.env.N8N_WEBHOOK_BASE_URL || 'https://n8n-srcleads-n8n.dtna1d.easypanel.host';

app.post('/api/video-editado', async (req, res) => {
  const body     = Array.isArray(req.body) ? req.body[0] : req.body;
  const recordId = (body.record_id || '').trim();
  const videoUrl = (body.video_url || '').trim();
  if (!recordId || !videoUrl) {
    return res.status(400).json({ ok: false, motivo: 'record_id ou video_url ausente' });
  }

  try {
    const { data: rows } = await axios.get(
      `${SUPA_URL}/rest/v1/legendas_pendentes?or=(record_id.eq.${recordId},client_id.eq.${recordId})&enviada=eq.false&order=criado_em.desc&limit=1`,
      { headers: supaHeaders() }
    );
    const pendente = rows?.[0];
    if (!pendente) {
      return res.status(404).json({ ok: false, motivo: 'nenhuma_legenda_pendente_para_esse_record_id' });
    }

    await axios.post(
      `${N8N_WEBHOOK_BASE_URL}/webhook/enviar-video-editado`,
      {
        phone:              pendente.phone,
        video_url:          videoUrl,
        legenda_post:       pendente.legenda_post || '',
        headline_thumbnail: pendente.headline_thumbnail || '',
        titulo:             pendente.titulo || '',
      },
      { timeout: 20000 }
    );

    await axios.patch(
      `${SUPA_URL}/rest/v1/legendas_pendentes?id=eq.${pendente.id}`,
      { enviada: true, enviada_em: new Date().toISOString(), video_url: videoUrl },
      { headers: supaHeaders() }
    );

    console.log(`[video-editado] record_id=${recordId} → enviado pro WhatsApp de ${pendente.phone}`);
    return res.json({ ok: true, phone: pendente.phone, record_id: recordId });
  } catch (err) {
    const detail = err.response?.data || err.message;
    console.error('[video-editado] Erro:', detail);
    return res.status(500).json({ ok: false, motivo: 'erro_ao_processar_video_editado', detalhe: detail });
  }
});

// ═════════════════════════════════════════════════════════════════════════════
//  GET /api/contexto-cliente/:identificador
//  Aceita handle (@conta ou conta) OU número WhatsApp (ex: 5511999999999).
//  Retorna posicionamento, tom de voz, ganchos, CTAs, pilares e últimos
//  roteiros do cliente — para usar como contexto na geração de novos conteúdos.
// ═════════════════════════════════════════════════════════════════════════════
app.get('/api/contexto-cliente/:identificador', async (req, res) => {
  const raw = (req.params.identificador || '').trim();
  if (!raw) return res.status(400).json({ ok: false, motivo: 'identificador ausente' });

  // Detecta se é WhatsApp (só dígitos, pode ter + no início) ou handle Instagram
  const isWhatsapp = /^\+?\d{8,15}$/.test(raw);
  const whatsapp   = isWhatsapp ? raw.replace(/\D/g, '') : null;
  const handle     = isWhatsapp ? null : raw.replace('@', '').toLowerCase();

  try {
    // Resolve o cliente — por whatsapp OU handle
    const clienteFilter = isWhatsapp
      ? `whatsapp=eq.${whatsapp}`
      : `handle=eq.${handle}`;

    const clienteR = await axios.get(
      `${SUPA_URL}/rest/v1/clientes?${clienteFilter}&limit=1`,
      { headers: supaHeaders() }
    );

    const cliente = clienteR.data?.[0] || null;
    if (!cliente) return res.status(404).json({ ok: false, motivo: 'cliente_nao_encontrado' });

    const resolvedHandle = cliente.handle;

    const [planoR, roteirosR] = await Promise.all([
      axios.get(`${SUPA_URL}/rest/v1/planos_diretores?cliente_handle=eq.${resolvedHandle}&order=criado_em.desc&limit=1&select=posicionamento_atual,diagnostico_identidade,tom_de_voz,pilares_conteudo,ganchos_modelo,ctas_recomendados,hashtags_estrategicas,seo_instagram,briefing_redatores,assuntos_quentes,ideias_titulos,identidade_visual`, { headers: supaHeaders() }),
      axios.get(`${SUPA_URL}/rest/v1/roteiros_virais?cliente_handle=eq.${resolvedHandle}&order=criado_em.desc&limit=2&select=roteiros,criado_em`, { headers: supaHeaders() }),
    ]);

    const plano    = planoR.data?.[0]   || null;
    const roteiros = roteirosR.data     || [];

    return res.json({
      ok: true,
      handle: resolvedHandle,
      nicho:            cliente.nicho,
      posicionamento:   plano?.posicionamento_atual   || null,
      diagnostico:      plano?.diagnostico_identidade || null,
      tom_de_voz:       plano?.tom_de_voz             || null,
      pilares:          plano?.pilares_conteudo        || [],
      ganchos:          plano?.ganchos_modelo          || [],
      ctas:             plano?.ctas_recomendados       || [],
      hashtags:         plano?.hashtags_estrategicas   || {},
      seo:              plano?.seo_instagram            || {},
      assuntos_quentes: plano?.assuntos_quentes         || [],
      ideias_titulos:   plano?.ideias_titulos           || [],
      identidade_visual:plano?.identidade_visual        || {},
      briefing_redator: plano?.briefing_redatores       || '',
      roteiros_anteriores: roteiros.map(r => ({
        criado_em: r.criado_em,
        temas: (r.roteiros || []).map(x => x.titulo_interno || x.tema || '').filter(Boolean),
      })),
    });

  } catch (err) {
    const detail = err.response?.data || err.message;
    console.error('[contexto-cliente] Erro:', detail);
    return res.status(500).json({ ok: false, motivo: 'erro_interno', detalhe: detail });
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// AGENTE SOFIA — Endpoints de suporte ao WhatsApp AI Agent
// ═════════════════════════════════════════════════════════════════════════════

/**
 * POST /api/cadastrar-cliente
 * Upsert cliente + cria carteira de créditos free se for novo.
 * Retorna se era novo ou já existia e quantos créditos foram dados.
 */
app.post('/api/cadastrar-cliente', async (req, res) => {
  const { whatsapp, nome, handle, nicho } = req.body || {};
  if (!whatsapp || !handle) {
    return res.status(400).json({ ok: false, motivo: 'whatsapp_e_handle_obrigatorios' });
  }

  const cleanHandle = handle.replace('@', '').trim().toLowerCase();

  try {
    // Verifica se já existe
    const { data: existente } = await axios.get(
      `${SUPA_URL}/rest/v1/clientes?handle=eq.${encodeURIComponent(cleanHandle)}&select=handle,plano,whatsapp`,
      { headers: supaHeaders() }
    );
    const jaExistia = Array.isArray(existente) && existente.length > 0;

    // Upsert cliente
    await axios.post(
      `${SUPA_URL}/rest/v1/clientes?on_conflict=handle`,
      {
        handle:        cleanHandle,
        nome_completo: nome || '',
        whatsapp,
        nicho:         nicho || '',
        plano:         'free',
        status:        'trial',
      },
      { headers: { ...supaHeaders(), 'Prefer': 'resolution=merge-duplicates,return=minimal' } }
    );

    let creditosDados = 0;

    if (!jaExistia) {
      // Cria carteira de créditos free (10 créditos, reset em 30 dias)
      const CREDITOS_FREE = 10;
      const proximoReset  = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

      await axios.post(
        `${SUPA_URL}/rest/v1/creditos_clientes?on_conflict=cliente_handle`,
        {
          cliente_handle: cleanHandle,
          saldo_atual:    CREDITOS_FREE,
          creditos_mes:   CREDITOS_FREE,
          proximo_reset:  proximoReset,
          total_consumido: 0,
          total_recarregado: 0,
        },
        { headers: { ...supaHeaders(), 'Prefer': 'resolution=merge-duplicates,return=minimal' } }
      );

      // Registra transação de bônus
      await axios.post(
        `${SUPA_URL}/rest/v1/transacoes_creditos`,
        {
          cliente_handle: cleanHandle,
          tipo:           'bonus',
          feature_slug:   null,
          quantidade:     CREDITOS_FREE,
          saldo_apos:     CREDITOS_FREE,
          descricao:      'Bônus de boas-vindas — plano Free',
        },
        { headers: supaHeaders() }
      );

      creditosDados = CREDITOS_FREE;
      console.log(`[cadastrar-cliente] Novo cliente @${cleanHandle} — ${CREDITOS_FREE} créditos free concedidos`);
    } else {
      console.log(`[cadastrar-cliente] Cliente @${cleanHandle} já existia — dados atualizados`);
    }

    return res.json({
      ok: true,
      jaExistia,
      handle: cleanHandle,
      creditos_dados: creditosDados,
      mensagem: jaExistia
        ? `Dados de *@${cleanHandle}* atualizados com sucesso.`
        : `Cadastro de *@${cleanHandle}* realizado! Você ganhou *${creditosDados} créditos* de boas-vindas para experimentar a plataforma. 🎉`,
    });
  } catch (err) {
    console.error('[cadastrar-cliente]', err.response?.data || err.message);
    return res.status(500).json({ ok: false, motivo: err.response?.data || err.message });
  }
});

/**
 * POST /api/verificar-cliente
 * Verifica se um número WhatsApp está cadastrado.
 * Retorna dados do cliente + saldo de créditos + última análise.
 */
app.post('/api/verificar-cliente', async (req, res) => {
  const { whatsapp } = req.body || {};
  if (!whatsapp) return res.status(400).json({ ok: false, motivo: 'whatsapp_obrigatorio' });

  try {
    // Busca cliente pelo número WhatsApp
    const { data: clientes } = await axios.get(
      `${SUPA_URL}/rest/v1/clientes?whatsapp=eq.${encodeURIComponent(whatsapp)}&select=handle,nome_completo,nicho,plano,status,foto_perfil,criado_em`,
      { headers: supaHeaders() }
    );

    if (!clientes || clientes.length === 0) {
      return res.json({ ok: true, encontrado: false, cliente: null, creditos: null, ultima_analise: null });
    }

    const cliente = clientes[0];

    // Busca saldo de créditos
    const { data: credRows } = await axios.get(
      `${SUPA_URL}/rest/v1/creditos_clientes?cliente_handle=eq.${encodeURIComponent(cliente.handle)}&select=saldo_atual,creditos_mes,proximo_reset`,
      { headers: supaHeaders() }
    );
    let creditos = credRows?.[0] || null;

    // Se cliente existe mas não tem carteira ainda → cria com créditos free
    if (!creditos) {
      const CREDITOS_FREE = 10;
      const proximoReset  = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
      try {
        await axios.post(
          `${SUPA_URL}/rest/v1/creditos_clientes?on_conflict=cliente_handle`,
          { cliente_handle: cliente.handle, saldo_atual: CREDITOS_FREE, creditos_mes: CREDITOS_FREE, proximo_reset: proximoReset, total_consumido: 0, total_recarregado: 0 },
          { headers: { ...supaHeaders(), 'Prefer': 'resolution=merge-duplicates,return=minimal' } }
        );
        await axios.post(`${SUPA_URL}/rest/v1/transacoes_creditos`,
          { cliente_handle: cliente.handle, tipo: 'bonus', feature_slug: null, quantidade: CREDITOS_FREE, saldo_apos: CREDITOS_FREE, descricao: 'Bônus de boas-vindas — plano Free' },
          { headers: supaHeaders() }
        );
        creditos = { saldo_atual: CREDITOS_FREE, creditos_mes: CREDITOS_FREE, proximo_reset: proximoReset };
        console.log(`[verificar-cliente] Carteira criada para cliente antigo @${cliente.handle}`);
      } catch (e) {
        creditos = { saldo_atual: 0, creditos_mes: 0, proximo_reset: null };
      }
    }

    // Busca última análise concluída
    const { data: analises } = await axios.get(
      `${SUPA_URL}/rest/v1/analises?cliente_handle=eq.${encodeURIComponent(cliente.handle)}&status_auditoria=eq.concluido&order=criado_em.desc&limit=1&select=id,handle_auditado,tipo_auditoria,criado_em`,
      { headers: supaHeaders() }
    );
    const ultima_analise = analises?.[0] || null;

    return res.json({ ok: true, encontrado: true, cliente, creditos, ultima_analise });
  } catch (err) {
    console.error('[verificar-cliente]', err.message);
    return res.status(500).json({ ok: false, motivo: err.message });
  }
});

/**
 * POST /api/historico-analises
 * Retorna histórico de análises de um cliente (para contexto do agente).
 */
app.post('/api/historico-analises', async (req, res) => {
  const { cliente_handle, limit = 5 } = req.body || {};
  if (!cliente_handle) return res.status(400).json({ ok: false, motivo: 'cliente_handle_obrigatorio' });

  try {
    const { data: analises } = await axios.get(
      `${SUPA_URL}/rest/v1/analises?cliente_handle=eq.${encodeURIComponent(cliente_handle)}&order=criado_em.desc&limit=${limit}&select=id,handle_auditado,tipo_auditoria,status_auditoria,nicho,criado_em`,
      { headers: supaHeaders() }
    );

    const { data: solicitacoes } = await axios.get(
      `${SUPA_URL}/rest/v1/solicitacoes_auditoria?cliente_handle=eq.${encodeURIComponent(cliente_handle)}&status=in.(pendente,processando)&select=id,handle_principal,tipo_auditoria,status,criado_em`,
      { headers: supaHeaders() }
    );

    return res.json({ ok: true, analises: analises || [], em_andamento: solicitacoes || [] });
  } catch (err) {
    console.error('[historico-analises]', err.message);
    return res.status(500).json({ ok: false, motivo: err.message });
  }
});

/**
 * POST /api/iniciar-auditoria
 * Registra uma solicitação de auditoria na fila e aciona o processo.
 * Suporta: 'proprio' (só perfil do cliente), 'concorrente' (só concorrente), 'misto' (ambos).
 */
app.post('/api/iniciar-auditoria', async (req, res) => {
  const body = req.body || {};

  // Compatibilidade com campos enviados pelo nó n8n (nomes alternativos)
  const whatsapp_solicitante = body.whatsapp_solicitante || body.whatsapp || null;
  const cliente_handle       = body.cliente_handle || null;
  const handle_principal     = body.handle_principal || body.cliente_handle || null;

  // Aceita tipo ou tipo_auditoria; normaliza 'mista' → 'misto'
  const tipo_raw     = body.tipo_auditoria || body.tipo || 'misto';
  const tipo_auditoria = tipo_raw === 'mista' ? 'misto' : tipo_raw;

  // Aceita concorrentes (array) ou handle_concorrente (string separada por vírgula)
  let concorrentes = body.concorrentes || [];
  if (!concorrentes.length && body.handle_concorrente) {
    concorrentes = body.handle_concorrente.split(',').map(h => h.trim()).filter(Boolean);
  }

  if (!handle_principal) {
    return res.status(400).json({ ok: false, motivo: 'handle_principal_obrigatorio' });
  }

  // Valida tipo
  const tiposValidos = ['proprio', 'concorrente', 'misto'];
  if (!tiposValidos.includes(tipo_auditoria)) {
    return res.status(400).json({ ok: false, motivo: 'tipo_auditoria_invalido', tipo_recebido: tipo_auditoria });
  }

  try {
    // Registra na fila
    const payload = {
      whatsapp_solicitante,
      cliente_handle: cliente_handle || null,
      handle_principal,
      tipo_auditoria,
      concorrentes: JSON.stringify(concorrentes),
      status: 'pendente',
    };

    const { data: solicitacao } = await axios.post(
      `${SUPA_URL}/rest/v1/solicitacoes_auditoria`,
      payload,
      { headers: { ...supaHeaders(), 'Prefer': 'return=representation' } }
    );

    const solicitacao_id = solicitacao?.[0]?.id || null;

    // Monta estimativa baseada no tipo
    const estimativas = {
      proprio:      '10-15 minutos',
      concorrente:  '8-12 minutos',
      misto:        '15-25 minutos',
    };

    // Aqui você pode adicionar uma chamada ao webhook externo que gera o relatório
    // Ex: axios.post(process.env.AUDITORIA_WEBHOOK_URL, { solicitacao_id, handle_principal, ... })

    console.log(`[iniciar-auditoria] Solicitação ${solicitacao_id} | tipo=${tipo_auditoria} | handle=${handle_principal} | concorrentes=${concorrentes.join(',')}`);

    return res.json({
      ok: true,
      solicitacao_id,
      handle_principal,
      concorrentes,
      tipo_auditoria,
      estimativa: estimativas[tipo_auditoria],
      mensagem: `Auditoria iniciada! Vou processar o perfil *@${handle_principal}*${concorrentes.length ? ' e ' + concorrentes.length + ' concorrente(s)' : ''}. Tempo estimado: ${estimativas[tipo_auditoria]}.`,
    });
  } catch (err) {
    console.error('[iniciar-auditoria]', err.response?.data || err.message);
    return res.status(500).json({ ok: false, motivo: err.response?.data || err.message });
  }
});

/**
 * POST /api/debitar-credito
 * Debita créditos de um cliente e registra a transação.
 */
app.post('/api/debitar-credito', async (req, res) => {
  const { cliente_handle, feature_slug, descricao } = req.body || {};
  if (!cliente_handle || !feature_slug) {
    return res.status(400).json({ ok: false, motivo: 'cliente_handle_e_feature_slug_obrigatorios' });
  }

  try {
    // Busca custo da feature
    const { data: features } = await axios.get(
      `${SUPA_URL}/rest/v1/features_creditos?slug=eq.${encodeURIComponent(feature_slug)}&select=custo_creditos,nome`,
      { headers: supaHeaders() }
    );
    if (!features || features.length === 0) {
      return res.status(404).json({ ok: false, motivo: 'feature_nao_encontrada' });
    }
    const custo = features[0].custo_creditos;

    // Busca saldo atual
    const { data: credRows } = await axios.get(
      `${SUPA_URL}/rest/v1/creditos_clientes?cliente_handle=eq.${encodeURIComponent(cliente_handle)}&select=id,saldo_atual`,
      { headers: supaHeaders() }
    );
    const credito = credRows?.[0];
    if (!credito) {
      return res.status(404).json({ ok: false, motivo: 'cliente_sem_carteira_de_creditos' });
    }
    if (credito.saldo_atual < custo) {
      return res.json({ ok: false, motivo: 'saldo_insuficiente', saldo_atual: credito.saldo_atual, custo });
    }

    const novo_saldo = credito.saldo_atual - custo;

    // Atualiza saldo
    await axios.patch(
      `${SUPA_URL}/rest/v1/creditos_clientes?cliente_handle=eq.${encodeURIComponent(cliente_handle)}`,
      { saldo_atual: novo_saldo, total_consumido: credito.saldo_atual - novo_saldo, atualizado_em: new Date().toISOString() },
      { headers: supaHeaders() }
    );

    // Registra transação
    await axios.post(
      `${SUPA_URL}/rest/v1/transacoes_creditos`,
      {
        cliente_handle,
        tipo: 'consumo',
        feature_slug,
        quantidade: -custo,
        saldo_apos: novo_saldo,
        descricao: descricao || `Uso de ${features[0].nome}`,
      },
      { headers: supaHeaders() }
    );

    return res.json({ ok: true, custo, saldo_anterior: credito.saldo_atual, saldo_atual: novo_saldo });
  } catch (err) {
    console.error('[debitar-credito]', err.response?.data || err.message);
    return res.status(500).json({ ok: false, motivo: err.response?.data || err.message });
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// VIDEO EDITOR — Upload, Transcrição + Agente Editor + Agente Motion Designer
// ═════════════════════════════════════════════════════════════════════════════

const veStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, 'uploads');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `ve_${Date.now()}_${Math.random().toString(36).slice(2)}${ext}`);
  },
});

const videoUpload = multer({
  storage: veStorage,
  limits: { fileSize: 500 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (/\.(mp4|mov|webm|avi|mkv|m4v)$/i.test(file.originalname)) cb(null, true);
    else cb(new Error('Formato não suportado. Use MP4, MOV, WebM, AVI ou MKV.'));
  },
});

function ffmpegExtractAudioFromFile(filePath, maxSeconds = 3600) {
  return new Promise((resolve, reject) => {
    const tmpPath = path.join(os.tmpdir(), `ve_audio_${Date.now()}.mp3`);
    const cmd = `ffmpeg -y -i "${filePath}" -vn -ar 16000 -ac 1 -b:a 64k -t ${maxSeconds} "${tmpPath}"`;
    exec(cmd, { timeout: 300000 }, (err, _stdout, stderr) => {
      if (err) return reject(new Error(stderr || err.message));
      resolve(tmpPath);
    });
  });
}

const PROMPT_EDITOR = `Você é um Agente de IA Especialista em Edição e Decupagem de Vídeo com mais de 20 anos de experiência em pós-produção audiovisual. Analise a transcrição bruta enviada pelo usuário e identifique cirurgicamente o que deve ser mantido, cortado e onde a edição deve intervir.

Entregue a resposta EXATAMENTE neste formato com os três marcadores abaixo:

===SESSÃO 1: VEREDITO===
[Um parágrafo descrevendo o estado geral do áudio: ritmo, clareza, problemas predominantes]

===SESSÃO 2: TABELA DE CORTES===
| Trecho Original | Problema Detectado | Ação Recomendada | Nota para o Editor |
|---|---|---|---|
[linhas da tabela aqui]

===SESSÃO 3: TRANSCRIÇÃO LIMPA===
[O texto limpo, fluido, sem vícios, pronto para legenda ou teleprompter]

DIRETRIZES:
- Corte: Filler words (hãã, éee, tipo assim, né), Falsos começos, Arrependimentos explícitos, Redundâncias, Frases inconclusas
- Se o corte quebrar continuidade visual, indique "Inserir B-roll" na Nota para o Editor
- Seja direto. Pense como um editor com a timeline aberta.`;

const PROMPT_MOTION = `Você é um Diretor de Arte e Especialista em Motion Graphics Sênior com mais de 20 anos de experiência. Analise a transcrição limpa enviada e crie o Briefing Visual de Motion para o Remotion.

Entregue a resposta EXATAMENTE neste formato com os três marcadores abaixo:

===SESSÃO 1: IDENTIDADE VISUAL===
[Tom visual recomendado: tipografia, paleta de cores, estilo de animação geral, clima do vídeo]

===SESSÃO 2: ROTEIRO DE MOTION GRAPHICS===
| Trecho do Áudio (Gatilho) | O que vai na Tela | Estilo de Animação | SFX Recomendado |
|---|---|---|---|
[linhas da tabela aqui]

===SESSÃO 3: SUGESTÕES DE B-ROLL===
[De 2 a 4 momentos onde inserir vídeo de cobertura ou fundo abstrato, com descrição do que mostrar]

DIRETRIZES ESTÉTICAS:
- Minimalismo estratégico: não polua o vídeo
- Priorize blocos de texto limpos com hierarquia tipográfica
- Ganchos de retenção nos primeiros 15 segundos
- Marque palavras-chave em CAIXA ALTA ou *asteriscos*
- Funcionalidade antes de estética: cada elemento deve explicar ou dar ritmo`;

// Serve o frontend do video editor
app.get('/video-editor', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'video-editor', 'index.html'));
});

// Pipeline completo: upload → transcrição → agente editor → agente motion
app.post('/api/video-editor/process', videoUpload.single('video'), async (req, res) => {
  const videoPath = req.file?.path;
  if (!videoPath) return res.status(400).json({ ok: false, motivo: 'Nenhum vídeo recebido.' });

  let audioPath = null;

  try {
    // 1. Extrair áudio com FFmpeg
    audioPath = await ffmpegExtractAudioFromFile(videoPath);

    // 2. Transcrever com Whisper
    let transcricao;
    try {
      transcricao = await transcreveAudio(audioPath);
      audioPath = null;
    } catch (e) {
      if (audioPath) try { fs.unlinkSync(audioPath); } catch (_) {}
      throw new Error(`Whisper falhou: ${e.message}`);
    }

    if (!transcricao || transcricao.trim().length < 10) {
      throw new Error('Transcrição vazia. Verifique se o vídeo tem áudio audível.');
    }

    // 3. Agente 1: Editor de Vídeo
    const editorRes = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: PROMPT_EDITOR },
        { role: 'user', content: `TRANSCRIÇÃO BRUTA:\n\n${transcricao}` },
      ],
      max_tokens: 4000,
      temperature: 0.3,
    });
    const editorOutput = editorRes.choices[0].message.content;

    // Extrai transcrição limpa para passar ao Agente 2
    const cleanMatch = editorOutput.match(/===SESSÃO 3: TRANSCRIÇÃO LIMPA===([\s\S]*?)(?:===|$)/);
    const transcricaoLimpa = cleanMatch ? cleanMatch[1].trim() : transcricao;

    // 4. Agente 2: Motion Designer
    const motionRes = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: PROMPT_MOTION },
        { role: 'user', content: `TRANSCRIÇÃO LIMPA:\n\n${transcricaoLimpa}` },
      ],
      max_tokens: 4000,
      temperature: 0.4,
    });
    const motionOutput = motionRes.choices[0].message.content;

    // Limpa vídeo original
    try { fs.unlinkSync(videoPath); } catch (_) {}

    return res.json({
      ok: true,
      transcricao_bruta: transcricao,
      editor: editorOutput,
      motion: motionOutput,
    });

  } catch (err) {
    if (videoPath) try { fs.unlinkSync(videoPath); } catch (_) {}
    if (audioPath) try { fs.unlinkSync(audioPath); } catch (_) {}
    console.error('[video-editor/process]', err.message);
    return res.status(500).json({ ok: false, motivo: err.message });
  }
});

app.listen(PORT, () => console.log(`\n🚀 Auditoria IA Backend rodando em http://localhost:${PORT}\n`));
