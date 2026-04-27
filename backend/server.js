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

const CHROME_PATH = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const app  = express();
app.use(express.json());

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

app.post('/api/slides', (req, res) => {
  const data    = req.body;
  const section = ['overview_cliente', 'diretrizes_tecnicas'].includes(req.query.section)
    ? req.query.section
    : 'all';

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

  // Injeta os dados como variáveis globais antes de qualquer script do bundle.
  // O html-inline remove <head>, então buscamos o primeiro <style> como âncora.
  const injection = `<script>window.__MARKETING_DATA__=${JSON.stringify(data)};window.__SECTION__=${JSON.stringify(section)};</script>`;

  // Tenta </head> primeiro; cai em <style> (bundle sem head) como fallback
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
  const data        = req.body;
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

  const injection = `<script>window.__MARKETING_DATA__=${JSON.stringify(data)};window.__SECTION__=${JSON.stringify(section)};</script>`;
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
app.listen(PORT, () => console.log(`\n🚀 Auditoria IA Backend rodando em http://localhost:${PORT}\n`));
