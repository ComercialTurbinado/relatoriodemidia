/**
 * Auditoria Expressa IA — Backend Orchestrator
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
const puppeteer   = require('puppeteer-core');
const fs          = require('fs');
const path        = require('path');
const crypto      = require('crypto');
const { exec }    = require('child_process');
const os          = require('os');
// ─── Supabase REST (sem SDK — usa axios direto) ───────────────────────────────
const SUPA_URL  = process.env.SUPABASE_URL  || 'https://mblntoimrkfoocbztozb.supabase.co';
const SUPA_KEY  = process.env.SUPABASE_ANON_KEY || '';
const supaHeaders = () => ({
  'apikey': SUPA_KEY,
  'Authorization': `Bearer ${SUPA_KEY}`,
  'Content-Type': 'application/json',
  'Prefer': 'return=representation',
});

const CHROME_PATH = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const app  = express();
app.use(express.json({ limit: '10mb' }));

// ─── Clientes de IA ──────────────────────────────────────────────────────────

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || '' });

const deepseek = new OpenAI({
  apiKey:  process.env.DEEPSEEK_API_KEY || '',
  baseURL: 'https://api.deepseek.com/v1',
});

// ─── Auth simples ─────────────────────────────────────────────────────────────

app.use('/api', (req, res, next) => {
  if (req.path === '/webhook/pagamento') return next(); // gateway não manda header
  const key = req.headers['x-api-key'];
  if (key !== process.env.API_SECRET) return res.status(401).json({ error: 'Unauthorized' });
  next();
});

// ═════════════════════════════════════════════════════════════════════════════
// 1. MCP — FETCH INSTAGRAM
// ═════════════════════════════════════════════════════════════════════════════

app.post('/api/fetch-instagram', async (req, res) => {
  const { handle } = req.body;
  const cleanHandle = handle.replace('@', '').replace(/.*instagram\.com\//, '').split('/')[0];

  try {
    // Opção A: Apify Instagram Profile Scraper (recomendado)
    const apifyRun = await axios.post(
      `https://api.apify.com/v2/acts/apify~instagram-profile-scraper/run-sync-get-dataset-items?token=${process.env.APIFY_TOKEN}`,
      { usernames: [cleanHandle] },
      { timeout: 30000 }
    );

    const profile = apifyRun.data[0] || {};

    const followers        = profile.followersCount || 0;
    const posts            = profile.latestPosts     || [];
    const avgLikes         = posts.length
      ? Math.round(posts.reduce((s, p) => s + (p.likesCount || 0), 0) / posts.length)
      : 0;
    const avgComments      = posts.length
      ? Math.round(posts.reduce((s, p) => s + (p.commentsCount || 0), 0) / posts.length)
      : 0;
    const taxa_engajamento = followers > 0
      ? (((avgLikes + avgComments) / followers) * 100).toFixed(2)
      : '0.00';

    // Detectar nicho via GPT-4o mini (barato e rápido)
    const nichoRes = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'Classifique o nicho do perfil em UMA palavra em português. Exemplos: restaurante, coach, ecommerce, academia, clínica, barbearia, infoprodutor, moda, pet, imóveis. Responda apenas a palavra.',
        },
        {
          role: 'user',
          content: `Bio: ${profile.biography || ''}\nÚltimas legendas: ${posts.slice(0, 5).map(p => p.caption?.slice(0, 80)).join(' | ')}`,
        },
      ],
      max_tokens: 10,
    });

    const nicho = nichoRes.choices[0].message.content.trim().toLowerCase();

    return res.json({ nicho, followers, taxa_engajamento, handle: cleanHandle });

  } catch (err) {
    console.error('[fetch-instagram]', err.message);
    // Fallback para não travar o fluxo em desenvolvimento
    return res.json({
      nicho:            'negócio',
      followers:        1000,
      taxa_engajamento: '1.50',
      handle:           cleanHandle,
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

  let browser;
  try {
    browser = await puppeteer.launch({
      executablePath: CHROME_PATH,
      headless: 'shell',
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    const page = await browser.newPage();
    const W = isLandscape ? 1920 : 1080;
    const H = isLandscape ? 1080 : 1920;

    await page.setViewport({ width: W, height: H, deviceScaleFactor: 1 });

    const tmpPath = path.join(__dirname, `_slides_tmp_${Date.now()}.html`);
    fs.writeFileSync(tmpPath, html, 'utf8');
    try {
      await page.goto(`file://${tmpPath}`, { waitUntil: 'load', timeout: 15000 });
    } finally {
      fs.unlinkSync(tmpPath);
    }

    // Aguarda React montar + fontes
    await new Promise(r => setTimeout(r, 2500));

    // Ativa orientação correta
    if (!isLandscape) {
      await page.evaluate(() => {
        const btn = Array.from(document.querySelectorAll('button'))
          .find(b => b.textContent.trim() === '9:16');
        if (btn) btn.click();
      });
      await new Promise(r => setTimeout(r, 600));
    }

    // Conta slides e tira screenshot de cada um
    const total = await page.evaluate(() =>
      document.querySelectorAll('button[style*="border-radius: 50%"]').length
    );

    const slideEl  = await page.$('#slide-inner');
    const screenshots = [];

    for (let i = 0; i < total; i++) {
      await page.evaluate((idx) => {
        const dots = document.querySelectorAll('button[style*="border-radius: 50%"]');
        dots[idx]?.click();
      }, i);
      await new Promise(r => setTimeout(r, 180));
      const img = await slideEl.screenshot({ type: 'png' });
      screenshots.push(img);
    }

    await browser.close();
    browser = null;

    // Monta PDF com pdfkit: cada screenshot ocupa uma página
    const pdfBuf = await new Promise((resolve, reject) => {
      const chunks = [];
      // Página na proporção exata do slide
      const doc = new PDFDocument({
        autoFirstPage: false,
        margin: 0,
        size: [W, H],
      });
      doc.on('data', c => chunks.push(c));
      doc.on('end',  () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      for (const img of screenshots) {
        doc.addPage({ size: [W, H], margin: 0 });
        doc.image(img, 0, 0, { width: W, height: H });
      }
      doc.end();
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="radar-marketing.pdf"');
    res.send(pdfBuf);

  } catch (err) {
    if (browser) await browser.close().catch(() => {});
    console.error('[slides/pdf]', err.message);
    res.status(500).json({ error: 'Falha ao gerar PDF', detail: err.message });
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
  const useA4       = req.query.format === 'A4'; // ?format=A4 → usa papel A4 real (respeita mm e @page)
  const fullPage    = req.query.full_page === 'true'; // captura página inteira sem limite de altura

  // Dimensões do viewport:
  //   A4 portrait  → 794×1123 px (96 dpi)  |  A4 landscape → 1123×794 px
  //   Padrão        → 1080×1920 (portrait)  |  1920×1080 (landscape)
  const W = useA4
    ? (isLandscape ? 1123 : 794)
    : (isLandscape ? 1920 : 1080);
  const H = useA4
    ? (isLandscape ? 794  : 1123)
    : (isLandscape ? 1080 : 1920);

  let browser;
  try {
    browser = await puppeteer.launch({
      executablePath: CHROME_PATH,
      headless: 'shell',
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    const page = await browser.newPage();
    await page.setViewport({ width: W, height: H, deviceScaleFactor: 1 });

    // Simula um navegador real para evitar bloqueios de bot
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
    );

    if (externalUrl) {
      await page.goto(externalUrl, { waitUntil: 'networkidle0', timeout: 60000 });
    } else {
      await page.setContent(html, { waitUntil: 'networkidle0', timeout: 60000 });
    }

    // Opções do PDF:
    //   ?format=A4  → formato de papel A4, margens controladas pelo CSS @page
    //   padrão      → dimensões em px (comportamento original)
    const pdfOptions = useA4
      ? {
          format: isLandscape ? 'A4' : 'A4',
          landscape: isLandscape,
          printBackground: true,
          margin: { top: 0, bottom: 0, left: 0, right: 0 },
        }
      : {
          width: `${W}px`,
          height: fullPage ? undefined : `${H}px`,
          printBackground: true,
          margin: { top: 0, bottom: 0, left: 0, right: 0 },
        };

    const pdfBuf = await page.pdf(pdfOptions);

    await browser.close(); browser = null;

    // Nome do arquivo: domínio da URL ou "documento"
    let fileName = 'documento';
    if (externalUrl) {
      try { fileName = new URL(externalUrl).hostname.replace(/\./g, '_'); } catch (_) {}
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}.pdf"`);
    res.end(Buffer.from(pdfBuf));
  } catch (err) {
    if (browser) await browser.close().catch(() => {});
    console.error('[html-to-pdf]', err.message);
    res.status(500).json({ error: 'Falha ao gerar PDF', detail: err.message });
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
    browser = await puppeteer.launch({
      executablePath: CHROME_PATH,
      headless: 'shell',
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
    );

    // Bloqueia recursos pesados desnecessários (fontes, imagens grandes)
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      const type = req.resourceType();
      if (['font', 'media'].includes(type)) req.abort();
      else req.continue();
    });

    const t0 = Date.now();
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 45000 });
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
    const cmd = `yt-dlp -f bestaudio --get-url --no-playlist "${videoUrl}"`;
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
    browser = await puppeteer.launch({
      executablePath: process.env.CHROME_PATH || '/usr/bin/chromium',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--window-size=1280,800',
      ],
      headless: true,
    });

    const page = await browser.newPage();

    // User-agent de browser real para contornar bloqueios básicos
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
    );
    await page.setViewport({ width: 1280, height: 800 });

    // Bloqueia imagens, fontes e CSS para carregar mais rápido
    await page.setRequestInterception(true);
    page.on('request', req => {
      if (['image', 'font', 'stylesheet', 'media'].includes(req.resourceType())) {
        req.abort();
      } else {
        req.continue();
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

app.listen(PORT, () => console.log(`\n🚀 Auditoria IA Backend rodando em http://localhost:${PORT}\n`));
