# -*- coding: utf-8 -*-
"""Aplica melhorias em flowAtual.json — executar: python3 _patch_flow.py"""
import importlib.util
import json
from pathlib import Path

path = Path(__file__).resolve().parent / "flowAtual.json"
data = json.loads(path.read_text(encoding="utf-8"))
nodes = {n["name"]: n for n in data["nodes"]}

NORMALIZAR = r"""// Combina resposta RapidAPI com o item original (1 execução por handle)
// instagram120 e scrapers similares mudam o formato: desembrulha + busca profunda de user/posts.
const rapItems  = $input.all();
const origItems = $('Expandir Handles').all();

function flattenEdgeNodes(arr) {
  if (!Array.isArray(arr) || !arr.length) return [];
  if (arr[0]?.node != null) return arr.map(e => e.node).filter(Boolean);
  return arr;
}

function looksLikeIgUser(o) {
  if (!o || typeof o !== 'object' || Array.isArray(o)) return false;
  const hasFollowers = o.edge_followed_by != null || o.follower_count != null || o.followers != null;
  const hasUsername = o.username != null || o.user_name != null;
  const hasTimeline = o.edge_owner_to_timeline_media != null;
  const hasBio = o.biography != null || o.bio != null;
  return hasFollowers && (hasUsername || hasTimeline || hasBio);
}

function looksLikeIgPost(o) {
  if (!o || typeof o !== 'object' || Array.isArray(o)) return false;
  if (o.shortcode || o.code) return true;
  if (o.pk != null && (o.media_type != null || o.product_type || o.__typename)) return true;
  if (o.id && (o.like_count != null || o.comment_count != null || o.display_url)) return true;
  return false;
}

function deepFindUser(obj, depth, seen) {
  if (!obj || depth > 10) return null;
  if (typeof obj !== 'object') return null;
  if (seen.has(obj)) return null;
  seen.add(obj);
  if (Array.isArray(obj)) {
    for (const el of obj) {
      const f = deepFindUser(el, depth + 1, seen);
      if (f) return f;
    }
  } else {
    if (looksLikeIgUser(obj)) return obj;
    for (const k of Object.keys(obj)) {
      const f = deepFindUser(obj[k], depth + 1, seen);
      if (f) return f;
    }
  }
  return null;
}

function deepFindPostsArray(obj, depth, seen) {
  if (!obj || depth > 10) return null;
  if (typeof obj !== 'object') return null;
  if (seen.has(obj)) return null;
  seen.add(obj);
  if (Array.isArray(obj)) {
    if (obj.length && (looksLikeIgPost(obj[0]) || (obj[0]?.node && looksLikeIgPost(obj[0].node))))
      return flattenEdgeNodes(obj);
    for (const el of obj) {
      const f = deepFindPostsArray(el, depth + 1, new Set(seen));
      if (f?.length) return f;
    }
  } else {
    for (const k of Object.keys(obj)) {
      const f = deepFindPostsArray(obj[k], depth + 1, seen);
      if (f?.length) return f;
    }
  }
  return null;
}

function prepararResposta(raw) {
  let r = raw;
  if (Array.isArray(r) && r.length === 1 && typeof r[0] === 'object') r = r[0];
  if (r?.data != null && typeof r.data === 'string') {
    try { r = JSON.parse(r.data); } catch (e) { /* mantém */ }
  }
  const wrapKeys = ['result', 'body', 'payload', 'response', 'content', 'info', 'graphql'];
  for (let pass = 0; pass < 4 && r && typeof r === 'object' && !Array.isArray(r); pass++) {
    let next = null;
    for (const w of wrapKeys) {
      const inner = r[w];
      if (inner && typeof inner === 'object' && !Array.isArray(inner)) {
        if (inner.user || inner.items || inner.posts || inner.data || inner.edges || inner.medias || inner.feed) {
          next = inner;
          break;
        }
      }
    }
    if (!next) break;
    r = next;
  }
  return r;
}

function extrairErroApi(r) {
  if (!r) return null;
  if (r.success === false && (r.message || r.msg)) return String(r.message || r.msg);
  if (typeof r.message === 'string' && r.message.length) return r.message;
  if (typeof r.msg === 'string') return r.msg;
  if (typeof r.error === 'string') return r.error;
  if (r.error?.message) return String(r.error.message);
  if (r.detail) return String(r.detail);
  if (Array.isArray(r.errors) && r.errors[0]) return String(r.errors[0].message || r.errors[0]);
  if (r.status === 'fail') return r.message || r.msg || 'fail';
  return null;
}

function normalizarPosts(rawItems) {
  return (rawItems || []).slice(0, 20).map(node => {
    const cap = node.caption;
    const capText = typeof cap === 'string' ? cap : (cap?.text ?? '');
    const legenda = (node.edge_media_to_caption?.edges?.[0]?.node?.text ?? capText ?? node.accessibility_caption ?? '').slice(0, 600);
    const curtidas    = node.edge_liked_by?.count ?? node.like_count ?? node.likes_count ?? 0;
    const comentarios = node.edge_media_to_comment?.count ?? node.comment_count ?? 0;
    const is_video    = !!(node.is_video || Number(node.media_type) === 2 || node.type === 'video' || node.product_type === 'clips');
    const engajamento = Number(curtidas) + Number(comentarios);
    return {
      shortCode:     node.shortcode ?? node.code ?? '',
      url:           `https://www.instagram.com/p/${node.shortcode ?? node.code ?? ''}/`,
      legenda,
      curtidas:      Number(curtidas),
      comentarios:   Number(comentarios),
      visualizacoes: node.video_view_count ?? node.play_count ?? 0,
      tipo:          is_video ? 'video' : ((node.edge_sidecar_to_children?.edges?.length || node.carousel_media) ? 'carrossel' : 'foto'),
      videoUrl:      node.video_url ?? node.video_versions?.[0]?.url ?? null,
      thumbnailUrl:  node.display_url ?? node.thumbnail_url ?? node.thumbnail_src ?? node.image_versions2?.candidates?.[0]?.url ?? null,
      data:          node.taken_at_timestamp
                       ? new Date(node.taken_at_timestamp * 1000).toISOString()
                       : null,
      engajamento,
    };
  });
}

function extrairUserERawItems(resp, origHandle) {
  const r0 = prepararResposta(resp);
  let u = r0.user ?? r0.data?.user ?? r0.data?.graphql?.user ?? r0.graphql?.user ?? {};
  if (!u || !Object.keys(u).length) u = r0.result?.user ?? r0.profile ?? {};
  if (!u || !Object.keys(u).length) {
    if (looksLikeIgUser(r0)) u = r0;
  }
  let rawItems =
    r0.items ??
    r0.data?.items ??
    r0.posts ??
    r0.data?.posts ??
    r0.medias ??
    r0.feed ??
    r0.collector ??
    r0.data?.collector ??
    r0.timeline ??
    [];
  rawItems = flattenEdgeNodes(rawItems);
  if (!rawItems.length && Array.isArray(r0.data) && r0.data.length) {
    const cand = flattenEdgeNodes(r0.data);
    if (cand.length && looksLikeIgPost(cand[0])) rawItems = cand;
  }
  if (!rawItems.length && u.edge_owner_to_timeline_media?.edges) {
    rawItems = flattenEdgeNodes(u.edge_owner_to_timeline_media.edges);
  }
  if (!rawItems.length && Array.isArray(u.edge_felix_video_timeline?.edges)) {
    rawItems = flattenEdgeNodes(u.edge_felix_video_timeline.edges);
  }
  if (!u || !Object.keys(u).length) {
    const found = deepFindUser(r0, 0, new Set());
    if (found) u = found;
  }
  if (!rawItems.length) {
    const foundP = deepFindPostsArray(r0, 0, new Set());
    if (foundP?.length) rawItems = foundP;
  }
  rawItems = flattenEdgeNodes(rawItems);

  if (rawItems.length && (!u.username || !Object.keys(u).length)) {
    const owner = rawItems[0].owner || rawItems[0].user;
    if (owner && typeof owner === 'object') u = { ...owner, ...u };
  }

  const h = String(origHandle || '').replace(/^@/, '').trim().toLowerCase();
  const uname = String(u.username || u.user_name || '').replace(/^@/, '').trim().toLowerCase();
  let aviso = null;
  if (h && uname && h !== uname) aviso = rawItems.length ? 'username_difere_mas_ha_posts' : 'username_resposta_diferente';

  return { u, rawItems, aviso };
}

return rapItems.map((rapItem, idx) => {
  const orig = origItems[idx]?.json || {};
  const resp = rapItem.json;
  const handleAlvo = orig.handle || '';

  const { u, rawItems, aviso } = extrairUserERawItems(resp, handleAlvo);
  const posts = normalizarPosts(rawItems);
  const seguidores  = Number(u.edge_followed_by?.count ?? u.follower_count ?? u.followers ?? 0);
  const seguindo    = Number(u.edge_follow?.count ?? u.following_count ?? u.following ?? 0);
  const total_posts = Number(u.edge_owner_to_timeline_media?.count ?? u.media_count ?? u.edge_media_collections?.count ?? 0);
  const totalEng = posts.reduce((s, x) => s + x.engajamento, 0);
  const taxa_engajamento = posts.length && seguidores
    ? ((totalEng / posts.length / seguidores) * 100).toFixed(2)
    : '0.00';
  const media_curtidas = posts.length ? Math.round(posts.reduce((s, x) => s + x.curtidas, 0) / posts.length) : 0;
  const media_comentarios = posts.length ? Math.round(posts.reduce((s, x) => s + x.comentarios, 0) / posts.length) : 0;
  const total = posts.length || 1;
  const qtdVideo = posts.filter(p => p.tipo === 'video').length;
  const qtdCarrossel = posts.filter(p => p.tipo === 'carrossel').length;
  const qtdFoto = posts.filter(p => p.tipo === 'foto').length;

  const apiErro = extrairErroApi(resp);
  const semDados = !seguidores && !posts.length && !total_posts;
  const debugVazio = semDados && !apiErro ? {
    chaves_raiz: Object.keys(resp || {}).slice(0, 20),
    chaves_data: (resp?.data && typeof resp.data === 'object' && !Array.isArray(resp.data)) ? Object.keys(resp.data).slice(0, 20) : null,
  } : null;

  return { json: {
    handle:         orig.handle,
    tipo:           orig.tipo,
    nome_cliente:   orig.nome_cliente,
    nicho:          orig.nicho,
    handle_cliente: orig.handle_cliente,
    concorrentes:   orig.concorrentes,
    todos_handles:  orig.todos_handles,
    bio:            u.biography ?? u.biography_with_entities?.raw_text ?? u.bio ?? '',
    seguidores,
    seguindo,
    total_posts,
    verificado:     !!(u.is_verified ?? u.is_verified_user),
    link_externo:   u.external_url ?? u.external_url_linkshimmed ?? '',
    taxa_engajamento,
    media_curtidas,
    media_comentarios,
    mix_formatos: {
      reels_pct:     Math.round((qtdVideo / total) * 100),
      carrossel_pct: Math.round((qtdCarrossel / total) * 100),
      foto_pct:      Math.round((qtdFoto / total) * 100),
    },
    posts,
    top_posts: [...posts].sort((a, b) => b.engajamento - a.engajamento).slice(0, 5),
    posts_video: posts.filter(x => x.tipo === 'video' && x.videoUrl),
    ultimos_15_posts: posts.slice(0, 15),
    meta_coleta: {
      indice_batch: idx,
      aviso_username: aviso,
      erro_api: apiErro || null,
      perfil_sem_dados_publicos: semDados,
      debug_resposta_vazia: debugVazio,
    },
  }};
});
"""

SEPARAR = r"""// Agrupa perfis + matriz comparativa para o GPT
const perfis = $input.first().json.perfis || [];

const cliente_dados = perfis.find(p => p.tipo === 'cliente') || null;
const concorrentes_dados = perfis.filter(p => p.tipo === 'concorrente');

if (!cliente_dados) {
  throw new Error('Perfil do cliente não encontrado após agregar. Verifique handle_cliente e todos_handles.');
}

const melhor_concorrente = concorrentes_dados.reduce((best, c) => {
  return parseFloat(c.taxa_engajamento) > parseFloat(best?.taxa_engajamento || '0') ? c : best;
}, null);

const gap_engajamento = melhor_concorrente
  ? (parseFloat(melhor_concorrente.taxa_engajamento) - parseFloat(cliente_dados.taxa_engajamento)).toFixed(2)
  : '0.00';

const matriz_comparativa = perfis.map(p => ({
  handle: `@${p.handle}`,
  papel: p.tipo,
  page_name: p.page_name || p.full_name || '',
  is_private: !!p.is_private,
  links_no_perfil: (p.bio_links || []).length,
  seguidores: p.seguidores,
  seguindo: p.seguindo,
  total_posts_api: p.total_posts,
  taxa_engajamento_pct: p.taxa_engajamento,
  media_curtidas: p.media_curtidas,
  media_comentarios: p.media_comentarios,
  mix_formatos: p.mix_formatos,
  posts_amostra: (p.posts || []).length,
  erro_ou_vazio: !!(p.meta_coleta?.erro_api || p.meta_coleta?.perfil_sem_dados_publicos),
}));

const maior_seg = perfis.reduce((m, p) => (p.seguidores > m ? p.seguidores : m), 0);
const insights_rapidos = {
  cliente_vs_maior_seguidores: maior_seg
    ? `${((cliente_dados.seguidores / maior_seg) * 100).toFixed(1)}% do maior alcance entre os perfis coletados`
    : '[sem base]',
  concorrentes_com_mais_engajamento_medio: (concorrentes_dados || [])
    .filter(c => parseFloat(c.taxa_engajamento) > parseFloat(cliente_dados.taxa_engajamento))
    .map(c => c.handle),
};

return [{ json: {
  nome_cliente: cliente_dados.nome_cliente,
  nicho: cliente_dados.nicho,
  handle_cliente: cliente_dados.handle_cliente,
  concorrentes: cliente_dados.concorrentes,
  todos_handles: cliente_dados.todos_handles,
  iniciado_em: new Date().toISOString(),
  cliente_dados,
  concorrentes_dados,
  total_perfis: perfis.length,
  melhor_concorrente_handle: melhor_concorrente?.handle || null,
  gap_engajamento_pct: gap_engajamento,
  matriz_comparativa,
  insights_rapidos,
}}];
"""

ENRICH = r"""function extrairOrganic(raw) {
  if (!raw || typeof raw !== 'object') return [];
  if (Array.isArray(raw.organic)) return raw.organic;
  if (Array.isArray(raw.organic_results)) {
    return raw.organic_results.map(r => ({
      title: r.title,
      snippet: r.snippet,
      link: r.link || r.redirect_link,
    }));
  }
  return [];
}

function achatarAdsFacebook(raw) {
  if (!raw) return [];
  if (Array.isArray(raw) && raw.length && raw[0]?.snapshot) return raw.slice(0, 40);
  const grupos = raw?.data?.ads || raw?.ads;
  if (!Array.isArray(grupos)) return [];
  const out = [];
  for (const g of grupos) {
    const arr = Array.isArray(g) ? g : [g];
    for (const ad of arr) {
      if (!ad) continue;
      const snap = ad.snapshot || ad;
      out.push({
        pageName: ad.page_name || snap.page_name || '',
        page_id: ad.page_id || snap.page_id,
        title: snap.title || snap.body?.text || ad.title || '',
        ad_creative_body: snap.body?.text || '',
        cta_text: snap.cta_text || ad.cta_text || '',
        call_to_action_type: snap.cta_type || '',
        ad_type: snap.display_format || '',
        snapshot_url: snap.link_url || snap.page_profile_uri || '',
        is_active: ad.is_active !== false,
      });
    }
  }
  return out.slice(0, 25);
}

const base = $('Separar Cliente e Concorrentes').first().json;
const tendRaw = $('Serper — Tendências do Nicho3').first().json;
const kwRaw = $('Serper — Keywords do Nicho').first().json;
const adsRaw = $('Facebook Ads Library').first().json;

const tendencias_google = extrairOrganic(tendRaw).slice(0, 8).map(r => ({
  titulo: r.title,
  snippet: r.snippet,
  link: r.link,
}));

const keywords_google = extrairOrganic(kwRaw).slice(0, 8).map(r => ({
  titulo: r.title,
  snippet: r.snippet,
}));

const adsList = achatarAdsFacebook(adsRaw);
const anuncios_facebook = adsList.map(ad => ({
  page_name: ad.pageName || ad.page_name || '',
  titulo: ad.title || ad.ad_creative_body || '',
  cta: ad.cta_text || ad.call_to_action_type || '',
  status: ad.is_active ? 'ativo' : 'inativo',
  formato: ad.ad_type || '',
  url_destino: ad.snapshot_url || '',
}));

const allVideos = [];
(base.concorrentes_dados || []).forEach(conc => {
  (conc.posts_video || []).forEach(post => {
    if (post.videoUrl) {
      allVideos.push({
        ...post,
        handle_concorrente: conc.handle,
        seguidores_conc: conc.seguidores,
        taxa_eng_perfil: conc.taxa_engajamento,
      });
    }
  });
});
allVideos.sort((a, b) => b.engajamento - a.engajamento);
const top3 = allVideos.slice(0, 3);

const mergedBase = {
  ...base,
  tendencias_google,
  keywords_google,
  anuncios_facebook,
};

if (top3.length === 0) {
  return [{ json: { ...mergedBase, video_atual: null, sem_videos: true, top_virais: [] } }];
}

return top3.map((video, idx) => ({
  json: {
    ...mergedBase,
    video_atual: video,
    video_index: idx,
    sem_videos: false,
    top_virais: top3,
  }
}));
"""

EXPAND = r"""// 1 item → N itens (1 por handle). Normaliza @ e ordem: cliente primeiro.
const data = $input.first().json;
if (!Array.isArray(data.todos_handles) || data.todos_handles.length === 0) {
  throw new Error('todos_handles ausente ou vazio.');
}
const hc = String(data.handle_cliente || '').replace(/^@/, '').trim().toLowerCase();
const conc = (data.concorrentes || []).map(h => String(h).replace(/^@/, '').trim().toLowerCase()).filter(Boolean);
const todos = [hc, ...conc.filter(h => h !== hc)];

return todos.map(handle => ({
  json: {
    nome_cliente: data.nome_cliente,
    nicho: data.nicho,
    handle_cliente: hc,
    concorrentes: conc,
    todos_handles: todos,
    iniciado_em: data.iniciado_em,
    handle,
    tipo: handle === hc ? 'cliente' : 'concorrente',
  }
}));
"""

nodes["Normalizar Perfil"]["parameters"]["jsCode"] = NORMALIZAR
nodes["Separar Cliente e Concorrentes"]["parameters"]["jsCode"] = SEPARAR
nodes["Enriquecer Dados + Identificar Vídeos Virais"]["parameters"]["jsCode"] = ENRICH
nodes["Expandir Handles"]["parameters"]["jsCode"] = EXPAND

rap = nodes["RapidAPI — Buscar Perfil Instagram"]
rap["parameters"]["headerParameters"]["parameters"][0]["value"] = (
    "={{ $env.RAPIDAPI_KEY || '0127634a29msh4a303edef58f6dbp1430c6jsnd00af7a6bc1e' }}"
)
rap["parameters"]["jsonBody"] = (
    "={{ JSON.stringify({ username: String($json.handle || '').replace(/^@/, '').trim(), maxId: '' }) }}"
)
opts = rap["parameters"].setdefault("options", {})
opts["timeout"] = 45000
opts["batching"] = {"batch": {"batchSize": 1, "batchInterval": 750}}

fb = nodes["Facebook Ads Library"]
fb["parameters"]["sendBody"] = False
for k in ("jsonBody", "specifyBody"):
    fb["parameters"].pop(k, None)
fb["parameters"]["headerParameters"]["parameters"][0]["value"] = (
    "={{ $env.RAPIDAPI_KEY || '0127634a29msh4a303edef58f6dbp1430c6jsnd00af7a6bc1e' }}"
)

for name in ("Montar Payload GPT-4o", "Montar Payload GPT-4o (sem vídeos)"):
    js = nodes[name]["parameters"]["jsCode"]
    js = js.replace("$('Serper — Tendências do Nicho')", "$('Serper — Tendências do Nicho3')")
    js = js.replace("$('Apify — Facebook Ads Library')", "$('Facebook Ads Library')")
    if "organic_results" not in js and "_orgT" not in js:
        js = js.replace(
            "const tendencias_google = (tendencias.organic || []).slice(0, 8).map(r => ({ titulo: r.title, snippet: r.snippet, link: r.link }));",
            "const _orgT = (tendencias.organic || tendencias.organic_results || []).slice(0, 8).map(r => ({ title: r.title, snippet: r.snippet, link: r.link || r.redirect_link }));\nconst tendencias_google = _orgT.map(r => ({ titulo: r.title, snippet: r.snippet, link: r.link }));",
        )
        js = js.replace(
            "const keywords_google   = (keywords.organic   || []).slice(0, 8).map(r => ({ titulo: r.title, snippet: r.snippet }));",
            "const keywords_google = (keywords.organic || keywords.organic_results || []).slice(0, 8).map(r => ({ titulo: r.title, snippet: r.snippet }));",
        )
    if "_flatAds" not in js:
        js = js.replace(
            "const anuncios_facebook = (Array.isArray(adsRaw) ? adsRaw : []).slice(0, 15).map(ad => ({",
            """function _flatAds(raw) { if (!raw) return []; const g = raw?.data?.ads || raw?.ads; if (!Array.isArray(g)) return Array.isArray(raw) ? raw.slice(0, 20) : []; const o = []; for (const x of g) { const a = Array.isArray(x) ? x : [x]; for (const ad of a) { const s = ad?.snapshot; if (s) o.push({ pageName: ad.page_name || s.page_name, title: s.title || s.body?.text, ad_creative_body: s.body?.text, cta_text: s.cta_text, call_to_action_type: s.cta_type, ad_type: s.display_format, snapshot_url: s.link_url, is_active: ad.is_active }); } } return o; }
const anuncios_facebook = _flatAds(adsRaw).slice(0, 15).map(ad => ({""",
        )
    if "matriz_comparativa" not in js:
        js = js.replace(
            "const userContent = JSON.stringify({\n  cliente:                   cliente_resumo,\n  concorrentes:              concorrentes_resumo,",
            "const userContent = JSON.stringify({\n  matriz_comparativa:        base.matriz_comparativa || [],\n  insights_rapidos:          base.insights_rapidos || {},\n  cliente:                   cliente_resumo,\n  concorrentes:              concorrentes_resumo,",
        )
    nodes[name]["parameters"]["jsCode"] = js

# Whisper: 502 na borda Cloudflare/OpenAI costuma ser transitório — retentativas + timeout maior.
whisper = nodes.get("OpenAI Whisper — Transcrição")
if whisper:
    whisper["retryOnFail"] = True
    whisper["maxTries"] = 5
    whisper["waitBetweenTries"] = 5000
    wopts = whisper["parameters"].setdefault("options", {})
    wopts["timeout"] = max(int(wopts.get("timeout", 0) or 0), 180000)

_inj = Path(__file__).resolve().parent / "_inject_whisper_compress.py"
_spec = importlib.util.spec_from_file_location("whisper_compress_inj", _inj)
_mod = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_mod)
_mod.apply_to_flow(data)

path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
print("OK:", path)
