// Combina userInfo (perfil) + posts + contexto Expandir Handles — mesma ordem de itens (índice).
// userInfo: POST /api/instagram/userInfo → result[0].user
const rapItems  = $input.all();
const userItems = $('RapidAPI — UserInfo Instagram').all();
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

function extrairUserDoUserInfo(uiJson) {
  const arr = uiJson?.result;
  if (!Array.isArray(arr) || !arr.length) return { user: null, rowStatus: null };
  const row = arr[0];
  return { user: row?.user && typeof row.user === 'object' ? row.user : null, rowStatus: row?.status ?? null };
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

function mapBioLinks(links) {
  if (!Array.isArray(links)) return [];
  return links.slice(0, 12).map(b => ({
    url: b.url || b.lynx_url || '',
    title: b.title || '',
  })).filter(x => x.url);
}

return rapItems.map((rapItem, idx) => {
  const orig = origItems[idx]?.json || {};
  const uiJson = userItems[idx]?.json || {};
  const { user: profileUi, rowStatus: userInfoRowStatus } = extrairUserDoUserInfo(uiJson);
  const resp = rapItem.json;
  const handleAlvo = orig.handle || '';

  const { u: uPosts, rawItems, aviso } = extrairUserERawItems(resp, handleAlvo);
  let u = { ...uPosts };
  if (profileUi && typeof profileUi === 'object') u = { ...uPosts, ...profileUi };

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

  const bioLinksNorm = mapBioLinks(u.bio_links);
  const primeiroBio = bioLinksNorm[0]?.url || '';
  const link_externo = u.external_url || u.external_lynx_url || primeiroBio || '';

  const apiErroPosts = extrairErroApi(resp);
  const apiErroUi = extrairErroApi(uiJson);
  const apiErro = apiErroPosts || apiErroUi;

  const temPerfilUserInfo = !!(profileUi && (profileUi.username || profileUi.follower_count != null || profileUi.biography));
  const semDados = !temPerfilUserInfo && !seguidores && !posts.length && !total_posts;

  const debugVazio = semDados && !apiErro ? {
    chaves_raiz_posts: Object.keys(resp || {}).slice(0, 18),
    chaves_raiz_userinfo: Object.keys(uiJson || {}).slice(0, 18),
    userinfo_row_status: userInfoRowStatus,
  } : null;

  return { json: {
    handle:         orig.handle,
    tipo:           orig.tipo,
    nome_cliente:   orig.nome_cliente,
    nicho:          orig.nicho,
    handle_cliente: orig.handle_cliente,
    concorrentes:   orig.concorrentes,
    todos_handles:  orig.todos_handles,
    full_name:      u.full_name ?? '',
    page_name:      u.page_name ?? '',
    bio:            u.biography ?? u.biography_with_entities?.raw_text ?? u.bio ?? '',
    bio_links:      bioLinksNorm,
    link_externo,
    profile_pic_url: u.profile_pic_url ?? u.hd_profile_pic_url_info?.url ?? '',
    is_private:     !!u.is_private,
    is_business:    !!u.is_business,
    categoria_conta: u.category || u.account_category || '',
    contatos_publicos: {
      email: u.public_email || null,
      telefone: u.public_phone_number || u.contact_phone_number || null,
      ddi: u.public_phone_country_code || null,
    },
    seguidores,
    seguindo,
    total_posts,
    verificado:     !!(u.is_verified ?? u.is_verified_user),
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
      userinfo_row_status: userInfoRowStatus,
      tem_userinfo: temPerfilUserInfo,
      debug_resposta_vazia: debugVazio,
    },
  }};
});
