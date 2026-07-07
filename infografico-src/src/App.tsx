import { useState, useEffect, useCallback } from 'react';
import { marketingData as demoData } from './data';

interface Comentario {
  id: string; texto: string; palavras: number;
  comentador_username: string | null; is_verified: boolean;
  created_at: number | null;
  comentario_foi_respondido_pelo_dono?: boolean;
  respostas: Comentario[];
}
interface AuditPost {
  link_post: string; tipo_conteudo: string; formato_midia: string;
  link_midia: string; thumb: string | null; legenda: string;
  curtidas: number; comentarios: number; views: number;
  engajamento_total: number; publicado_em: string;
  comentarios_ordenados?: Comentario[];
}
interface AuditData {
  nome_cliente: string; handle_cliente: string;
  cliente: {
    handle: string;
    perfil: { metricas: { seguidores: number; seguindo: number; qtd_posts: number; ratio_seguidor_seguindo: number }; biografia: string; foto_perfil?: string; foto_perfil_hd?: string };
    posts: AuditPost[];
  };
  concorrentes: Array<{
    handle: string; encontrado: boolean;
    perfil: { metricas: { seguidores: number; qtd_posts: number } };
    posts: AuditPost[];
    metricas_posts: { taxa_engajamento: string; media_curtidas: number; media_comentarios: number; media_views: number; mix_formatos: { reels_pct: number; carrossel_pct: number; foto_pct: number }; top_posts?: AuditPost[] };
  }>;
  analise_conteudo: {
    cliente: { ganchos_top: Array<{ shortcode: string; primeira_linha: string; tipo_conteudo: string; engajamento: number; curtidas: number; comentarios: number }> };
  };
}

declare global {
  interface Window {
    __MARKETING_DATA__?: typeof demoData;
    __SECTION__?: string;
    __AUDIT_DATA__?: AuditData;
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function withDefaults(raw: any): typeof demoData {
  const ov = raw?.overview_cliente ?? {};
  const dt = raw?.diretrizes_tecnicas ?? {};
  const tv = dt.tom_de_voz ?? {};
  const seo = dt.seo_instagram ?? {};
  const freq = dt.frequencia_publicacao ?? {};
  const hash = dt.hashtags_estrategicas ?? {};
  const iv = dt.identidade_visual ?? {};
  const vest = iv.vestimenta_aparicoes ?? {};
  const tipo = iv.tipografia ?? {};
  return {
    overview_cliente: {
      diagnostico_identidade:      ov.diagnostico_identidade      ?? '',
      posicionamento_atual:        ov.posicionamento_atual         ?? '',
      pontos_fortes:               ov.pontos_fortes                ?? [],
      pontos_fracos:               ov.pontos_fracos                ?? [],
      comparativo_concorrentes:    ov.comparativo_concorrentes     ?? [],
      caminhos_de_crescimento:     ov.caminhos_de_crescimento      ?? [],
      previsao_resultados:         ov.previsao_resultados          ?? { '30_dias': '—', '60_dias': '—', '90_dias': '—' },
      carta_para_cliente_markdown: ov.carta_para_cliente_markdown  ?? '',
    },
    diretrizes_tecnicas: {
      tom_de_voz: {
        personalidade:        tv.personalidade        ?? '',
        como_falar:           tv.como_falar           ?? [],
        como_nao_falar:       tv.como_nao_falar       ?? [],
        exemplos_frase_ok:    tv.exemplos_frase_ok    ?? [],
        exemplos_frase_evitar:tv.exemplos_frase_evitar?? [],
      },
      seo_instagram: {
        palavras_chave_principais:   seo.palavras_chave_principais   ?? [],
        palavras_chave_secundarias:  seo.palavras_chave_secundarias  ?? [],
        bio_otimizada:               seo.bio_otimizada               ?? seo.uso_em_bio ?? '',
        hashtags_fixas:              seo.hashtags_fixas              ?? [],
        uso_em_bio:                  seo.uso_em_bio                  ?? seo.bio_otimizada ?? '',
        uso_em_legenda:              seo.uso_em_legenda              ?? '',
        uso_em_alt_text:             seo.uso_em_alt_text             ?? '',
        categoria_perfil_recomendada:seo.categoria_perfil_recomendada ?? seo.categoria_recomendada ?? '',
      },
      frequencia_publicacao: {
        posts_por_semana:      freq.posts_por_semana      ?? 0,
        posts_por_dia:         freq.posts_por_dia         ?? 0,
        melhor_horario:        freq.melhor_horario        ?? '',
        melhores_horarios:     Array.isArray(freq.melhores_horarios) ? freq.melhores_horarios : (freq.melhor_horario ? [freq.melhor_horario] : []),
        dias_de_pico:          freq.dias_de_pico ?? [],
        distribuicao_formatos: freq.distribuicao_formatos ?? {},
      },
      pilares_conteudo:      dt.pilares_conteudo   ?? [],
      assuntos_quentes:      dt.assuntos_quentes   ?? [],
      ideias_de_titulos:     dt.ideias_de_titulos  ?? [],
      ganchos_modelo:        dt.ganchos_modelo     ?? [],
      ctas_recomendados:     dt.ctas_recomendados  ?? [],
      hashtags_estrategicas: {
        core:                  hash.core                  ?? [],
        rotativas_alto_volume: hash.rotativas_alto_volume ?? [],
        rotativas_nicho:       hash.rotativas_nicho       ?? [],
        evite:                 hash.evite                 ?? [],
      },
      identidade_visual: {
        paleta_cores: Array.isArray(iv.paleta_cores) ? iv.paleta_cores : [],
        tipografia: {
          display:    tipo.display    ?? tipo.titulo ?? '',
          texto:      tipo.texto      ?? tipo.corpo  ?? '',
          regras_uso: tipo.regras_uso ?? [],
        },
        estilo_fotografico:  iv.estilo_fotografico  ?? '',
        estilo_grafico:      iv.estilo_grafico      ?? '',
        vestimenta_aparicoes: {
          diretrizes:       vest.diretrizes       ?? '',
          evitar:           vest.evitar           ?? [],
          mood_referencias: vest.mood_referencias ?? [],
        },
        logos_e_marca_dagua: iv.logos_e_marca_dagua ?? '',
      },
      calendario_30_dias:  dt.calendario_30_dias  ?? [],
      stories_recorrentes: dt.stories_recorrentes ?? [],
      kpis_acompanhar:     dt.kpis_acompanhar     ?? [],
      briefing_redatores:  dt.briefing_redatores  ?? '',
      briefing_designers:  dt.briefing_designers  ?? '',
    },
  } as typeof demoData;
}

const marketingData = withDefaults((window.__MARKETING_DATA__ as typeof demoData) ?? demoData);
const auditData: AuditData | undefined = window.__AUDIT_DATA__;

function fmtNum(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace('.', ',') + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace('.', ',') + 'K';
  return String(n);
}

const C = {
  primary:   '#FF6600',
  secondary: '#222222',
  green:     '#00B37E',
  yellow:    '#FFD600',
  neutral:   '#F4F4F4',
  white:     '#FFFFFF',
};

type Section     = 'all' | 'overview_cliente' | 'diretrizes_tecnicas';
type Orientation = 'landscape' | 'portrait';
type Fscale      = (n: number) => number;

// ─── DonutChart ──────────────────────────────────────────────────────────────
function DonutChart({ data, f }: { data: { label: string; value: number; color: string }[]; f: Fscale }) {
  const size = 200;
  const r    = 72;
  const cx   = size / 2;
  const cy   = size / 2;
  const circ = 2 * Math.PI * r;
  let offset = 0;
  const slices = data.map((d) => {
    const dash = (d.value / 100) * circ;
    const sl   = { ...d, dash, gap: circ - dash, offset };
    offset    += dash;
    return sl;
  });
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: f(24) }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)', flexShrink: 0 }}>
        {slices.map((s, i) => (
          <circle key={i} cx={cx} cy={cy} r={r} fill="none" stroke={s.color} strokeWidth={32}
            strokeDasharray={`${s.dash} ${s.gap}`} strokeDashoffset={-s.offset} />
        ))}
        <circle cx={cx} cy={cy} r={56} fill="#1a1a1a" />
      </svg>
      <div style={{ display: 'flex', flexDirection: 'column', gap: f(8) }}>
        {data.map((d, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: f(8) }}>
            <div style={{ width: f(12), height: f(12), borderRadius: 3, background: d.color, flexShrink: 0 }} />
            <span style={{ fontFamily: 'Roboto, sans-serif', fontSize: f(13), color: 'rgba(255,255,255,0.8)' }}>
              <strong style={{ color: d.color }}>{d.value}%</strong> — {d.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── BarChart ─────────────────────────────────────────────────────────────────
function BarChart({ bars, f }: { bars: { label: string; value: number; max: number; color: string }[]; f: Fscale }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: f(12), width: '100%' }}>
      {bars.map((b, i) => (
        <div key={i}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: f(4) }}>
            <span style={{ fontFamily: 'Roboto, sans-serif', fontSize: f(12), color: 'rgba(255,255,255,0.6)' }}>{b.label}</span>
            <span style={{ fontFamily: 'Playfair Display, Georgia, serif', fontWeight: 700, fontSize: f(12), color: b.color }}>{b.value.toLocaleString('pt-BR')}</span>
          </div>
          <div style={{ width: '100%', height: f(8), borderRadius: 99, background: 'rgba(255,255,255,0.08)' }}>
            <div style={{ width: `${(b.value / b.max) * 100}%`, height: f(8), borderRadius: 99, background: b.color }} />
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── KpiCard ──────────────────────────────────────────────────────────────────
function KpiCard({ kpi, meta30, meta60, meta90, f }: { kpi: string; meta30: string; meta60: string; meta90: string; f: Fscale }) {
  return (
    <div style={{ borderRadius: 12, padding: `${f(14)}px ${f(16)}px`, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,102,0,0.25)' }}>
      <div style={{ fontFamily: 'Playfair Display, Georgia, serif', fontWeight: 700, fontSize: f(13), color: C.primary, marginBottom: f(10) }}>{kpi}</div>
      <div style={{ display: 'flex', gap: f(8) }}>
        {[{ label: '30d', val: meta30, color: C.yellow }, { label: '60d', val: meta60, color: C.primary }, { label: '90d', val: meta90, color: C.green }].map((m) => (
          <div key={m.label} style={{ flex: 1, borderRadius: 8, padding: `${f(8)}px ${f(6)}px`, textAlign: 'center', background: 'rgba(255,255,255,0.04)' }}>
            <div style={{ fontSize: f(10), color: 'rgba(255,255,255,0.4)', fontFamily: 'Roboto' }}>{m.label}</div>
            <div style={{ fontFamily: 'Playfair Display, Georgia, serif', fontWeight: 900, fontSize: f(15), color: m.color }}>{m.val}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Tag ──────────────────────────────────────────────────────────────────────
function Tag({ text, color = C.primary, f }: { text: string; color?: string; f: Fscale }) {
  return (
    <span style={{ padding: `${f(3)}px ${f(8)}px`, borderRadius: 4, fontSize: f(11), fontWeight: 700, background: color + '22', color, border: `1px solid ${color}44`, fontFamily: 'Roboto', whiteSpace: 'nowrap' }}>
      {text}
    </span>
  );
}

// ─── Data ─────────────────────────────────────────────────────────────────────
const { overview_cliente: ov, diretrizes_tecnicas: dt } = marketingData;

// ─── Helpers ──────────────────────────────────────────────────────────────────
function extractMetrics(posicionamento: string) {
  const results: Array<{ label: string; val: string; color: string }> = [];

  // Seguidores — multiple patterns
  const seg = posicionamento.match(
    /volume\s+de\s+seguidores\s*\((\d[\d.,]+)|(\d[\d.]{2,})\s*seguidores|seguidores[^(]{0,30}\((\d[\d.,]+)/i
  );
  if (seg) results.push({ label: 'Seguidores', val: seg[1] || seg[2] || seg[3], color: '#FFFFFF' });

  // Curtidas médias — multiple patterns
  const curt = posicionamento.match(
    /curtidas\s+médias?\s*\((\d[\d.,]+)|média\s+de\s+(\d[\d.,]+)\s+curtidas|(\d[\d.,]+)\s+curtidas\s+médias?|(\d[\d.,]+)\s+curtidas/i
  );
  if (curt) results.push({ label: 'Curtidas médias', val: curt[1] || curt[2] || curt[3] || curt[4], color: '#00B37E' });

  // Engajamento — "vs CLIENT" patterns first (most reliable), then fallbacks
  const eng = posicionamento.match(
    /taxa\s+de\s+engajamento[^(]{0,60}\([\d,\.]+\s+vs\s+([\d,\.]+)\)|engajamento[^(]{0,60}\([\d,\.]+\s+vs\s+([\d,\.]+)\)|taxa\s+de\s+([\d,\.]+)\b(?!\s*%?\s*\w)/i
  );
  if (eng) {
    const val = eng[1] || eng[2] || eng[3];
    if (val) results.push({ label: 'Engajamento', val, color: '#FFD600' });
  }
  return results.slice(0, 3);
}

function extractCompetitorMetrics(posicionamento: string, handle: string) {
  const name = handle.replace('@', '').split('.')[0].toLowerCase();
  const ltext = posicionamento.toLowerCase();
  const idx = ltext.indexOf(name);
  if (idx === -1) return [] as Array<{ label: string; val: string; color: string }>;
  const segment = posicionamento.slice(idx, Math.min(idx + 600, posicionamento.length));

  const res: Array<{ label: string; val: string; color: string }> = [];

  // Seguidores: "base de seguidores word (NUMBER)" or "vs NUMBER[3+ digits]"
  const seg = segment.match(
    /base\s+de\s+seguidores[^(]{0,30}\((\d[\d.,]+)|vs\s+(\d{3}[\d.,]*)\D|seguidores[^(]{0,30}\([\d.,]+\s+vs\s+(\d[\d.,]+)/i
  );
  if (seg) {
    const val = seg[1] || seg[2] || seg[3];
    if (val) res.push({ label: 'Seguidores', val, color: '#FFFFFF' });
  }

  // Curtidas: "concorrente tem NUMBER curtidas" or "NUMBER curtidas médias"
  const curt = segment.match(/concorrente[^.]{0,80}?(\d[\d.,]+)\s+curtidas|(\d[\d.,]+)\s+curtidas\s+médias/i);
  if (curt) res.push({ label: 'Curtidas médias', val: curt[1] || curt[2], color: '#00B37E' });

  // Engajamento: "taxa de engajamento ... (NUMBER"
  const eng = segment.match(/taxa\s+de\s+engajamento[^(]{0,60}\(([\d,\.]+)|taxa\s+de\s+([\d,\.]+)\b/i);
  if (eng) res.push({ label: 'Engajamento', val: eng[1] || eng[2], color: '#FFD600' });

  return res.slice(0, 3);
}

// ─── Slides ───────────────────────────────────────────────────────────────────
function buildSlides(section: Section, f: Fscale, isP: boolean) {
  const lh = 1.2;
  const all: { id: string; section: 'overview_cliente' | 'diretrizes_tecnicas'; render: () => JSX.Element; renderPrint?: () => JSX.Element }[] = [];

  // ── OVERVIEW ────────────────────────────────────────────────────────────────
  if (section === 'all' || section === 'overview_cliente') {

    all.push({ id: 'ov-cover', section: 'overview_cliente', render: () => (
      <div style={{ width: '100%', height: '100%', background: C.primary, display: 'flex', flexDirection: 'column' }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '0 80px' }}>
          <div style={{ fontFamily: 'Roboto', fontSize: f(15), color: 'rgba(255,255,255,0.7)', letterSpacing: 5, textTransform: 'uppercase' }}>Análise de Perfil Instagram</div>
          <div style={{ marginTop: f(16), fontFamily: 'Playfair Display, Georgia, serif', fontWeight: 900, fontSize: 76, color: C.white, lineHeight: 1.2, textTransform: 'uppercase', letterSpacing: 2 }}>
            OVERVIEW<br />DO CLIENTE
          </div>
          <div style={{ marginTop: f(24), fontFamily: 'Roboto', fontSize: f(20), color: 'rgba(255,255,255,0.85)', maxWidth: 580, lineHeight: lh }}>
            Diagnóstico completo, posicionamento competitivo e caminhos de crescimento para <strong>{ov.diagnostico_identidade.match(/@[\w.]+/)?.[0] ?? 'seu perfil'}</strong>
          </div>
        </div>
        <div style={{ padding: `0 80px ${f(40)}px`, display: 'flex', alignItems: 'center', gap: f(16) }}>
          <div style={{ width: f(48), height: f(4), borderRadius: 99, background: C.yellow }} />
          <div style={{ fontFamily: 'Roboto', fontSize: f(14), color: 'rgba(255,255,255,0.5)' }}>Radar de Marketing Digital</div>
        </div>
      </div>
    )});

    all.push({ id: 'ov-diagnostico', section: 'overview_cliente', render: () => {
      const handle = ov.diagnostico_identidade.match(/@[\w.]+/)?.[0] ?? '';
      const paragraphs = ov.diagnostico_identidade.split('\n\n').filter(Boolean);
      const keywords = dt.seo_instagram.palavras_chave_principais.slice(0, 3);
      const diagCliente = auditData?.cliente;
      const diagMet = diagCliente?.perfil?.metricas;
      const diagPosts = diagCliente?.posts ?? [];
      const diagAvgCurt = diagPosts.length ? Math.round(diagPosts.reduce((s, p) => s + (p.curtidas || 0), 0) / diagPosts.length) : null;
      const diagAvgComt = diagPosts.length ? Math.round(diagPosts.reduce((s, p) => s + (p.comentarios || 0), 0) / diagPosts.length) : null;
      const diagTotalEng = diagPosts.reduce((s, p) => s + (p.engajamento_total || 0), 0);
      const diagEngRate = (diagMet && diagPosts.length && diagMet.seguidores > 0) ? ((diagTotalEng / diagPosts.length) / diagMet.seguidores * 100).toFixed(2) : null;
      const diagFoto = diagCliente?.perfil?.foto_perfil_hd ?? diagCliente?.perfil?.foto_perfil ?? null;
      const diagBio  = diagCliente?.perfil?.biografia ?? null;
      const auditMetrics = diagMet ? [
        { label: 'Seguidores',    val: fmtNum(diagMet.seguidores),  color: C.white },
        { label: 'Posts',         val: fmtNum(diagMet.qtd_posts),   color: C.white },
        ...(diagAvgCurt  !== null ? [{ label: 'Méd. curtidas', val: fmtNum(diagAvgCurt),  color: C.yellow }] : []),
        ...(diagAvgComt  !== null ? [{ label: 'Méd. coment.',  val: fmtNum(diagAvgComt),  color: C.yellow }] : []),
        ...(diagEngRate  !== null ? [{ label: 'Engajamento',   val: `${diagEngRate}%`,     color: C.green  }] : []),
      ] : extractMetrics(ov.posicionamento_atual);
      return (
        <div style={{ width: '100%', height: '100%', background: C.secondary, display: 'flex', flexDirection: isP ? 'column' : 'row' }}>
          <div style={{ width: isP ? '100%' : '33%', background: C.primary, display: 'flex', flexDirection: 'column', gap: f(14), padding: isP ? `${f(20)}px 40px` : 48 }}>
            {/* Handle */}
            <div style={{ display: 'flex', alignItems: 'center', gap: f(14) }}>
              <div>
                <div style={{ fontFamily: 'Roboto', fontSize: f(10), color: 'rgba(255,255,255,0.6)', letterSpacing: 3, textTransform: 'uppercase' }}>Slide 01</div>
                <div style={{ fontFamily: 'Playfair Display, Georgia, serif', fontWeight: 900, fontSize: f(20), color: C.white, textTransform: 'uppercase', lineHeight: 1.1 }}>DIAGNÓSTICO DE IDENTIDADE</div>
                {handle && <div style={{ fontFamily: 'Roboto', fontSize: f(13), color: 'rgba(255,255,255,0.85)' }}>{handle}</div>}
              </div>
            </div>
            {/* Métricas reais */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: f(6) }}>
              {auditMetrics.map((m, i) => (
                <div key={i} style={{ borderRadius: 10, padding: `${f(8)}px ${f(12)}px`, background: 'rgba(0,0,0,0.2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ fontFamily: 'Roboto', fontSize: f(9), color: 'rgba(255,255,255,0.55)', textTransform: 'uppercase', letterSpacing: 1 }}>{m.label}</div>
                  <div style={{ fontFamily: 'Playfair Display, Georgia, serif', fontWeight: 900, fontSize: f(18), color: m.color }}>{m.val}</div>
                </div>
              ))}
            </div>
            {/* Bio */}
            {diagBio && (
              <div style={{ padding: `${f(8)}px ${f(10)}px`, borderRadius: 10, background: 'rgba(0,0,0,0.15)', fontFamily: 'Roboto', fontSize: f(9), color: 'rgba(255,255,255,0.75)', lineHeight: 1.4, fontStyle: 'italic' }}>
                "{diagBio}"
              </div>
            )}
            {keywords.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: f(6) }}>
                {keywords.map((k) => <Tag key={k} text={k} color="rgba(255,255,255,0.9)" f={f} />)}
              </div>
            )}
          </div>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: `${f(40)}px ${f(48)}px`, gap: f(20), overflow: 'hidden' }}>
            {paragraphs.map((p, i) => (
              <div key={i} style={{ padding: i === 0 ? 0 : f(16), borderRadius: i === 0 ? 0 : 12, background: i === 0 ? 'transparent' : 'rgba(255,102,0,0.08)', border: i === 0 ? 'none' : '1px solid rgba(255,102,0,0.25)' }}>
                {i > 0 && <span style={{ fontSize: f(16) }}>⚠️ </span>}
                <span style={{ fontFamily: 'Roboto, sans-serif', fontSize: f(14), color: i === 0 ? 'rgba(255,255,255,0.85)' : C.primary, lineHeight: lh }}>{p}</span>
              </div>
            ))}
          </div>
        </div>
      );
    }});

    all.push({ id: 'ov-posicionamento', section: 'overview_cliente', render: () => {
      const handle = ov.diagnostico_identidade.match(/@[\w.]+/)?.[0] ?? 'Seu perfil';
      const clientMetricsFallback = extractMetrics(ov.posicionamento_atual);
      const auditCliente = auditData?.cliente;
      const auditMet = auditCliente?.perfil?.metricas;
      const auditPosts = auditCliente?.posts ?? [];
      const avgCurtidas = auditPosts.length ? Math.round(auditPosts.reduce((s, p) => s + (p.curtidas || 0), 0) / auditPosts.length) : null;
      const avgComentarios = auditPosts.length ? Math.round(auditPosts.reduce((s, p) => s + (p.comentarios || 0), 0) / auditPosts.length) : null;
      const totalEngaj = auditPosts.length ? auditPosts.reduce((s, p) => s + (p.engajamento_total || 0), 0) : 0;
      const clientEngRate = (auditMet && auditPosts.length && auditMet.seguidores > 0) ? ((totalEngaj / auditPosts.length) / auditMet.seguidores * 100).toFixed(2) : null;
      const reelsCt = auditPosts.filter(p => p.tipo_conteudo === 'video').length;
      const fotoCt = auditPosts.filter(p => p.tipo_conteudo === 'image' || p.tipo_conteudo === 'foto').length;
      const carrCt = auditPosts.length - reelsCt - fotoCt;
      const clientMix = auditPosts.length ? `${Math.round(reelsCt / auditPosts.length * 100)}% / ${Math.round(Math.max(0, carrCt) / auditPosts.length * 100)}% / ${Math.round(fotoCt / auditPosts.length * 100)}%` : null;
      const cols = isP ? '1fr' : `1fr ${ov.comparativo_concorrentes.map(() => '1fr').join(' ')}`;
      // shared small-box style for competitor metrics
      const compBox = (bg: string, border: string) => ({ borderRadius: 6, padding: `${f(2)}px ${f(5)}px`, background: bg, border: `1px solid ${border}` });
      const compLbl = { fontFamily: 'Roboto', fontSize: f(7), color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase' as const };
      const compVal = (color: string) => ({ fontFamily: 'Playfair Display, Georgia, serif', fontWeight: 900, fontSize: f(10), color });
      return (
        <div style={{ width: '100%', height: '100%', background: C.secondary, display: 'flex', flexDirection: 'column', padding: 56 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: f(16), marginBottom: f(28) }}>
            <div style={{ fontFamily: 'Playfair Display, Georgia, serif', fontWeight: 900, fontSize: 36, color: C.white, textTransform: 'uppercase' }}>Posicionamento Competitivo</div>
            <div style={{ width: f(32), height: f(4), borderRadius: 99, background: C.primary, flexShrink: 0 }} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: cols, gap: f(20), flex: 1, overflow: 'hidden' }}>
            {/* Card do cliente */}
            <div style={{ borderRadius: 20, padding: f(24), display: 'flex', flexDirection: 'column', gap: f(10), position: 'relative', background: C.primary, overflow: 'hidden' }}>
              <div style={{ position: 'absolute', top: f(16), right: f(16), fontSize: f(20) }}>⭐</div>
              <div style={{ fontFamily: 'Playfair Display, Georgia, serif', fontWeight: 700, fontSize: f(18), color: C.white }}>{handle}</div>
              <div style={{ fontFamily: 'Roboto', fontSize: f(11), color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase', letterSpacing: 2 }}>Seu perfil</div>
              <div style={{ display: 'flex', gap: f(6), flexWrap: 'wrap' }}>
                {auditMet ? (
                  <>
                    {[
                      { label: 'Seguidores',   val: fmtNum(auditMet.seguidores) },
                      { label: 'Posts',         val: fmtNum(auditMet.qtd_posts) },
                      ...(avgCurtidas    !== null ? [{ label: 'Média curtidas', val: fmtNum(avgCurtidas) }]    : []),
                      ...(avgComentarios !== null ? [{ label: 'Média coment.',  val: fmtNum(avgComentarios) }] : []),
                      ...(clientEngRate  !== null ? [{ label: 'Engajamento',    val: `${clientEngRate}%` }]    : []),
                    ].map((m, i) => (
                      <div key={i} style={{ borderRadius: 6, padding: `${f(2)}px ${f(5)}px`, background: 'rgba(0,0,0,0.2)' }}>
                        <div style={{ fontFamily: 'Roboto', fontSize: f(7), color: 'rgba(255,255,255,0.55)', textTransform: 'uppercase', letterSpacing: 1 }}>{m.label}</div>
                        <div style={{ fontFamily: 'Playfair Display, Georgia, serif', fontWeight: 900, fontSize: f(10), color: C.white }}>{m.val}</div>
                      </div>
                    ))}
                    {clientMix && (
                      <div style={{ borderRadius: 6, padding: `${f(2)}px ${f(5)}px`, background: 'rgba(0,0,0,0.15)' }}>
                        <div style={{ fontFamily: 'Roboto', fontSize: f(7), color: 'rgba(255,255,255,0.55)', textTransform: 'uppercase', letterSpacing: 1 }}>Reels/Carr./Foto</div>
                        <div style={{ fontFamily: 'Playfair Display, Georgia, serif', fontWeight: 700, fontSize: f(9), color: 'rgba(255,255,255,0.85)' }}>{clientMix}</div>
                      </div>
                    )}
                  </>
                ) : clientMetricsFallback.map((m, i) => (
                  <div key={i} style={{ borderRadius: 6, padding: `${f(2)}px ${f(5)}px`, background: 'rgba(0,0,0,0.2)' }}>
                    <div style={{ fontFamily: 'Roboto', fontSize: f(7), color: 'rgba(255,255,255,0.55)', textTransform: 'uppercase', letterSpacing: 1 }}>{m.label}</div>
                    <div style={{ fontFamily: 'Playfair Display, Georgia, serif', fontWeight: 900, fontSize: f(10), color: C.white }}>{m.val}</div>
                  </div>
                ))}
              </div>
              <div style={{ flex: 1, fontFamily: 'Roboto', fontSize: f(11), color: 'rgba(255,255,255,0.75)', lineHeight: 1.3, overflow: 'hidden' }}>
                {ov.posicionamento_atual.split('\n\n')[0]}
              </div>
            </div>
            {/* Cards dos concorrentes */}
            {ov.comparativo_concorrentes.map((c, i) => {
              const auditComp = auditData?.concorrentes?.find(x => x.handle === c.handle.replace('@', ''));
              const compMp = auditComp?.metricas_posts;
              const compSeg = auditComp?.perfil?.metricas?.seguidores;
              const compQtd = auditComp?.perfil?.metricas?.qtd_posts;
              const compMetricsFallback = extractCompetitorMetrics(ov.posicionamento_atual, c.handle);
              const segFallback = compMetricsFallback.find(m => m.label === 'Seguidores');
              return (
                <div key={i} style={{ borderRadius: 20, padding: f(24), display: 'flex', flexDirection: 'column', gap: f(10), background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', overflow: 'hidden' }}>
                  <div style={{ fontFamily: 'Playfair Display, Georgia, serif', fontWeight: 700, fontSize: f(18), color: C.green }}>{c.handle}</div>
                  <div style={{ fontFamily: 'Roboto', fontSize: f(11), color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: 2 }}>Concorrente</div>
                  <div style={{ display: 'flex', gap: f(4), flexWrap: 'wrap' }}>
                    {compSeg !== undefined ? (
                      <>
                        <div style={compBox('rgba(0,179,126,0.1)', 'rgba(0,179,126,0.2)')}>
                          <div style={compLbl}>Seguidores</div>
                          <div style={compVal(C.green)}>{fmtNum(compSeg)}</div>
                        </div>
                        {compQtd !== undefined && (
                          <div style={compBox('rgba(0,179,126,0.1)', 'rgba(0,179,126,0.2)')}>
                            <div style={compLbl}>Posts</div>
                            <div style={compVal(C.green)}>{fmtNum(compQtd)}</div>
                          </div>
                        )}
                        {compMp && <>
                          <div style={compBox('rgba(0,179,126,0.1)', 'rgba(0,179,126,0.2)')}>
                            <div style={compLbl}>Média curtidas</div>
                            <div style={compVal(C.green)}>{fmtNum(compMp.media_curtidas)}</div>
                          </div>
                          <div style={compBox('rgba(0,179,126,0.1)', 'rgba(0,179,126,0.2)')}>
                            <div style={compLbl}>Engajamento</div>
                            <div style={compVal(C.green)}>{compMp.taxa_engajamento}%</div>
                          </div>
                        </>}
                      </>
                    ) : segFallback ? (
                      <div style={compBox('rgba(0,179,126,0.1)', 'rgba(0,179,126,0.2)')}>
                        <div style={compLbl}>Seguidores</div>
                        <div style={compVal(C.green)}>{segFallback.val}</div>
                      </div>
                    ) : null}
                    {compMp && (
                      <div style={compBox('rgba(255,255,255,0.04)', 'rgba(255,255,255,0.1)')}>
                        <div style={compLbl}>Reels/Carrossel/Foto</div>
                        <div style={{ fontFamily: 'Playfair Display, Georgia, serif', fontWeight: 700, fontSize: f(9), color: 'rgba(255,255,255,0.7)' }}>{compMp.mix_formatos.reels_pct}% / {compMp.mix_formatos.carrossel_pct}% / {compMp.mix_formatos.foto_pct}%</div>
                      </div>
                    )}
                  </div>
                  <div style={{ flex: 1, fontFamily: 'Roboto', fontSize: f(12), color: 'rgba(255,255,255,0.75)', lineHeight: 1.2, overflow: 'hidden' }}>{c.estrategia_que_funciona}</div>
                  <div style={{ flexShrink: 0, padding: f(10), borderRadius: 10, background: 'rgba(0,179,126,0.12)', border: '1px solid rgba(0,179,126,0.25)' }}>
                    <div style={{ fontFamily: 'Playfair Display, Georgia, serif', fontWeight: 700, fontSize: f(14), color: C.green }}>{c.ganho_esperado_vendas}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      );
    }});

    // ── Top Posts (apenas os 3 primeiros) ────────────────────────────────────
    if (auditData) {
      const topPosts = (auditData.analise_conteudo?.cliente?.ganchos_top ?? []).slice(0, 3);
      const allPosts = auditData.cliente?.posts ?? [];
      const tpPerPage = isP ? 2 : 3;
      const tpPages = 1;
      for (let pg = 0; pg < tpPages; pg++) {
        const pageItems = topPosts.slice(pg * tpPerPage, (pg + 1) * tpPerPage);
        const pageLabel = '';
        all.push({ id: `ov-top-posts-${pg}`, section: 'overview_cliente', render: () => (
          <div style={{ width: '100%', height: '100%', background: C.secondary, display: 'flex', flexDirection: 'column', padding: 56, overflow: 'hidden' }}>
            <div style={{ marginBottom: f(20), fontFamily: 'Playfair Display, Georgia, serif', fontWeight: 900, fontSize: 36, color: C.white, textTransform: 'uppercase' }}>🏆 Top Posts{pageLabel}</div>
            <div style={{ display: 'flex', gap: f(20), flex: 1, overflow: 'hidden' }}>
              {pageItems.map((tp, i) => {
                const full = allPosts.find(p => p.link_post?.includes(tp.shortcode));
                const imgUrl = full?.thumb || full?.link_midia || null;
                const isVideo = tp.tipo_conteudo === 'video' || full?.tipo_conteudo === 'video';
                const cols2 = [C.primary, C.green, C.yellow];
                const col = cols2[(pg * tpPerPage + i) % 3];
                return (
                  <div key={i} style={{ flex: 1, borderRadius: 20, overflow: 'hidden', display: 'flex', flexDirection: 'column', background: 'rgba(255,255,255,0.04)', border: `1px solid ${col}33` }}>
                    {/* Imagem / thumb */}
                    <div style={{ width: '100%', aspectRatio: '1', background: '#111', position: 'relative', flexShrink: 0, overflow: 'hidden' }}>
                      {imgUrl ? (
                        <img src={imgUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                      ) : null}
                      {isVideo && (
                        <div style={{ position: 'absolute', top: f(8), left: f(8), background: 'rgba(0,0,0,0.7)', borderRadius: 4, padding: `${f(2)}px ${f(6)}px`, fontFamily: 'Roboto', fontSize: f(9), color: C.white }}>▶ Reel</div>
                      )}
                      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'linear-gradient(transparent,rgba(0,0,0,0.8))', padding: `${f(8)}px ${f(10)}px ${f(6)}px` }}>
                        <div style={{ display: 'flex', gap: f(10) }}>
                          {[['❤️', tp.curtidas], ['💬', tp.comentarios], ['⚡', tp.engajamento]].map(([icon, val]) => (
                            <span key={String(icon)} style={{ fontFamily: 'Playfair Display, Georgia, serif', fontWeight: 900, fontSize: f(12), color: C.white }}>{icon} {fmtNum(Number(val))}</span>
                          ))}
                        </div>
                      </div>
                    </div>
                    {/* Texto */}
                    <div style={{ flex: 1, padding: f(16), display: 'flex', flexDirection: 'column', gap: f(8), overflow: 'hidden' }}>
                      <div style={{ fontFamily: 'Playfair Display, Georgia, serif', fontWeight: 700, fontSize: f(13), color: col, lineHeight: lh }}>{tp.primeira_linha}</div>
                      {full?.legenda && (
                        <p style={{ fontFamily: 'Roboto', fontSize: f(11), color: 'rgba(255,255,255,0.6)', lineHeight: lh, margin: 0, overflow: 'hidden', flex: 1 }}>
                          {full.legenda.slice(0, 200)}{full.legenda.length > 200 ? '…' : ''}
                        </p>
                      )}
                      <a href={full?.link_post ?? `https://www.instagram.com/p/${tp.shortcode}/`}
                        style={{ fontFamily: 'Roboto', fontSize: f(10), color: 'rgba(255,255,255,0.3)', wordBreak: 'break-all' }}>
                        instagram.com/p/{tp.shortcode}
                      </a>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )});
      }

      // ── Top Posts dos Concorrentes (paginado, 3 por slide por concorrente) ──
      for (const comp of auditData.concorrentes ?? []) {
        const compTopPosts: AuditPost[] = (comp.metricas_posts?.top_posts ?? []).slice(0, 3);
        if (compTopPosts.length === 0) continue;
        const ctpPages = 1;
        for (let pg = 0; pg < ctpPages; pg++) {
          const pageItems = compTopPosts;
          const pageLabel = '';
          const compHandle = comp.handle;
          all.push({ id: `ov-comp-posts-${compHandle}-${pg}`, section: 'overview_cliente', render: () => (
            <div style={{ width: '100%', height: '100%', background: C.secondary, display: 'flex', flexDirection: 'column', padding: 56, overflow: 'hidden' }}>
              <div style={{ marginBottom: f(20), fontFamily: 'Playfair Display, Georgia, serif', fontWeight: 900, fontSize: 36, color: C.white, textTransform: 'uppercase' }}>
                🔍 Top Posts — <span style={{ color: C.green }}>@{compHandle}</span>{pageLabel}
              </div>
              <div style={{ display: 'flex', gap: f(20), flex: 1, overflow: 'hidden' }}>
                {pageItems.map((p, i) => {
                  const imgUrl = p.thumb || p.link_midia || null;
                  const isVideo = p.tipo_conteudo === 'video';
                  const cols2 = [C.green, C.primary, C.yellow];
                  const col = cols2[i % 3];
                  return (
                    <div key={i} style={{ flex: 1, borderRadius: 20, overflow: 'hidden', display: 'flex', flexDirection: 'column', background: 'rgba(255,255,255,0.04)', border: `1px solid ${col}33` }}>
                      <div style={{ width: '100%', aspectRatio: '1', background: '#111', position: 'relative', flexShrink: 0, overflow: 'hidden' }}>
                        {imgUrl && <img src={imgUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />}
                        {isVideo && <div style={{ position: 'absolute', top: f(8), left: f(8), background: 'rgba(0,0,0,0.7)', borderRadius: 4, padding: `${f(2)}px ${f(6)}px`, fontFamily: 'Roboto', fontSize: f(9), color: C.white }}>▶ Reel</div>}
                        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'linear-gradient(transparent,rgba(0,0,0,0.8))', padding: `${f(8)}px ${f(10)}px ${f(6)}px` }}>
                          <div style={{ display: 'flex', gap: f(10) }}>
                            {[['❤️', p.curtidas], ['💬', p.comentarios], ...(p.views > 0 ? [['👁', p.views]] : [])].map(([icon, val]) => (
                              <span key={String(icon)} style={{ fontFamily: 'Playfair Display, Georgia, serif', fontWeight: 900, fontSize: f(12), color: C.white }}>{icon} {fmtNum(Number(val))}</span>
                            ))}
                          </div>
                        </div>
                      </div>
                      <div style={{ flex: 1, padding: f(16), display: 'flex', flexDirection: 'column', gap: f(8), overflow: 'hidden' }}>
                        <p style={{ fontFamily: 'Roboto', fontSize: f(11), color: 'rgba(255,255,255,0.75)', lineHeight: lh, margin: 0, overflow: 'hidden', flex: 1 }}>
                          {p.legenda?.slice(0, 220)}{(p.legenda?.length ?? 0) > 220 ? '…' : ''}
                        </p>
                        <div style={{ fontFamily: 'Roboto', fontSize: f(10), color: 'rgba(255,255,255,0.3)' }}>
                          {new Date(p.publicado_em).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: '2-digit' })}
                          {' · '}{p.tipo_conteudo}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )});
        }
      }
    }

    all.push({ id: 'ov-swot', section: 'overview_cliente', render: () => (
      <div style={{ width: '100%', height: '100%', background: C.secondary, display: 'flex', flexDirection: 'column', padding: 56 }}>
        <div style={{ marginBottom: f(24), fontFamily: 'Playfair Display, Georgia, serif', fontWeight: 900, fontSize: 36, color: C.white, textTransform: 'uppercase' }}>Pontos Fortes & Fracos</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: f(20), flex: 1 }}>
          {[
            { label: 'Forças',    items: ov.pontos_fortes, color: C.green,   icon: '💪', bg: 'rgba(0,179,126,0.06)',   border: 'rgba(0,179,126,0.3)'   },
            { label: 'Fraquezas', items: ov.pontos_fracos, color: C.primary, icon: '⚠️', bg: 'rgba(255,102,0,0.06)',   border: 'rgba(255,102,0,0.3)'   },
          ].map((col) => (
            <div key={col.label} style={{ borderRadius: 20, padding: f(28), display: 'flex', flexDirection: 'column', gap: f(12), background: col.bg, border: `1px solid ${col.border}`, overflow: 'hidden' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: f(10), marginBottom: f(4) }}>
                <span style={{ fontSize: f(24) }}>{col.icon}</span>
                <span style={{ fontFamily: 'Playfair Display, Georgia, serif', fontWeight: 700, fontSize: f(20), color: col.color, textTransform: 'uppercase' }}>{col.label}</span>
              </div>
              {col.items.map((item, i) => (
                <div key={i} style={{ display: 'flex', gap: f(10), alignItems: 'flex-start' }}>
                  <div style={{ width: f(22), height: f(22), borderRadius: '50%', background: col.color, color: C.white, fontFamily: 'Playfair Display, Georgia, serif', fontWeight: 900, fontSize: f(11), display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>{i + 1}</div>
                  <span style={{ fontFamily: 'Roboto', fontSize: f(13), color: 'rgba(255,255,255,0.85)', lineHeight: lh }}>{item}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    )});

    all.push({ id: 'ov-concorrentes', section: 'overview_cliente', render: () => {
      const concorrentes = ov.comparativo_concorrentes;
      const accentColors = [C.primary, C.green, C.yellow];
      return (
        <div style={{ width: '100%', height: '100%', background: C.secondary, display: 'flex', flexDirection: isP ? 'column' : 'row' }}>
          {/* Painel esquerdo — título */}
          <div style={{ width: isP ? '100%' : '30%', flexShrink: 0, display: 'flex', flexDirection: 'column', padding: isP ? '28px 40px 20px' : 48, background: '#111' }}>
            <div style={{ fontFamily: 'Roboto', fontSize: f(11), color: 'rgba(255,255,255,0.35)', letterSpacing: 3, textTransform: 'uppercase' }}>Análise Competitiva</div>
            <div style={{ marginTop: f(8), fontFamily: 'Playfair Display, Georgia, serif', fontWeight: 900, fontSize: 34, color: C.white, textTransform: 'uppercase', lineHeight: 1.1 }}>O QUE SEUS<br />CONCORRENTES<br />FAZEM BEM</div>
            <div style={{ marginTop: f(20), fontFamily: 'Roboto', fontSize: f(13), color: 'rgba(255,255,255,0.4)', lineHeight: 1.4 }}>
              {concorrentes.length} concorrente{concorrentes.length > 1 ? 's' : ''} analisado{concorrentes.length > 1 ? 's' : ''}
            </div>
            {/* badges de handles */}
            <div style={{ marginTop: f(16), display: 'flex', flexDirection: 'column', gap: f(8) }}>
              {concorrentes.map((c, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: f(10), padding: `${f(8)}px ${f(12)}px`, borderRadius: 10, background: `${accentColors[i]}18`, border: `1px solid ${accentColors[i]}44` }}>
                  <div style={{ width: f(10), height: f(10), borderRadius: '50%', background: accentColors[i], flexShrink: 0 }} />
                  <span style={{ fontFamily: 'Playfair Display, Georgia, serif', fontWeight: 700, fontSize: f(13), color: accentColors[i] }}>{c.handle}</span>
                </div>
              ))}
            </div>
          </div>
          {/* Painel direito — cards de cada concorrente */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: isP ? '16px 40px 28px' : 48, gap: f(20), overflow: 'hidden' }}>
            {concorrentes.map((c, i) => {
              const col = accentColors[i];
              const auditComp = auditData?.concorrentes?.find(x => x.handle === c.handle.replace('@', ''));
              const compSeg = auditComp?.perfil?.metricas?.seguidores;
              const compQtd = auditComp?.perfil?.metricas?.qtd_posts;
              return (
                <div key={i} style={{ flex: 1, borderRadius: 20, padding: f(22), display: 'flex', flexDirection: isP ? 'column' : 'row', gap: f(16), background: `${col}0a`, border: `1px solid ${col}33`, overflow: 'hidden' }}>
                  {/* estratégia */}
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: f(8) }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: f(8), flexWrap: 'wrap' }}>
                      <div style={{ width: f(28), height: f(28), borderRadius: '50%', background: col, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: f(14), flexShrink: 0 }}>🔍</div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontFamily: 'Playfair Display, Georgia, serif', fontWeight: 900, fontSize: f(16), color: col }}>{c.handle}</div>
                        <div style={{ fontFamily: 'Roboto', fontSize: f(10), color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: 1 }}>O que faz bem</div>
                      </div>
                      {/* metric chips */}
                      <div style={{ display: 'flex', gap: f(4), flexWrap: 'wrap' }}>
                        {compSeg !== undefined && (
                          <div style={{ borderRadius: 5, padding: `${f(2)}px ${f(5)}px`, background: `${col}18`, border: `1px solid ${col}33` }}>
                            <div style={{ fontFamily: 'Roboto', fontSize: f(7), color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase' }}>Seguidores</div>
                            <div style={{ fontFamily: 'Playfair Display, Georgia, serif', fontWeight: 900, fontSize: f(10), color: col }}>{fmtNum(compSeg)}</div>
                          </div>
                        )}
                        {compQtd !== undefined && (
                          <div style={{ borderRadius: 5, padding: `${f(2)}px ${f(5)}px`, background: `${col}18`, border: `1px solid ${col}33` }}>
                            <div style={{ fontFamily: 'Roboto', fontSize: f(7), color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase' }}>Posts</div>
                            <div style={{ fontFamily: 'Playfair Display, Georgia, serif', fontWeight: 900, fontSize: f(10), color: col }}>{fmtNum(compQtd)}</div>
                          </div>
                        )}
                      </div>
                    </div>
                    <p style={{ fontFamily: 'Roboto', fontSize: f(12), color: 'rgba(255,255,255,0.75)', lineHeight: 1.4, margin: 0 }}>{c.estrategia_que_funciona}</p>
                  </div>
                  {/* como aplicar + ganho */}
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: f(8) }}>
                    <div style={{ fontFamily: 'Playfair Display, Georgia, serif', fontWeight: 700, fontSize: f(12), color: C.yellow, textTransform: 'uppercase', letterSpacing: 1 }}>🎯 Como você aplica</div>
                    <p style={{ fontFamily: 'Roboto', fontSize: f(12), color: 'rgba(255,255,255,0.85)', lineHeight: 1.4, margin: 0, flex: 1 }}>{c.como_voce_aplica}</p>
                    <div style={{ padding: `${f(8)}px ${f(12)}px`, borderRadius: 10, background: `${col}18`, border: `1px solid ${col}33` }}>
                      <div style={{ fontFamily: 'Playfair Display, Georgia, serif', fontWeight: 700, fontSize: f(13), color: col }}>{c.ganho_esperado_vendas}</div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      );
    }});

    all.push({ id: 'ov-crescimento', section: 'overview_cliente', render: () => (
      <div style={{ width: '100%', height: '100%', background: C.secondary, display: 'flex', flexDirection: 'column', padding: 56 }}>
        <div style={{ marginBottom: f(24), fontFamily: 'Playfair Display, Georgia, serif', fontWeight: 900, fontSize: 36, color: C.white, textTransform: 'uppercase' }}>Caminhos de Crescimento</div>
        <div style={{ display: 'grid', gridTemplateColumns: isP ? '1fr' : '1fr 1fr 1fr', gap: f(20), flex: 1 }}>
          {ov.caminhos_de_crescimento.map((cam, i) => {
            const colors  = [C.yellow, C.primary, C.green];
            const icons   = ['📣', '📹', '🔍'];
            const efCols: Record<string, string> = { baixo: C.green, médio: C.yellow };
            const col     = colors[i];
            return (
              <div key={i} style={{ borderRadius: 20, padding: f(22), display: 'flex', flexDirection: 'column', gap: f(12), position: 'relative', overflow: 'hidden', background: 'rgba(255,255,255,0.03)', border: `1px solid ${col}33` }}>
                <div style={{ position: 'absolute', top: 0, left: 0, width: 4, height: '100%', background: col, borderRadius: '20px 0 0 20px' }} />
                <div style={{ display: 'flex', alignItems: 'center', gap: f(10) }}>
                  <span style={{ fontSize: f(28) }}>{icons[i]}</span>
                  <div>
                    <div style={{ fontFamily: 'Roboto', fontSize: f(10), color: 'rgba(255,255,255,0.35)', letterSpacing: 2, textTransform: 'uppercase' }}>Caminho {i + 1}</div>
                    <div style={{ fontFamily: 'Playfair Display, Georgia, serif', fontWeight: 700, fontSize: f(16), color: col }}>{cam.titulo}</div>
                  </div>
                </div>
                <p style={{ fontFamily: 'Roboto', fontSize: f(13), color: 'rgba(255,255,255,0.75)', lineHeight: lh, margin: 0 }}>{cam.movimento}</p>
                {cam.porque_funciona && (
                  <div style={{ padding: `${f(8)}px ${f(12)}px`, borderRadius: 8, background: `${col}10`, border: `1px solid ${col}22` }}>
                    <span style={{ fontFamily: 'Roboto', fontSize: f(11), color: col }}>💡 {cam.porque_funciona}</span>
                  </div>
                )}
                <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: f(6) }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontFamily: 'Roboto', fontSize: f(11), color: 'rgba(255,255,255,0.35)' }}>⏱ {cam.tempo_para_resultado}</span>
                    <Tag text={cam.esforco} color={efCols[cam.esforco] || C.primary} f={f} />
                  </div>
                  <div style={{ padding: f(10), borderRadius: 10, background: `${col}14` }}>
                    <div style={{ fontFamily: 'Roboto', fontSize: f(12), color: col }}>📈 {cam.impacto_em_vendas}</div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    )});

    all.push({ id: 'ov-previsao', section: 'overview_cliente', render: () => (
      <div style={{ width: '100%', height: '100%', background: C.secondary, display: 'flex', flexDirection: 'column', padding: 56 }}>
        <div style={{ marginBottom: f(28), fontFamily: 'Playfair Display, Georgia, serif', fontWeight: 900, fontSize: 36, color: C.white, textTransform: 'uppercase' }}>Previsão de Resultados</div>
        <div style={{ display: 'flex', flexDirection: isP ? 'column' : 'row', gap: f(20), flex: 1 }}>
          {[
            { period: '30 dias', text: ov.previsao_resultados['30_dias'], color: C.yellow,  icon: '🚀', pct: 33 },
            { period: '60 dias', text: ov.previsao_resultados['60_dias'], color: C.primary, icon: '📈', pct: 66 },
            { period: '90 dias', text: ov.previsao_resultados['90_dias'], color: C.green,   icon: '🏆', pct: 100 },
          ].map((item, i) => (
            <div key={i} style={{ flex: 1, borderRadius: 20, padding: f(28), display: 'flex', flexDirection: 'column', background: `${item.color}0e`, border: `1px solid ${item.color}44` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: f(12), marginBottom: f(12) }}>
                <span style={{ fontSize: f(36) }}>{item.icon}</span>
                <div>
                  <div style={{ fontFamily: 'Roboto', fontSize: f(11), color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: 2 }}>Meta</div>
                  <div style={{ fontFamily: 'Playfair Display, Georgia, serif', fontWeight: 900, fontSize: f(32), color: item.color }}>{item.period}</div>
                </div>
              </div>
              <p style={{ fontFamily: 'Roboto', fontSize: f(14), color: 'rgba(255,255,255,0.8)', lineHeight: lh, flex: 1, margin: 0 }}>{item.text}</p>
              <div style={{ marginTop: f(16) }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: f(5) }}>
                  <span style={{ fontFamily: 'Roboto', fontSize: f(11), color: 'rgba(255,255,255,0.35)' }}>Progresso</span>
                  <span style={{ fontFamily: 'Playfair Display, Georgia, serif', fontWeight: 700, fontSize: f(11), color: item.color }}>{item.pct}%</span>
                </div>
                <div style={{ width: '100%', height: f(6), borderRadius: 99, background: 'rgba(255,255,255,0.08)' }}>
                  <div style={{ width: `${item.pct}%`, height: f(6), borderRadius: 99, background: item.color }} />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    )});

    all.push({ id: 'ov-carta', section: 'overview_cliente', render: () => {
      const paras = ov.carta_para_cliente_markdown.split('\n\n');
      return (
        <div style={{ width: '100%', height: '100%', background: C.secondary, display: 'flex', flexDirection: isP ? 'column' : 'row' }}>
          <div style={{ width: isP ? '100%' : '26%', background: C.primary, display: 'flex', flexDirection: isP ? 'row' : 'column', alignItems: 'center', justifyContent: 'center', padding: isP ? `${f(24)}px 40px` : f(40), gap: f(16) }}>
            <span style={{ fontSize: f(48) }}>✉️</span>
            <div>
              <div style={{ fontFamily: 'Playfair Display, Georgia, serif', fontWeight: 900, fontSize: f(18), color: C.white, textTransform: 'uppercase', letterSpacing: 2 }}>Carta para o Cliente</div>
              <div style={{ fontFamily: 'Roboto', fontSize: f(13), color: 'rgba(255,255,255,0.7)', fontStyle: 'italic', lineHeight: lh, marginTop: f(6) }}>Uma análise direta, sem rodeios.</div>
            </div>
          </div>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: `${f(40)}px ${f(48)}px`, gap: f(14), overflow: 'hidden' }}>
            {paras.map((para, i) => (
              <p key={i} style={{ fontFamily: 'Roboto', fontSize: i === 0 ? f(15) : f(13), color: i === 0 ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.7)', lineHeight: lh, borderLeft: i === 0 ? `3px solid ${C.yellow}` : 'none', paddingLeft: i === 0 ? f(16) : 0, margin: 0 }}>
                {para}
              </p>
            ))}
          </div>
        </div>
      );
    }});

    // ── COMENTÁRIOS ──────────────────────────────────────────────────────────────
    const auditPostsComt = (auditData?.cliente?.posts ?? []).filter(p => (p.comentarios_ordenados?.length ?? 0) > 0);
    const hasComentarios = auditPostsComt.length > 0;

    if (hasComentarios) {
      // Slide 1 — Visão geral dos comentários
      all.push({ id: 'ov-comentarios-visao', section: 'overview_cliente', render: () => {
        const todosComentarios = auditPostsComt.flatMap(p => p.comentarios_ordenados ?? []);
        const totalComt = todosComentarios.length;
        const respondidos = todosComentarios.filter(c => c.comentario_foi_respondido_pelo_dono).length;
        const taxaResposta = totalComt > 0 ? Math.round((respondidos / totalComt) * 100) : 0;
        const mediaPalavras = totalComt > 0 ? Math.round(todosComentarios.reduce((s, c) => s + c.palavras, 0) / totalComt) : 0;
        const verificados = todosComentarios.filter(c => c.is_verified).length;
        const topPosts = [...auditPostsComt]
          .sort((a, b) => (b.comentarios_ordenados?.length ?? 0) - (a.comentarios_ordenados?.length ?? 0))
          .slice(0, 5);
        const maxComt = topPosts[0]?.comentarios_ordenados?.length ?? 1;
        const cards = [
          { label: 'Total de comentários', val: totalComt.toString(), color: C.primary },
          { label: 'Taxa de resposta', val: `${taxaResposta}%`, color: C.green },
          { label: 'Média de palavras', val: mediaPalavras.toString(), color: C.yellow },
          { label: 'Contas verificadas', val: verificados.toString(), color: '#8B5CF6' },
        ];
        return (
          <div style={{ width: '100%', height: '100%', background: C.secondary, display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: `${f(28)}px ${f(48)}px ${f(16)}px`, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
              <div style={{ fontFamily: 'Roboto', fontSize: f(11), color: 'rgba(255,255,255,0.35)', letterSpacing: 4, textTransform: 'uppercase' }}>Insights</div>
              <div style={{ fontFamily: 'Playfair Display, Georgia, serif', fontWeight: 900, fontSize: f(32), color: C.white, textTransform: 'uppercase', lineHeight: 1.1 }}>
                COMENTÁRIOS — <span style={{ color: C.primary }}>VISÃO GERAL</span>
              </div>
            </div>
            <div style={{ flex: 1, display: 'flex', flexDirection: isP ? 'column' : 'row', gap: f(20), padding: `${f(20)}px ${f(48)}px` }}>
              {/* Cards métricas */}
              <div style={{ display: 'flex', flexDirection: isP ? 'row' : 'column', gap: f(14), width: isP ? '100%' : '32%', flexWrap: isP ? 'wrap' : 'nowrap' }}>
                {cards.map((c, i) => (
                  <div key={i} style={{ flex: 1, minWidth: isP ? '45%' : undefined, background: 'rgba(255,255,255,0.05)', border: `1px solid rgba(255,255,255,0.1)`, borderLeft: `4px solid ${c.color}`, borderRadius: f(10), padding: `${f(14)}px ${f(16)}px`, display: 'flex', flexDirection: 'column', gap: f(6) }}>
                    <div style={{ fontFamily: 'Playfair Display, Georgia, serif', fontWeight: 900, fontSize: f(30), color: c.color, lineHeight: 1 }}>{c.val}</div>
                    <div style={{ fontFamily: 'Roboto', fontSize: f(11), color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: 1 }}>{c.label}</div>
                  </div>
                ))}
              </div>
              {/* Ranking de posts */}
              <div style={{ flex: 1, background: 'rgba(255,255,255,0.03)', borderRadius: f(10), padding: `${f(16)}px ${f(20)}px`, border: '1px solid rgba(255,255,255,0.07)' }}>
                <div style={{ fontFamily: 'Playfair Display, Georgia, serif', fontWeight: 700, fontSize: f(13), color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: 2, marginBottom: f(14) }}>Posts com mais comentários</div>
                {topPosts.map((p, i) => {
                  const qt = p.comentarios_ordenados?.length ?? 0;
                  const pct = Math.round((qt / maxComt) * 100);
                  const rawLeg = p.legenda ?? '';
                  const firstLine = rawLeg.split('\n')[0].trim();
                  const label = firstLine.length > 0 ? (firstLine.length > 60 ? firstLine.slice(0, 57) + '…' : firstLine) : `Post ${i + 1}`;
                  return (
                    <div key={i} style={{ marginBottom: f(12) }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: f(5), gap: f(8) }}>
                        <span style={{ fontFamily: 'Roboto', fontSize: f(12), color: 'rgba(255,255,255,0.7)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          <span style={{ color: 'rgba(255,255,255,0.35)', marginRight: f(6) }}>#{i + 1}</span>{label}
                        </span>
                        <span style={{ fontFamily: 'Playfair Display, Georgia, serif', fontWeight: 700, fontSize: f(13), color: C.primary, flexShrink: 0 }}>{qt} coment.</span>
                      </div>
                      <div style={{ height: f(8), borderRadius: 99, background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${pct}%`, borderRadius: 99, background: `linear-gradient(90deg, ${C.primary}, ${C.yellow})` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        );
      }});

      // Slide 2 — Top 6 comentários por palavras
      all.push({ id: 'ov-comentarios-top', section: 'overview_cliente', render: () => {
        const todosComt = auditPostsComt.flatMap(p => p.comentarios_ordenados ?? []);
        const topComt = [...todosComt].sort((a, b) => b.palavras - a.palavras).slice(0, 6);
        return (
          <div style={{ width: '100%', height: '100%', background: '#111', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: `${f(28)}px ${f(48)}px ${f(16)}px`, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
              <div style={{ fontFamily: 'Roboto', fontSize: f(11), color: 'rgba(255,255,255,0.35)', letterSpacing: 4, textTransform: 'uppercase' }}>Comentários</div>
              <div style={{ fontFamily: 'Playfair Display, Georgia, serif', fontWeight: 900, fontSize: f(32), color: C.white, textTransform: 'uppercase', lineHeight: 1.1 }}>
                TOP COMENTÁRIOS <span style={{ color: C.green }}>MAIS ELABORADOS</span>
              </div>
            </div>
            <div style={{ flex: 1, display: 'grid', gridTemplateColumns: isP ? '1fr' : '1fr 1fr 1fr', gridTemplateRows: isP ? undefined : '1fr 1fr', gap: f(12), padding: `${f(16)}px ${f(48)}px ${f(24)}px` }}>
              {topComt.map((c, i) => {
                const colors = [C.primary, C.green, C.yellow, '#8B5CF6', '#EC4899', '#14B8A6'];
                const accent = colors[i % colors.length];
                return (
                  <div key={c.id ?? i} style={{ background: 'rgba(255,255,255,0.04)', border: `1px solid rgba(255,255,255,0.09)`, borderTop: `3px solid ${accent}`, borderRadius: f(10), padding: `${f(14)}px ${f(16)}px`, display: 'flex', flexDirection: 'column', gap: f(8), overflow: 'hidden' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: f(8) }}>
                      <div style={{ width: f(28), height: f(28), borderRadius: '50%', background: accent, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Playfair Display, Georgia, serif', fontWeight: 900, fontSize: f(13), color: '#fff', flexShrink: 0 }}>
                        {(c.comentador_username?.[0] ?? '?').toUpperCase()}
                      </div>
                      <div>
                        <div style={{ fontFamily: 'Playfair Display, Georgia, serif', fontWeight: 700, fontSize: f(12), color: 'rgba(255,255,255,0.8)' }}>
                          @{c.comentador_username ?? 'anon'} {c.is_verified ? '✅' : ''}
                        </div>
                        <div style={{ fontFamily: 'Roboto', fontSize: f(10), color: 'rgba(255,255,255,0.35)' }}>{c.palavras} palavras</div>
                      </div>
                    </div>
                    <div style={{ fontFamily: 'Roboto', fontSize: f(12), color: 'rgba(255,255,255,0.7)', lineHeight: lh, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 4, WebkitBoxOrient: 'vertical' as any }}>
                      "{c.texto}"
                    </div>
                    {c.comentario_foi_respondido_pelo_dono && (
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: f(4), padding: `${f(3)}px ${f(8)}px`, borderRadius: 99, background: 'rgba(0,179,126,0.15)', border: `1px solid ${C.green}`, width: 'fit-content' }}>
                        <span style={{ fontSize: f(10) }}>↩️</span>
                        <span style={{ fontFamily: 'Roboto', fontSize: f(10), color: C.green }}>Respondido pelo dono</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      }});

      // Slide 3 — Padrões: frequência de palavras + emojis + sentimento
      all.push({ id: 'ov-comentarios-padroes', section: 'overview_cliente', render: () => {
        const todosComt = auditPostsComt.flatMap(p => p.comentarios_ordenados ?? []);
        const textoTotal = todosComt.map(c => c.texto).join(' ');

        // Frequência de palavras (ignora stopwords)
        const stopwords = new Set(['de','a','o','que','e','do','da','em','um','para','com','uma','os','no','se','na','por','mais','as','dos','como','mas','foi','ao','ele','das','tem','à','seu','sua','ou','ser','quando','muito','há','nos','já','está','também','só','pelo','pela','até','isso','ela','entre','era','depois','sem','mesmo','aos','ter','seus','quem','nas','me','esse','eles','você','essa','num','nem','suas','meu','às','minha','têm','numa','pelos','elas','havia','seja','qual','será','nós','tenho','lhe','deles','essas','esses','pelas','este','fosse','dele','tu','te','vocês','vos','lhes','meus','minhas','teu','tua','teus','tuas','nosso','nossa','nossos','nossas','dela','delas','esta','estes','estas','aquele','aquela','aqueles','aquelas','isto','aquilo','estou','está','estamos','estão','estive','esteve','estivemos','estiveram','estava','estávamos','estavam','estivera','estivéramos','esteja','estejamos','estejam','estivesse','estivéssemos','estivessem','estiver','estivermos','estiverem','hei','há','havemos','hão','houve','houvemos','houveram','houvera','houvéramos','haja','hajamos','hajam','houvesse','houvéssemos','houvessem','houver','houvermos','houverem','houverei','houverá','houveremos','houverão','houveria','houveríamos','houveriam','sou','somos','são','era','éramos','eram','fui','foi','fomos','foram','fora','fôramos','seja','sejamos','sejam','fosse','fôssemos','fossem','for','formos','forem','serei','será','seremos','serão','seria','seríamos','seriam','tenho','tem','temos','têm','tinha','tínhamos','tinham','tive','teve','tivemos','tiveram','tivera','tivéramos','tenha','tenhamos','tenham','tivesse','tivéssemos','tivessem','tiver','tivermos','tiverem','terei','terá','teremos','terão','teria','teríamos','teriam']);
        const wordFreq: Record<string, number> = {};
        textoTotal.toLowerCase().replace(/[^\p{L}\s]/gu, '').split(/\s+/).forEach(w => {
          if (w.length > 2 && !stopwords.has(w)) wordFreq[w] = (wordFreq[w] || 0) + 1;
        });
        const topWords = Object.entries(wordFreq).sort((a, b) => b[1] - a[1]).slice(0, 12);
        const maxWFreq = topWords[0]?.[1] ?? 1;

        // Frequência de emojis
        const emojiFreq: Record<string, number> = {};
        [...textoTotal.matchAll(/\p{Emoji_Presentation}|\p{Extended_Pictographic}/gu)].forEach(([e]) => {
          emojiFreq[e] = (emojiFreq[e] || 0) + 1;
        });
        const topEmojis = Object.entries(emojiFreq).sort((a, b) => b[1] - a[1]).slice(0, 8);

        // Sentimento estimado
        const posWords = ['amei','adorei','incrível','maravilhoso','ótimo','perfeito','lindo','top','excelente','parabéns','fantástico','bom','boa','show','demais'];
        const negWords = ['ruim','péssimo','horrível','decepcionante','fraco','chato','medíocre','decepcionei','pior'];
        let posCount = 0, negCount = 0;
        const textoLow = textoTotal.toLowerCase();
        posWords.forEach(w => { const m = textoLow.match(new RegExp(`\\b${w}\\b`, 'g')); if (m) posCount += m.length; });
        negWords.forEach(w => { const m = textoLow.match(new RegExp(`\\b${w}\\b`, 'g')); if (m) negCount += m.length; });
        const neutroCount = Math.max(0, todosComt.length - posCount - negCount);
        const sentTotal = posCount + negCount + neutroCount || 1;
        const sentimentos = [
          { label: 'Positivo', val: posCount, pct: Math.round((posCount / sentTotal) * 100), color: C.green },
          { label: 'Neutro', val: neutroCount, pct: Math.round((neutroCount / sentTotal) * 100), color: 'rgba(255,255,255,0.3)' },
          { label: 'Negativo', val: negCount, pct: Math.round((negCount / sentTotal) * 100), color: '#EF4444' },
        ];

        return (
          <div style={{ width: '100%', height: '100%', background: C.secondary, display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: `${f(24)}px ${f(48)}px ${f(14)}px`, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
              <div style={{ fontFamily: 'Roboto', fontSize: f(11), color: 'rgba(255,255,255,0.35)', letterSpacing: 4, textTransform: 'uppercase' }}>Comentários</div>
              <div style={{ fontFamily: 'Playfair Display, Georgia, serif', fontWeight: 900, fontSize: f(30), color: C.white, textTransform: 'uppercase', lineHeight: 1.1 }}>
                PADRÕES & <span style={{ color: C.yellow }}>SENTIMENTO</span>
              </div>
            </div>
            <div style={{ flex: 1, display: 'flex', flexDirection: isP ? 'column' : 'row', gap: f(20), padding: `${f(16)}px ${f(48)}px ${f(20)}px` }}>
              {/* Palavras mais frequentes — expandido */}
              <div style={{ flex: 2, background: 'rgba(255,255,255,0.03)', borderRadius: f(10), padding: `${f(14)}px ${f(18)}px`, border: '1px solid rgba(255,255,255,0.07)' }}>
                <div style={{ fontFamily: 'Playfair Display, Georgia, serif', fontWeight: 700, fontSize: f(12), color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', letterSpacing: 2, marginBottom: f(12) }}>📊 Palavras mais citadas nos comentários</div>
                <div style={{ display: 'grid', gridTemplateColumns: isP ? '1fr' : '1fr 1fr', gap: `${f(6)}px ${f(24)}px` }}>
                  {topWords.slice(0, 12).map(([word, freq], i) => (
                    <div key={word} style={{ marginBottom: f(4) }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: f(3) }}>
                        <span style={{ fontFamily: 'Roboto', fontSize: f(13), color: i < 3 ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.65)', fontWeight: i < 3 ? 700 : 400 }}>{word}</span>
                        <span style={{ fontFamily: 'Playfair Display, Georgia, serif', fontWeight: 700, fontSize: f(12), color: C.primary }}>{freq}×</span>
                      </div>
                      <div style={{ height: f(5), borderRadius: 99, background: 'rgba(255,255,255,0.07)' }}>
                        <div style={{ height: '100%', width: `${Math.round((freq / maxWFreq) * 100)}%`, borderRadius: 99, background: i < 3 ? C.primary : 'rgba(255,102,0,0.35)' }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              {/* Sentimento */}
              <div style={{ flex: 1, background: 'rgba(255,255,255,0.03)', borderRadius: f(10), padding: `${f(14)}px ${f(18)}px`, border: '1px solid rgba(255,255,255,0.07)', display: 'flex', flexDirection: 'column' }}>
                <div style={{ fontFamily: 'Playfair Display, Georgia, serif', fontWeight: 700, fontSize: f(12), color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', letterSpacing: 2, marginBottom: f(16) }}>🧠 Sentimento geral (estimado)</div>
                {sentimentos.map(s => (
                  <div key={s.label} style={{ marginBottom: f(18) }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: f(6) }}>
                      <span style={{ fontFamily: 'Roboto', fontSize: f(14), color: 'rgba(255,255,255,0.75)' }}>{s.label}</span>
                      <span style={{ fontFamily: 'Playfair Display, Georgia, serif', fontWeight: 900, fontSize: f(18), color: s.color }}>{s.pct}%</span>
                    </div>
                    <div style={{ height: f(12), borderRadius: 99, background: 'rgba(255,255,255,0.08)' }}>
                      <div style={{ height: '100%', width: `${s.pct}%`, borderRadius: 99, background: s.color }} />
                    </div>
                  </div>
                ))}
                <div style={{ marginTop: 'auto', padding: `${f(10)}px ${f(12)}px`, background: 'rgba(255,255,255,0.04)', borderRadius: f(8), borderLeft: `3px solid ${C.yellow}` }}>
                  <div style={{ fontFamily: 'Roboto', fontSize: f(11), color: 'rgba(255,255,255,0.4)', lineHeight: 1.5 }}>⚠️ Estimativa baseada em análise de palavras-chave do texto dos comentários</div>
                </div>
              </div>
            </div>
          </div>
        );
      }});

      // Slide 4 — Ranking de @ que mais comentam
      all.push({ id: 'ov-comentarios-autores', section: 'overview_cliente', render: () => {
        const todosComt = auditPostsComt.flatMap(p => p.comentarios_ordenados ?? []);
        // Agrupar por username (excluindo nulos)
        const autorMap: Record<string, { qtd: number; palavrasTotal: number; is_verified: boolean; melhorComentario: string }> = {};
        for (const c of todosComt) {
          const u = c.comentador_username;
          if (!u) continue;
          if (!autorMap[u]) autorMap[u] = { qtd: 0, palavrasTotal: 0, is_verified: false, melhorComentario: '' };
          autorMap[u].qtd++;
          autorMap[u].palavrasTotal += c.palavras;
          if (c.is_verified) autorMap[u].is_verified = true;
          if (c.palavras > (autorMap[u].melhorComentario ? autorMap[u].melhorComentario.split(' ').length : 0)) {
            autorMap[u].melhorComentario = c.texto;
          }
        }
        const ranking = Object.entries(autorMap)
          .map(([username, d]) => ({ username, ...d, mediaPalavras: Math.round(d.palavrasTotal / d.qtd) }))
          .sort((a, b) => b.qtd - a.qtd || b.palavrasTotal - a.palavrasTotal)
          .slice(0, 15);
        const maxQtd = ranking[0]?.qtd ?? 1;
        const top3Colors = [C.yellow, 'rgba(255,255,255,0.55)', '#CD7F32'];

        return (
          <div style={{ width: '100%', height: '100%', background: '#0F0F0F', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: `${f(24)}px ${f(48)}px ${f(14)}px`, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
              <div style={{ fontFamily: 'Roboto', fontSize: f(11), color: 'rgba(255,255,255,0.35)', letterSpacing: 4, textTransform: 'uppercase' }}>Comunidade</div>
              <div style={{ fontFamily: 'Playfair Display, Georgia, serif', fontWeight: 900, fontSize: f(30), color: C.white, textTransform: 'uppercase', lineHeight: 1.1 }}>
                @ QUE MAIS <span style={{ color: C.primary }}>COMENTAM</span>
              </div>
            </div>
            <div style={{ flex: 1, display: 'flex', flexDirection: isP ? 'column' : 'row', gap: f(20), padding: `${f(14)}px ${f(48)}px ${f(18)}px`, overflow: 'hidden' }}>
              {/* Tabela ranking */}
              <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', gap: f(6) }}>
                {/* Header */}
                <div style={{ display: 'grid', gridTemplateColumns: `${f(28)}px 1fr ${f(56)}px ${f(60)}px ${f(70)}px`, gap: f(8), padding: `0 ${f(8)}px ${f(6)}px`, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                  {['#', 'Usuário', 'Comt.', 'Méd.pal', 'Bar'].map((h, i) => (
                    <span key={i} style={{ fontFamily: 'Playfair Display, Georgia, serif', fontWeight: 700, fontSize: f(10), color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: 1, textAlign: i >= 2 ? 'center' : 'left' }}>{h}</span>
                  ))}
                </div>
                {/* Linhas */}
                {ranking.map((r, i) => {
                  const pct = Math.round((r.qtd / maxQtd) * 100);
                  const medalha = i < 3 ? top3Colors[i] : null;
                  return (
                    <div key={r.username} style={{ display: 'grid', gridTemplateColumns: `${f(28)}px 1fr ${f(56)}px ${f(60)}px ${f(70)}px`, gap: f(8), alignItems: 'center', padding: `${f(5)}px ${f(8)}px`, borderRadius: f(6), background: i < 3 ? 'rgba(255,255,255,0.04)' : 'transparent', border: i === 0 ? `1px solid rgba(255,214,0,0.2)` : '1px solid transparent' }}>
                      <div style={{ fontFamily: 'Playfair Display, Georgia, serif', fontWeight: 900, fontSize: f(13), color: medalha ?? 'rgba(255,255,255,0.25)', textAlign: 'center' }}>
                        {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: f(6), overflow: 'hidden' }}>
                        <div style={{ width: f(22), height: f(22), borderRadius: '50%', background: medalha ? `${medalha}33` : 'rgba(255,255,255,0.08)', border: `1.5px solid ${medalha ?? 'rgba(255,255,255,0.12)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Playfair Display, Georgia, serif', fontWeight: 900, fontSize: f(10), color: medalha ?? 'rgba(255,255,255,0.5)', flexShrink: 0 }}>
                          {r.username[0].toUpperCase()}
                        </div>
                        <span style={{ fontFamily: 'Roboto', fontSize: f(12), color: i < 3 ? C.white : 'rgba(255,255,255,0.65)', fontWeight: i < 3 ? 700 : 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          @{r.username}{r.is_verified ? ' ✅' : ''}
                        </span>
                      </div>
                      <div style={{ fontFamily: 'Playfair Display, Georgia, serif', fontWeight: 700, fontSize: f(14), color: i < 3 ? C.primary : 'rgba(255,255,255,0.55)', textAlign: 'center' }}>{r.qtd}</div>
                      <div style={{ fontFamily: 'Roboto', fontSize: f(11), color: 'rgba(255,255,255,0.4)', textAlign: 'center' }}>{r.mediaPalavras}p</div>
                      <div style={{ height: f(6), borderRadius: 99, background: 'rgba(255,255,255,0.07)', overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${pct}%`, borderRadius: 99, background: i < 3 ? C.primary : 'rgba(255,102,0,0.35)' }} />
                      </div>
                    </div>
                  );
                })}
              </div>
              {/* Destaques top 3 */}
              <div style={{ width: isP ? '100%' : '34%', display: 'flex', flexDirection: 'column', gap: f(10) }}>
                <div style={{ fontFamily: 'Playfair Display, Georgia, serif', fontWeight: 700, fontSize: f(12), color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: 2 }}>🏆 Comentários destaque</div>
                {ranking.slice(0, 3).map((r, i) => (
                  <div key={r.username} style={{ background: 'rgba(255,255,255,0.04)', border: `1px solid ${top3Colors[i]}33`, borderLeft: `3px solid ${top3Colors[i]}`, borderRadius: f(8), padding: `${f(10)}px ${f(12)}px`, flex: 1 }}>
                    <div style={{ fontFamily: 'Playfair Display, Georgia, serif', fontWeight: 700, fontSize: f(12), color: top3Colors[i], marginBottom: f(4) }}>@{r.username} · {r.qtd} comentários</div>
                    <div style={{ fontFamily: 'Roboto', fontSize: f(11), color: 'rgba(255,255,255,0.6)', lineHeight: lh, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical' as any }}>
                      "{r.melhorComentario}"
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        );
      }});
      // Slide 5 — Comentários dos concorrentes
      const compComtData = (auditData?.concorrentes ?? []).filter(c => (c.posts ?? []).some((p: any) => (p.comentarios_ordenados?.length ?? 0) > 0));
      if (compComtData.length > 0) {
        all.push({ id: 'ov-comentarios-concorrentes', section: 'overview_cliente', render: () => {
          const compStats = compComtData.map((comp: any) => {
            const posts = comp.posts ?? [];
            const allComt = posts.flatMap((p: any) => p.comentarios_ordenados ?? []);
            const total = allComt.length;
            const respondidos = allComt.filter((c: any) => c.comentario_foi_respondido_pelo_dono).length;
            const taxaResp = total > 0 ? Math.round((respondidos / total) * 100) : 0;
            const mediaPalavras = total > 0 ? Math.round(allComt.reduce((s: number, c: any) => s + (c.palavras ?? 0), 0) / total) : 0;
            const verificados = allComt.filter((c: any) => c.is_verified).length;
            // sentiment
            const posW = ['amei','adorei','incrível','maravilhoso','ótimo','perfeito','lindo','top','excelente','parabéns','fantástico','bom','boa','show','demais'];
            const negW = ['ruim','péssimo','horrível','decepcionante','fraco','chato','medíocre'];
            const txt = allComt.map((c: any) => c.texto ?? '').join(' ').toLowerCase();
            const pos = posW.reduce((s: number, w: string) => s + (txt.match(new RegExp(`\\b${w}\\b`, 'g'))?.length ?? 0), 0);
            const neg = negW.reduce((s: number, w: string) => s + (txt.match(new RegExp(`\\b${w}\\b`, 'g'))?.length ?? 0), 0);
            const sentTotal = pos + neg || 1;
            // top comment
            const topComt = [...allComt].sort((a: any, b: any) => (b.palavras ?? 0) - (a.palavras ?? 0))[0];
            // word freq
            const stopW = new Set(['de','a','o','que','e','do','da','em','um','para','com','uma','os','no','se','na','por','mais','é','foi','ao','das','tem','seu','sua','ou','ser','me','esse','você','essa','nem','suas','meu','às','minha','seus']);
            const wordFreq: Record<string, number> = {};
            txt.replace(/[^\p{L}\s]/gu, '').split(/\s+/).forEach((w: string) => {
              if (w.length > 3 && !stopW.has(w)) wordFreq[w] = (wordFreq[w] || 0) + 1;
            });
            const topWords = Object.entries(wordFreq).sort((a, b) => b[1] - a[1]).slice(0, 5);
            return { handle: comp.handle, total, taxaResp, mediaPalavras, verificados, posPct: Math.round((pos / sentTotal) * 100), negPct: Math.round((neg / sentTotal) * 100), topComt, topWords };
          });
          const accentColors = [C.green, '#8B5CF6', '#EC4899'];
          return (
            <div style={{ width: '100%', height: '100%', background: '#111', display: 'flex', flexDirection: 'column' }}>
              <div style={{ padding: `${f(24)}px ${f(48)}px ${f(14)}px`, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                <div style={{ fontFamily: 'Roboto', fontSize: f(11), color: 'rgba(255,255,255,0.35)', letterSpacing: 4, textTransform: 'uppercase' }}>Insights Competitivos</div>
                <div style={{ fontFamily: 'Playfair Display, Georgia, serif', fontWeight: 900, fontSize: f(30), color: C.white, textTransform: 'uppercase', lineHeight: 1.1 }}>
                  COMENTÁRIOS DOS <span style={{ color: C.green }}>CONCORRENTES</span>
                </div>
              </div>
              <div style={{ flex: 1, display: 'grid', gridTemplateColumns: isP ? '1fr' : compStats.map(() => '1fr').join(' '), gap: f(16), padding: `${f(16)}px ${f(48)}px ${f(20)}px`, overflow: 'hidden' }}>
                {compStats.map((comp, ci) => {
                  const accent = accentColors[ci % accentColors.length];
                  return (
                    <div key={comp.handle} style={{ background: 'rgba(255,255,255,0.03)', border: `1px solid rgba(255,255,255,0.08)`, borderTop: `3px solid ${accent}`, borderRadius: f(12), padding: `${f(14)}px ${f(16)}px`, display: 'flex', flexDirection: 'column', gap: f(10), overflow: 'hidden' }}>
                      {/* Header */}
                      <div style={{ fontFamily: 'Playfair Display, Georgia, serif', fontWeight: 900, fontSize: f(16), color: accent }}>@{comp.handle}</div>
                      {/* Métricas */}
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: f(8) }}>
                        {[
                          { label: 'Total comentários', val: comp.total.toString() },
                          { label: 'Taxa de resposta', val: `${comp.taxaResp}%` },
                          { label: 'Média de palavras', val: comp.mediaPalavras.toString() },
                          { label: 'Contas verificadas', val: comp.verificados.toString() },
                        ].map((m, mi) => (
                          <div key={mi} style={{ background: 'rgba(255,255,255,0.04)', borderRadius: f(8), padding: `${f(8)}px ${f(10)}px` }}>
                            <div style={{ fontFamily: 'Playfair Display, Georgia, serif', fontWeight: 900, fontSize: f(18), color: accent, lineHeight: 1 }}>{m.val}</div>
                            <div style={{ fontFamily: 'Roboto', fontSize: f(10), color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: 1, marginTop: f(2) }}>{m.label}</div>
                          </div>
                        ))}
                      </div>
                      {/* Sentimento */}
                      <div>
                        <div style={{ fontFamily: 'Roboto', fontSize: f(10), color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: f(6) }}>Sentimento estimado</div>
                        <div style={{ display: 'flex', gap: f(4), height: f(10), borderRadius: 99, overflow: 'hidden' }}>
                          <div style={{ flex: comp.posPct, background: C.green }} />
                          <div style={{ flex: Math.max(0, 100 - comp.posPct - comp.negPct), background: 'rgba(255,255,255,0.12)' }} />
                          <div style={{ flex: comp.negPct, background: '#EF4444' }} />
                        </div>
                        <div style={{ display: 'flex', gap: f(12), marginTop: f(5) }}>
                          <span style={{ fontFamily: 'Roboto', fontSize: f(10), color: C.green }}>✓ {comp.posPct}% positivo</span>
                          <span style={{ fontFamily: 'Roboto', fontSize: f(10), color: '#EF4444' }}>✗ {comp.negPct}% negativo</span>
                        </div>
                      </div>
                      {/* Top palavras */}
                      <div>
                        <div style={{ fontFamily: 'Roboto', fontSize: f(10), color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: f(6) }}>Palavras mais citadas</div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: f(5) }}>
                          {comp.topWords.map(([word, freq]) => (
                            <span key={word} style={{ fontFamily: 'Roboto', fontSize: f(11), color: 'rgba(255,255,255,0.7)', background: `${accent}22`, border: `1px solid ${accent}44`, borderRadius: f(5), padding: `${f(3)}px ${f(8)}px` }}>{word} <span style={{ color: accent }}>{freq}×</span></span>
                          ))}
                        </div>
                      </div>
                      {/* Melhor comentário */}
                      {comp.topComt && (
                        <div style={{ flex: 1, background: 'rgba(255,255,255,0.04)', borderRadius: f(8), padding: `${f(8)}px ${f(10)}px`, borderLeft: `3px solid ${accent}`, overflow: 'hidden' }}>
                          <div style={{ fontFamily: 'Roboto', fontSize: f(10), color: 'rgba(255,255,255,0.35)', marginBottom: f(4) }}>💬 Comentário mais elaborado</div>
                          <div style={{ fontFamily: 'Roboto', fontSize: f(12), color: 'rgba(255,255,255,0.7)', lineHeight: 1.5, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical' as any }}>
                            "@{comp.topComt.comentador_username}" — "{comp.topComt.texto}"
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        }});
      }
    }
  }

  // ── DIRETRIZES ───────────────────────────────────────────────────────────────
  if (section === 'all' || section === 'diretrizes_tecnicas') {

    all.push({ id: 'dt-cover', section: 'diretrizes_tecnicas', render: () => (
      <div style={{ width: '100%', height: '100%', background: C.secondary, display: 'flex', flexDirection: 'column' }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '0 80px' }}>
          <div style={{ fontFamily: 'Roboto', fontSize: f(15), color: 'rgba(255,255,255,0.35)', letterSpacing: 5, textTransform: 'uppercase' }}>Manual Estratégico</div>
          <div style={{ marginTop: f(16), fontFamily: 'Playfair Display, Georgia, serif', fontWeight: 900, fontSize: 76, color: C.white, lineHeight: 1.2, textTransform: 'uppercase', letterSpacing: 2 }}>
            DIRETRIZES<br /><span style={{ color: C.green }}>TÉCNICAS</span>
          </div>
          <div style={{ marginTop: f(24), fontFamily: 'Roboto', fontSize: f(20), color: 'rgba(255,255,255,0.6)', maxWidth: 580, lineHeight: lh }}>
            Tom de voz, SEO, frequência, pilares, hashtags, identidade visual e KPIs para execução.
          </div>
        </div>
        <div style={{ display: 'flex', height: 8 }}>
          <div style={{ flex: 3, background: C.green }} />
          <div style={{ flex: 2, background: C.primary }} />
          <div style={{ flex: 1, background: C.yellow }} />
        </div>
      </div>
    )});

    all.push({ id: 'dt-tom', section: 'diretrizes_tecnicas', render: () => (
      <div style={{ width: '100%', height: '100%', background: C.secondary, display: 'flex', flexDirection: isP ? 'column' : 'row' }}>
        <div style={{ width: isP ? '100%' : '40%', display: 'flex', flexDirection: 'column', padding: isP ? '28px 40px 20px' : 48, background: '#111' }}>
          <div style={{ fontFamily: 'Roboto', fontSize: f(11), color: 'rgba(255,255,255,0.35)', letterSpacing: 3, textTransform: 'uppercase' }}>Comunicação</div>
          <div style={{ marginTop: f(8), fontFamily: 'Playfair Display, Georgia, serif', fontWeight: 900, fontSize: 36, color: C.white, textTransform: 'uppercase', lineHeight: 1.1 }}>TOM DE VOZ</div>
          <div style={{ marginTop: f(12), display: 'inline-block', padding: `${f(5)}px ${f(14)}px`, borderRadius: 8, background: C.primary, width: 'fit-content' }}>
            <span style={{ fontFamily: 'Roboto', fontSize: f(14), color: C.white }}>{dt.tom_de_voz.personalidade}</span>
          </div>
          <div style={{ marginTop: f(20), display: 'flex', flexDirection: isP ? 'row' : 'column', gap: isP ? f(24) : 0 }}>
            <div style={{ flex: isP ? 1 : undefined }}>
              <div style={{ fontFamily: 'Playfair Display, Georgia, serif', fontWeight: 700, fontSize: f(12), color: C.green, textTransform: 'uppercase', letterSpacing: 1, marginBottom: f(8) }}>✅ Como Falar</div>
              {dt.tom_de_voz.como_falar?.map((t, i) => (
                <div key={i} style={{ display: 'flex', gap: f(8), marginBottom: f(6), alignItems: 'flex-start' }}>
                  <div style={{ color: C.green, fontSize: f(12), marginTop: 2 }}>▸</div>
                  <span style={{ fontFamily: 'Roboto', fontSize: f(12), color: 'rgba(255,255,255,0.8)', lineHeight: lh }}>{t}</span>
                </div>
              ))}
            </div>
            <div style={{ flex: isP ? 1 : undefined, marginTop: isP ? 0 : f(16) }}>
              <div style={{ fontFamily: 'Playfair Display, Georgia, serif', fontWeight: 700, fontSize: f(12), color: C.primary, textTransform: 'uppercase', letterSpacing: 1, marginBottom: f(8) }}>❌ Como NÃO Falar</div>
              {dt.tom_de_voz.como_nao_falar?.map((t, i) => (
                <div key={i} style={{ display: 'flex', gap: f(8), marginBottom: f(6), alignItems: 'flex-start' }}>
                  <div style={{ color: C.primary, fontSize: f(12), marginTop: 2 }}>▸</div>
                  <span style={{ fontFamily: 'Roboto', fontSize: f(12), color: 'rgba(255,255,255,0.5)', lineHeight: lh }}>{t}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: isP ? '20px 40px 32px' : 48, gap: f(20) }}>
          <div>
            <div style={{ fontFamily: 'Playfair Display, Georgia, serif', fontWeight: 700, fontSize: f(14), color: C.green, textTransform: 'uppercase', marginBottom: f(10) }}>Frases que funcionam</div>
            {dt.tom_de_voz.exemplos_frase_ok?.map((ex, i) => (
              <div key={i} style={{ marginBottom: f(10), padding: f(14), borderRadius: 12, background: 'rgba(0,179,126,0.08)', border: '1px solid rgba(0,179,126,0.22)' }}>
                <span style={{ fontFamily: 'Roboto', fontSize: f(14), color: C.white }}>"{ex}"</span>
              </div>
            ))}
          </div>
          <div>
            <div style={{ fontFamily: 'Playfair Display, Georgia, serif', fontWeight: 700, fontSize: f(14), color: C.primary, textTransform: 'uppercase', marginBottom: f(10) }}>Frases a evitar</div>
            {dt.tom_de_voz.exemplos_frase_evitar?.map((ex, i) => (
              <div key={i} style={{ marginBottom: f(10), padding: f(14), borderRadius: 12, background: 'rgba(255,102,0,0.06)', border: '1px solid rgba(255,102,0,0.18)' }}>
                <span style={{ fontFamily: 'Roboto', fontSize: f(14), color: 'rgba(255,255,255,0.4)', textDecoration: 'line-through' }}>"{ex}"</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    )});

    all.push({ id: 'dt-frequencia', section: 'diretrizes_tecnicas', render: () => {
      const dist = dt.frequencia_publicacao.distribuicao_formatos;
      const storiesVal = dist.stories_por_dia != null ? String(dist.stories_por_dia) : '—';
      const diasPicoLower = (dt.frequencia_publicacao.dias_de_pico ?? []).map((d: string) => d.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, ''));
      const diasSemana = [
        { label: 'Seg', full: 'Segunda' },
        { label: 'Ter', full: 'Terça'   },
        { label: 'Qua', full: 'Quarta'  },
        { label: 'Qui', full: 'Quinta'  },
        { label: 'Sex', full: 'Sexta'   },
        { label: 'Sáb', full: 'Sábado'  },
        { label: 'Dom', full: 'Domingo' },
      ];

      // Competitor timing from publicado_em
      const dayNamesIdx = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];
      interface TimeStat { count: number; totalEng: number }
      const compTiming = (auditData?.concorrentes ?? []).map((comp: any) => {
        const posts: any[] = comp.posts ?? [];
        const dayMap: Record<string, TimeStat> = {};
        const hourBuckets: Record<string, TimeStat> = { 'Manhã (6-11h)': {count:0,totalEng:0}, 'Tarde (12-17h)': {count:0,totalEng:0}, 'Noite (18-23h)': {count:0,totalEng:0}, 'Madrugada (0-5h)': {count:0,totalEng:0} };
        for (const p of posts) {
          if (!p.publicado_em) continue;
          const d = new Date(p.publicado_em);
          const dayKey = dayNamesIdx[d.getDay()];
          const hour = d.getHours();
          const eng = p.engajamento_total ?? 0;
          if (!dayMap[dayKey]) dayMap[dayKey] = { count: 0, totalEng: 0 };
          dayMap[dayKey].count++;
          dayMap[dayKey].totalEng += eng;
          const bucket = hour < 6 ? 'Madrugada (0-5h)' : hour < 12 ? 'Manhã (6-11h)' : hour < 18 ? 'Tarde (12-17h)' : 'Noite (18-23h)';
          hourBuckets[bucket].count++;
          hourBuckets[bucket].totalEng += eng;
        }
        const bestDay = Object.entries(dayMap).sort((a,b) => (b[1].totalEng/Math.max(b[1].count,1)) - (a[1].totalEng/Math.max(a[1].count,1)))[0];
        const bestHour = Object.entries(hourBuckets).filter(([,v]) => v.count > 0).sort((a,b) => (b[1].totalEng/Math.max(b[1].count,1)) - (a[1].totalEng/Math.max(a[1].count,1)))[0];
        const dayDist = dayNamesIdx.map(day => ({ day, count: dayMap[day]?.count ?? 0, avgEng: dayMap[day] ? Math.round(dayMap[day].totalEng / dayMap[day].count) : 0 }));
        const maxDayEng = Math.max(...dayDist.map(d => d.avgEng), 1);
        return { handle: comp.handle, dayDist, bestDay: bestDay?.[0], bestHour: bestHour?.[0], hourBuckets, maxDayEng };
      });

      const accentComp = [C.green, '#8B5CF6'];
      return (
        <div style={{ width: '100%', height: '100%', background: C.secondary, display: 'flex', flexDirection: 'column', padding: `${f(28)}px ${f(48)}px ${f(20)}px` }}>
          <div style={{ marginBottom: f(16), fontFamily: 'Playfair Display, Georgia, serif', fontWeight: 900, fontSize: f(28), color: C.white, textTransform: 'uppercase' }}>
            Frequência & <span style={{ color: C.primary }}>Formatos</span>
          </div>
          <div style={{ display: 'flex', flexDirection: isP ? 'column' : 'row', gap: f(20), flex: 1, overflow: 'hidden' }}>
            {/* Coluna esquerda — métricas + dias */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: f(12), width: isP ? '100%' : '28%', flexShrink: 0 }}>
              <div style={{ display: 'flex', gap: f(10) }}>
                {[
                  { label: 'Posts/semana', val: String(dt.frequencia_publicacao.posts_por_semana) },
                  { label: 'Posts/dia',    val: String(dt.frequencia_publicacao.posts_por_dia)    },
                ].map((m) => (
                  <div key={m.label} style={{ flex: 1, borderRadius: f(10), padding: `${f(10)}px ${f(12)}px`, background: 'rgba(255,102,0,0.1)', border: '1px solid rgba(255,102,0,0.25)' }}>
                    <div style={{ fontFamily: 'Playfair Display, Georgia, serif', fontWeight: 900, fontSize: f(24), color: C.primary, lineHeight: 1 }}>{m.val}</div>
                    <div style={{ fontFamily: 'Roboto', fontSize: f(10), color: 'rgba(255,255,255,0.45)', marginTop: f(3), textTransform: 'uppercase', letterSpacing: 0.5 }}>{m.label}</div>
                  </div>
                ))}
              </div>
              {/* Melhores horários */}
              <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: f(10), padding: `${f(10)}px ${f(14)}px` }}>
                <div style={{ fontFamily: 'Playfair Display, Georgia, serif', fontWeight: 700, fontSize: f(11), color: C.yellow, textTransform: 'uppercase', letterSpacing: 2, marginBottom: f(8) }}>⏰ Melhores Horários</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: f(5) }}>
                  {dt.frequencia_publicacao.melhores_horarios?.map((h: string, i: number) => (
                    <div key={i} style={{ padding: `${f(6)}px ${f(10)}px`, borderRadius: f(6), background: 'rgba(255,214,0,0.07)', border: '1px solid rgba(255,214,0,0.15)' }}>
                      <span style={{ fontFamily: 'Roboto', fontSize: f(12), color: 'rgba(255,255,255,0.85)' }}>{h}</span>
                    </div>
                  ))}
                </div>
              </div>
              {/* Dias de pico */}
              <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: f(10), padding: `${f(10)}px ${f(14)}px` }}>
                <div style={{ fontFamily: 'Playfair Display, Georgia, serif', fontWeight: 700, fontSize: f(11), color: C.primary, textTransform: 'uppercase', letterSpacing: 2, marginBottom: f(8) }}>🔥 Dias de Pico</div>
                <div style={{ display: 'flex', gap: f(5), flexWrap: 'wrap' }}>
                  {diasSemana.map(({ label, full }) => {
                    const key = full.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');
                    const isPico = diasPicoLower.includes(key);
                    return (
                      <div key={label} style={{ borderRadius: f(6), padding: `${f(5)}px ${f(9)}px`, background: isPico ? C.primary : 'rgba(255,255,255,0.05)', border: isPico ? 'none' : '1px solid rgba(255,255,255,0.09)' }}>
                        <span style={{ fontFamily: 'Roboto', fontSize: f(11), fontWeight: isPico ? 700 : 400, color: isPico ? '#fff' : 'rgba(255,255,255,0.45)' }}>{label}{isPico ? ' 🔥' : ''}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
              {/* Donut */}
              <div style={{ flex: 1, minHeight: 0 }}>
                <DonutChart f={f} data={[
                  { label: 'Reels',     value: dist.reels_pct     ?? 0, color: C.primary },
                  { label: 'Carrossel', value: dist.carrossel_pct ?? 0, color: C.green   },
                  { label: 'Foto',      value: dist.foto_pct      ?? 0, color: C.yellow  },
                ]} />
              </div>
            </div>
            {/* Coluna direita — timing dos concorrentes */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: f(12), overflow: 'hidden' }}>
              <div style={{ fontFamily: 'Playfair Display, Georgia, serif', fontWeight: 700, fontSize: f(12), color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: 2 }}>📊 Padrão de publicação dos concorrentes</div>
              {compTiming.map((comp, ci) => {
                const accent = accentComp[ci % accentComp.length];
                return (
                  <div key={comp.handle} style={{ flex: 1, background: 'rgba(255,255,255,0.03)', border: `1px solid rgba(255,255,255,0.07)`, borderTop: `2px solid ${accent}`, borderRadius: f(10), padding: `${f(12)}px ${f(16)}px`, display: 'flex', flexDirection: 'column', gap: f(10), overflow: 'hidden' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ fontFamily: 'Playfair Display, Georgia, serif', fontWeight: 900, fontSize: f(14), color: accent }}>@{comp.handle}</div>
                      <div style={{ display: 'flex', gap: f(12) }}>
                        {comp.bestDay && <span style={{ fontFamily: 'Roboto', fontSize: f(11), color: 'rgba(255,255,255,0.5)' }}>🏆 Melhor dia: <span style={{ color: accent, fontWeight: 700 }}>{comp.bestDay}</span></span>}
                        {comp.bestHour && <span style={{ fontFamily: 'Roboto', fontSize: f(11), color: 'rgba(255,255,255,0.5)' }}>⏰ Melhor período: <span style={{ color: accent, fontWeight: 700 }}>{comp.bestHour}</span></span>}
                      </div>
                    </div>
                    {/* Mini heatmap por dia */}
                    <div>
                      <div style={{ fontFamily: 'Roboto', fontSize: f(10), color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: f(6) }}>Engajamento médio por dia da semana</div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: f(4) }}>
                        {comp.dayDist.map(({ day, count, avgEng }) => {
                          const pct = comp.maxDayEng > 0 ? Math.round((avgEng / comp.maxDayEng) * 100) : 0;
                          const isTop = pct === 100 && count > 0;
                          return (
                            <div key={day} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: f(3) }}>
                              <div style={{ width: '100%', height: f(30), borderRadius: f(5), background: `${accent}${Math.round(pct * 0.8 + 10).toString(16).padStart(2,'0')}`, border: isTop ? `1px solid ${accent}` : '1px solid transparent', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                {count > 0 && <span style={{ fontFamily: 'Playfair Display, Georgia, serif', fontWeight: 700, fontSize: f(9), color: '#fff' }}>{count}p</span>}
                              </div>
                              <span style={{ fontFamily: 'Roboto', fontSize: f(9), color: isTop ? accent : 'rgba(255,255,255,0.35)', fontWeight: isTop ? 700 : 400 }}>{day}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                    {/* Turno */}
                    <div>
                      <div style={{ fontFamily: 'Roboto', fontSize: f(10), color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: f(6) }}>Distribuição por período do dia</div>
                      <div style={{ display: 'flex', gap: f(8) }}>
                        {Object.entries(comp.hourBuckets).filter(([,v]) => v.count > 0).sort((a,b) => b[1].totalEng - a[1].totalEng).map(([bucket, stat]) => (
                          <div key={bucket} style={{ flex: 1, padding: `${f(6)}px ${f(8)}px`, borderRadius: f(6), background: 'rgba(255,255,255,0.05)', textAlign: 'center' }}>
                            <div style={{ fontFamily: 'Roboto', fontSize: f(10), color: 'rgba(255,255,255,0.5)', lineHeight: 1.4 }}>{bucket.split(' ')[0]}</div>
                            <div style={{ fontFamily: 'Roboto', fontSize: f(9), color: 'rgba(255,255,255,0.3)' }}>{bucket.match(/\(([^)]+)\)/)?.[1]}</div>
                            <div style={{ fontFamily: 'Playfair Display, Georgia, serif', fontWeight: 700, fontSize: f(12), color: accent, marginTop: f(2) }}>{stat.count}p</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      );
    }});

    all.push({ id: 'dt-pilares', section: 'diretrizes_tecnicas', render: () => {
      const pillarColors = [C.primary, C.green, C.yellow, 'rgba(200,200,255,0.8)', C.white];
      return (
        <div style={{ width: '100%', height: '100%', background: C.secondary, display: 'flex', flexDirection: 'column', padding: 56 }}>
          <div style={{ marginBottom: f(24), fontFamily: 'Playfair Display, Georgia, serif', fontWeight: 900, fontSize: 36, color: C.white, textTransform: 'uppercase' }}>Pilares de Conteúdo</div>
          <div style={{ display: 'flex', flexDirection: isP ? 'column' : 'row', gap: f(40), flex: 1, alignItems: 'flex-start' }}>
            <DonutChart f={f} data={dt.pilares_conteudo?.map((p2, i) => ({ label: p2.pilar, value: p2.porcentagem, color: pillarColors[i] ?? C.white }))} />
            <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: f(14), width: isP ? '100%' : undefined }}>
              {dt.pilares_conteudo?.map((p2, i) => (
                <div key={i} style={{ borderRadius: 16, padding: f(20), background: `${pillarColors[i] ?? C.white}0e`, border: `1px solid ${pillarColors[i] ?? C.white}44` }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: f(10) }}>
                    <div style={{ fontFamily: 'Playfair Display, Georgia, serif', fontWeight: 700, fontSize: f(16), color: pillarColors[i] ?? C.white }}>{p2.pilar}</div>
                    <div style={{ borderRadius: '50%', width: f(36), height: f(36), background: pillarColors[i] ?? C.white, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Playfair Display, Georgia, serif', fontWeight: 900, fontSize: f(13), color: (i === 2 || i === 4) ? C.secondary : C.white, flexShrink: 0 }}>{p2.porcentagem}%</div>
                  </div>
                  <p style={{ fontFamily: 'Roboto', fontSize: f(12), color: 'rgba(255,255,255,0.7)', lineHeight: lh, marginBottom: f(8), marginTop: 0 }}>{p2.descricao}</p>
                  {!!p2.por_que_funciona && (
                    <div style={{ padding: f(8), borderRadius: 8, background: 'rgba(255,255,255,0.04)' }}>
                      <span style={{ fontFamily: 'Roboto', fontSize: f(11), color: 'rgba(255,255,255,0.4)' }}>💡 {p2.por_que_funciona}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      );
    }});

    // Slide: Assuntos Quentes (movido para depois de dt-pilares)
    all.push({ id: 'dt-assuntos', section: 'diretrizes_tecnicas', render: () => (
      <div style={{ width: '100%', height: '100%', background: C.secondary, display: 'flex', flexDirection: 'column', padding: 56 }}>
        <div style={{ marginBottom: f(24), fontFamily: 'Playfair Display, Georgia, serif', fontWeight: 900, fontSize: 36, color: C.white, textTransform: 'uppercase' }}>🔥 Assuntos Quentes</div>
        <div style={{ display: 'grid', gridTemplateColumns: isP ? '1fr 1fr' : '1fr 1fr 1fr', gap: f(10), flex: 1 }}>
          {dt.assuntos_quentes?.map((a, i) => {
            const cols = [C.primary, C.green, C.yellow];
            const col  = cols[i % 3];
            return (
              <div key={i} style={{ borderRadius: 12, padding: f(14), display: 'flex', alignItems: 'center', gap: f(10), background: `${col}0c`, border: `1px solid ${col}2a` }}>
                <div style={{ width: f(28), height: f(28), borderRadius: '50%', background: col, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Playfair Display, Georgia, serif', fontWeight: 900, fontSize: f(11), color: i % 3 === 2 ? C.secondary : C.white, flexShrink: 0 }}>{i + 1}</div>
                <span style={{ fontFamily: 'Roboto', fontSize: f(13), color: 'rgba(255,255,255,0.85)', lineHeight: lh }}>{a}</span>
              </div>
            );
          })}
        </div>
      </div>
    )});

    // Slide: Ganchos Modelo + CTAs Recomendados
    all.push({ id: 'dt-ganchos', section: 'diretrizes_tecnicas', render: () => (
      <div style={{ width: '100%', height: '100%', background: C.secondary, display: 'flex', flexDirection: isP ? 'column' : 'row', overflow: 'hidden' }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: isP ? '28px 36px 16px' : '40px 48px', borderRight: isP ? 'none' : '1px solid rgba(255,255,255,0.06)', borderBottom: isP ? '1px solid rgba(255,255,255,0.06)' : 'none' }}>
          <div style={{ marginBottom: f(14), fontFamily: 'Playfair Display, Georgia, serif', fontWeight: 900, fontSize: f(20), color: C.white, textTransform: 'uppercase' }}>🪝 Ganchos Modelo</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: f(8), flex: 1, overflow: 'hidden' }}>
            {dt.ganchos_modelo?.map((g: any, i) => {
              const gancho = typeof g === 'string' ? g : (g.gancho ?? String(g));
              const inspir = typeof g === 'string' ? null : g.inspirado_em;
              return (
              <div key={i} style={{ borderRadius: 10, padding: `${f(10)}px ${f(14)}px`, position: 'relative', overflow: 'hidden', background: 'rgba(255,102,0,0.08)', border: '1px solid rgba(255,102,0,0.25)', flex: 1, display: 'flex', alignItems: 'center' }}>
                <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, background: C.primary }} />
                <div style={{ fontFamily: 'Playfair Display, Georgia, serif', fontWeight: 700, fontSize: f(12), color: C.white, lineHeight: 1.3, paddingLeft: 8 }}>"{gancho}"</div>
                {inspir && <Tag text={`Inspirado em ${inspir}`} color={C.primary} f={f} />}
              </div>
              );
            })}
          </div>
        </div>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: isP ? '16px 36px 28px' : '40px 48px' }}>
          <div style={{ marginBottom: f(14), fontFamily: 'Playfair Display, Georgia, serif', fontWeight: 900, fontSize: f(20), color: C.white, textTransform: 'uppercase' }}>💬 CTAs Recomendados</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: f(8), flex: 1, overflow: 'hidden' }}>
            {dt.ctas_recomendados?.map((c: any, i) => {
              const icons = ['💬', '📩', '🔗', '📣', '✉️'];
              const cols  = [C.green, C.primary, C.yellow, C.green, C.primary];
              const col   = cols[i % cols.length];
              const ctatext = typeof c === 'string' ? c : (c.cta ?? String(c));
              const quando  = typeof c === 'string' ? null : c.quando_usar;
              return (
                <div key={i} style={{ flex: 1, borderRadius: 10, padding: `${f(10)}px ${f(14)}px`, background: `${col}0e`, border: `1px solid ${col}2a`, display: 'flex', alignItems: 'center' }}>
                  <div style={{ display: 'flex', gap: f(8), alignItems: 'center', width: '100%' }}>
                    <span style={{ fontSize: f(16), flexShrink: 0 }}>{icons[i % icons.length]}</span>
                    <div>
                      <div style={{ fontFamily: 'Playfair Display, Georgia, serif', fontWeight: 700, fontSize: f(12), color: col, lineHeight: 1.3 }}>"{ctatext}"</div>
                      {quando && <Tag text={quando} color={col} f={f} />}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    )});

    // Slide: Ideias de Títulos + Stories Recorrentes
    all.push({ id: 'dt-titulos', section: 'diretrizes_tecnicas', render: () => (
      <div style={{ width: '100%', height: '100%', background: C.secondary, display: 'flex', flexDirection: 'column', overflow: 'hidden', padding: isP ? '32px 32px' : '40px 64px' }}>

        {/* ── Ideias de Títulos ──────────────────────────────────────────────── */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ marginBottom: f(14), fontFamily: 'Playfair Display, Georgia, serif', fontWeight: 900, fontSize: f(20), color: C.white, textTransform: 'uppercase' }}>💬 Ideias de Títulos</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: `${f(8)}px ${f(32)}px`, flex: 1, overflow: 'hidden', alignContent: 'start' }}>
            {dt.ideias_de_titulos?.map((t: any, i) => {
              const titulo = typeof t === 'string' ? t : (t.titulo ?? String(t));
              return (
                <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: f(10) }}>
                  <div style={{ width: f(26), height: f(26), borderRadius: '50%', background: C.yellow, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Playfair Display, Georgia, serif', fontWeight: 900, fontSize: f(12), color: C.secondary, flexShrink: 0, marginTop: 2 }}>{i + 1}</div>
                  <div style={{ flex: 1 }}>
                    <span style={{ fontFamily: 'Roboto', fontSize: f(14), color: 'rgba(255,255,255,0.9)', lineHeight: 1.35 }}>{titulo}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Divisor ────────────────────────────────────────────────────────── */}
        <div style={{ height: 1, background: 'rgba(255,255,255,0.08)', flexShrink: 0 }} />

        {/* ── Stories Recorrentes ────────────────────────────────────────────── */}
        <div style={{ flex: '0 0 auto', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ marginBottom: f(14), fontFamily: 'Playfair Display, Georgia, serif', fontWeight: 900, fontSize: f(20), color: C.white, textTransform: 'uppercase' }}>📱 Stories Recorrentes</div>
          <div style={{ display: 'grid', gridTemplateColumns: isP ? '1fr' : '1fr 1fr', gap: f(10) }}>
            {dt.stories_recorrentes?.map((s: any, i) => {
              const tipo      = typeof s === 'string' ? null : (s.tipo ?? s.ideia ?? null);
              const descricao = typeof s === 'string' ? s : (s.descricao ?? s.ideia ?? s.tipo ?? String(s));
              const frequencia = typeof s === 'string' ? null : (s.frequencia ?? s.objetivo ?? null);
              return (
                <div key={i} style={{ borderRadius: 10, padding: `${f(12)}px ${f(16)}px`, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)' }}>
                  {/* Tipo + Frequência em linha */}
                  <div style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: f(4) }}>
                    {tipo && <div style={{ fontFamily: 'Playfair Display, Georgia, serif', fontWeight: 700, fontSize: f(12), color: C.green }}>{tipo}</div>}
                    {frequencia && <Tag text={frequencia} color={C.green} f={f} />}
                  </div>
                  {/* Descrição */}
                  <div style={{ fontFamily: 'Roboto', fontSize: f(13), color: 'rgba(255,255,255,0.85)', lineHeight: 1.4 }}>{descricao}</div>
                </div>
              );
            })}
          </div>
        </div>

      </div>
    )});

    all.push({ id: 'dt-seo', section: 'diretrizes_tecnicas', render: () => (
      <div style={{ width: '100%', height: '100%', background: C.secondary, display: 'flex', flexDirection: 'column', padding: 56 }}>
        <div style={{ marginBottom: f(24), fontFamily: 'Playfair Display, Georgia, serif', fontWeight: 900, fontSize: 36, color: C.white, textTransform: 'uppercase' }}>🔍 SEO Instagram</div>
        <div style={{ display: 'flex', flexDirection: isP ? 'column' : 'row', gap: f(24), flex: 1 }}>
          {/* Palavras-chave */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: f(16) }}>
            <div style={{ borderRadius: 16, padding: f(20), background: 'rgba(255,102,0,0.08)', border: '1px solid rgba(255,102,0,0.25)' }}>
              <div style={{ fontFamily: 'Playfair Display, Georgia, serif', fontWeight: 700, fontSize: f(13), color: C.primary, textTransform: 'uppercase', marginBottom: f(10) }}>📌 Palavras-chave Principais</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: f(6) }}>
                {dt.seo_instagram.palavras_chave_principais?.map((k) => <Tag key={k} text={k} color={C.primary} f={f} />)}
              </div>
            </div>
            <div style={{ borderRadius: 16, padding: f(20), background: 'rgba(0,179,126,0.08)', border: '1px solid rgba(0,179,126,0.25)' }}>
              <div style={{ fontFamily: 'Playfair Display, Georgia, serif', fontWeight: 700, fontSize: f(13), color: C.green, textTransform: 'uppercase', marginBottom: f(10) }}>🔄 Palavras-chave Secundárias</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: f(6) }}>
                {dt.seo_instagram.palavras_chave_secundarias?.map((k) => <Tag key={k} text={k} color={C.green} f={f} />)}
              </div>
            </div>
          </div>
          {/* Usos e instruções */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: f(14) }}>
            {[
              { icon: '📝', label: 'Uso na Bio',      val: dt.seo_instagram.uso_em_bio },
              { icon: '✍️', label: 'Uso na Legenda',  val: dt.seo_instagram.uso_em_legenda },
              { icon: '🖼️', label: 'Uso no Alt Text', val: dt.seo_instagram.uso_em_alt_text },
            ].filter(m => !!m.val).map(m => (
              <div key={m.label} style={{ borderRadius: 16, padding: f(18), background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
                <div style={{ fontFamily: 'Playfair Display, Georgia, serif', fontWeight: 700, fontSize: f(12), color: C.yellow, textTransform: 'uppercase', marginBottom: f(8) }}>{m.icon} {m.label}</div>
                <p style={{ fontFamily: 'Roboto', fontSize: f(13), color: 'rgba(255,255,255,0.85)', lineHeight: lh, margin: 0 }}>{m.val}</p>
              </div>
            ))}
            {!!dt.seo_instagram.categoria_perfil_recomendada && (
              <div style={{ padding: `${f(10)}px ${f(16)}px`, borderRadius: 12, background: `${C.primary}15`, border: `1px solid ${C.primary}33`, display: 'flex', alignItems: 'center', gap: f(10) }}>
                <span style={{ fontSize: f(16) }}>📍</span>
                <div>
                  <span style={{ fontFamily: 'Roboto', fontSize: f(11), color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase' }}>Categoria recomendada: </span>
                  <span style={{ fontFamily: 'Playfair Display, Georgia, serif', fontWeight: 700, fontSize: f(13), color: C.white }}>{dt.seo_instagram.categoria_perfil_recomendada}</span>
                </div>
              </div>
            )}
            {!dt.seo_instagram.uso_em_bio && !dt.seo_instagram.uso_em_legenda && !dt.seo_instagram.uso_em_alt_text && !dt.seo_instagram.categoria_perfil_recomendada && (
              <div style={{ padding: f(18), borderRadius: 16, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                <p style={{ fontFamily: 'Roboto', fontSize: f(13), color: 'rgba(255,255,255,0.3)', fontStyle: 'italic', margin: 0 }}>
                  Instruções de uso não foram geradas para este cliente.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    )});

    all.push({ id: 'dt-hashtags', section: 'diretrizes_tecnicas', render: () => (
      <div style={{ width: '100%', height: '100%', background: C.secondary, display: 'flex', flexDirection: 'column', padding: 56 }}>
        <div style={{ marginBottom: f(24), fontFamily: 'Playfair Display, Georgia, serif', fontWeight: 900, fontSize: 36, color: C.white, textTransform: 'uppercase' }}># Palavras Estratégicas para SEO</div>
        <div style={{ display: 'grid', gridTemplateColumns: isP ? '1fr 1fr' : '1fr 1fr 1fr', gap: f(20), flex: 1 }}>
          <div style={{ borderRadius: 20, padding: f(22), background: 'rgba(255,102,0,0.08)', border: '1px solid rgba(255,102,0,0.28)' }}>
            <div style={{ marginBottom: f(14), display: 'flex', alignItems: 'center', gap: f(8) }}>
              <span style={{ fontSize: f(18) }}>📌</span>
              <span style={{ fontFamily: 'Playfair Display, Georgia, serif', fontWeight: 700, fontSize: f(13), color: C.primary, textTransform: 'uppercase' }}>Core (sempre usar)</span>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: f(6) }}>
              {dt.hashtags_estrategicas.core?.map((h) => <Tag key={h} text={h} color={C.primary} f={f} />)}
            </div>
          </div>
          <div style={{ borderRadius: 20, padding: f(22), background: 'rgba(0,179,126,0.08)', border: '1px solid rgba(0,179,126,0.28)' }}>
            <div style={{ marginBottom: f(14), display: 'flex', alignItems: 'center', gap: f(8) }}>
              <span style={{ fontSize: f(18) }}>🔄</span>
              <span style={{ fontFamily: 'Playfair Display, Georgia, serif', fontWeight: 700, fontSize: f(13), color: C.green, textTransform: 'uppercase' }}>Rotativas — Nicho</span>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: f(6) }}>
              {dt.hashtags_estrategicas.rotativas_nicho?.map((h) => <Tag key={h} text={h} color={C.green} f={f} />)}
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: f(14), gridColumn: isP ? '1 / -1' : undefined }}>
            <div style={{ borderRadius: 20, padding: f(18), flex: 1, background: 'rgba(255,214,0,0.06)', border: '1px solid rgba(255,214,0,0.22)' }}>
              <div style={{ marginBottom: f(10), display: 'flex', alignItems: 'center', gap: f(8) }}>
                <span style={{ fontSize: f(16) }}>📈</span>
                <span style={{ fontFamily: 'Playfair Display, Georgia, serif', fontWeight: 700, fontSize: f(13), color: C.yellow, textTransform: 'uppercase' }}>Alto Volume</span>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: f(6) }}>
                {dt.hashtags_estrategicas.rotativas_alto_volume?.map((h) => <Tag key={h} text={h} color={C.yellow} f={f} />)}
              </div>
            </div>
            <div style={{ borderRadius: 20, padding: f(18), background: 'rgba(255,60,60,0.07)', border: '1px solid rgba(255,60,60,0.22)' }}>
              <div style={{ marginBottom: f(10), display: 'flex', alignItems: 'center', gap: f(8) }}>
                <span style={{ fontSize: f(16) }}>🚫</span>
                <span style={{ fontFamily: 'Playfair Display, Georgia, serif', fontWeight: 700, fontSize: f(13), color: '#ff5555', textTransform: 'uppercase' }}>Evite</span>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: f(6) }}>
                {dt.hashtags_estrategicas.evite?.map((h) => (
                  <span key={h} style={{ padding: `${f(3)}px ${f(8)}px`, borderRadius: 4, fontSize: f(11), background: 'rgba(255,60,60,0.1)', color: '#ff5555', border: '1px solid rgba(255,60,60,0.2)', textDecoration: 'line-through', fontFamily: 'Roboto' }}>{h}</span>
                ))}
              </div>
            </div>
          </div>
        </div>
        {(!!dt.seo_instagram.categoria_perfil_recomendada || !!dt.seo_instagram.uso_em_bio) && (
          <div style={{ marginTop: f(16), padding: f(14), borderRadius: 12, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
            <p style={{ fontFamily: 'Roboto', fontSize: f(12), color: 'rgba(255,255,255,0.5)', margin: 0 }}>
              {!!dt.seo_instagram.categoria_perfil_recomendada && <>📍 <strong style={{ color: C.white }}>Categoria:</strong> {dt.seo_instagram.categoria_perfil_recomendada}</>}
              {!!dt.seo_instagram.categoria_perfil_recomendada && !!dt.seo_instagram.uso_em_bio && <>&nbsp;&nbsp;|&nbsp;&nbsp;</>}
              {!!dt.seo_instagram.uso_em_bio && <>📝 <strong style={{ color: C.white }}>Bio:</strong> {dt.seo_instagram.uso_em_bio}</>}
            </p>
          </div>
        )}
      </div>
    )});

    all.push({ id: 'dt-identidade', section: 'diretrizes_tecnicas', render: () => (
      <div style={{ width: '100%', height: '100%', background: C.secondary, display: 'flex', flexDirection: 'column', padding: 56 }}>
        <div style={{ marginBottom: f(24), fontFamily: 'Playfair Display, Georgia, serif', fontWeight: 900, fontSize: 36, color: C.white, textTransform: 'uppercase' }}>Identidade Visual</div>
        <div style={{ display: 'flex', flexDirection: isP ? 'column' : 'row', gap: f(32), flex: 1 }}>
          <div style={{ display: 'flex', flexDirection: isP ? 'row' : 'column', gap: f(10), width: isP ? '100%' : 260, flexShrink: 0 }}>
            {dt.identidade_visual.paleta_cores?.map((cor) => (
              <div key={cor.nome} style={{ display: 'flex', flex: isP ? 1 : undefined, alignItems: 'center', gap: f(12), borderRadius: 12, padding: f(10), background: 'rgba(255,255,255,0.03)' }}>
                <div style={{ width: isP ? f(32) : f(48), height: isP ? f(32) : f(48), borderRadius: 8, background: cor.hex, flexShrink: 0 }} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontFamily: 'Playfair Display, Georgia, serif', fontWeight: 700, fontSize: f(12), color: C.white, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{cor.nome}</div>
                  <div style={{ fontFamily: 'Roboto', fontSize: f(10), color: 'rgba(255,255,255,0.35)' }}>{cor.hex}</div>
                </div>
              </div>
            ))}
          </div>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: f(18) }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: f(12) }}>
              <div style={{ borderRadius: 12, padding: f(14), background: 'rgba(255,102,0,0.08)', border: '1px solid rgba(255,102,0,0.22)' }}>
                <div style={{ fontFamily: 'Playfair Display, Georgia, serif', fontWeight: 900, fontSize: f(16), color: C.white }}>Display</div>
                <div style={{ fontFamily: 'Roboto', fontSize: f(11), color: 'rgba(255,255,255,0.65)', marginTop: f(4) }}>{dt.identidade_visual.tipografia.display}</div>
              </div>
              <div style={{ borderRadius: 12, padding: f(14), background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
                <div style={{ fontFamily: 'Roboto', fontSize: f(16), color: C.white }}>Texto</div>
                <div style={{ fontFamily: 'Roboto', fontSize: f(11), color: 'rgba(255,255,255,0.65)', marginTop: f(4) }}>{dt.identidade_visual.tipografia.texto}</div>
              </div>
            </div>
            {dt.identidade_visual.tipografia.regras_uso && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: f(6) }}>
                {dt.identidade_visual.tipografia.regras_uso?.map((r: string, i: number) => (
                  <span key={i} style={{ padding: `${f(3)}px ${f(8)}px`, borderRadius: 4, fontSize: f(10), fontFamily: 'Roboto', color: 'rgba(255,255,255,0.5)', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>▸ {r}</span>
                ))}
              </div>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: f(12) }}>
              <div style={{ borderRadius: 12, padding: f(14), background: 'rgba(0,179,126,0.06)', border: '1px solid rgba(0,179,126,0.18)' }}>
                <div style={{ fontFamily: 'Playfair Display, Georgia, serif', fontWeight: 700, fontSize: f(12), color: C.green, marginBottom: f(6) }}>📷 Estilo Fotográfico</div>
                <p style={{ fontFamily: 'Roboto', fontSize: f(11), color: 'rgba(255,255,255,0.7)', lineHeight: lh, margin: 0 }}>{dt.identidade_visual.estilo_fotografico}</p>
              </div>
              <div style={{ borderRadius: 12, padding: f(14), background: 'rgba(255,214,0,0.06)', border: '1px solid rgba(255,214,0,0.18)' }}>
                <div style={{ fontFamily: 'Playfair Display, Georgia, serif', fontWeight: 700, fontSize: f(12), color: C.yellow, marginBottom: f(6) }}>🎨 Estilo Gráfico</div>
                <p style={{ fontFamily: 'Roboto', fontSize: f(11), color: 'rgba(255,255,255,0.7)', lineHeight: lh, margin: 0 }}>{dt.identidade_visual.estilo_grafico}</p>
              </div>
            </div>
            <div style={{ borderRadius: 12, padding: f(14), background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
              <div style={{ fontFamily: 'Playfair Display, Georgia, serif', fontWeight: 700, fontSize: f(12), color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', marginBottom: f(6) }}>👔 Vestimenta / Aparições</div>
              <p style={{ fontFamily: 'Roboto', fontSize: f(11), color: 'rgba(255,255,255,0.75)', lineHeight: lh, margin: `0 0 ${f(8)}px` }}>{dt.identidade_visual.vestimenta_aparicoes.diretrizes}</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: f(5) }}>
                {dt.identidade_visual.vestimenta_aparicoes.evitar?.map((e) => (
                  <span key={e} style={{ padding: `${f(3)}px ${f(8)}px`, borderRadius: 4, fontSize: f(10), background: 'rgba(255,60,60,0.08)', color: '#ff5555', border: '1px solid rgba(255,60,60,0.18)', textDecoration: 'line-through', fontFamily: 'Roboto' }}>{e}</span>
                ))}
              </div>
            </div>
            <div style={{ padding: f(12), borderRadius: 12, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
              <div style={{ fontFamily: 'Playfair Display, Georgia, serif', fontWeight: 700, fontSize: f(12), color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', marginBottom: f(6) }}>🏷️ Logo & Marca d'água</div>
              <p style={{ fontFamily: 'Roboto', fontSize: f(11), color: 'rgba(255,255,255,0.75)', lineHeight: lh, margin: 0 }}>{dt.identidade_visual.logos_e_marca_dagua}</p>
            </div>
          </div>
        </div>
      </div>
    )});

    all.push({ id: 'dt-kpis', section: 'diretrizes_tecnicas', render: () => (
      <div style={{ width: '100%', height: '100%', background: C.secondary, display: 'flex', flexDirection: 'column', padding: 56 }}>
        <div style={{ marginBottom: f(20), fontFamily: 'Playfair Display, Georgia, serif', fontWeight: 900, fontSize: 36, color: C.white, textTransform: 'uppercase' }}>KPIs & Metas</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: f(10), marginBottom: f(20) }}>
          {[{ label: '30 dias', color: C.yellow, icon: '🚀' }, { label: '60 dias', color: C.primary, icon: '📈' }, { label: '90 dias', color: C.green, icon: '🏆' }].map((m) => (
            <div key={m.label} style={{ borderRadius: 12, padding: `${f(10)}px ${f(14)}px`, display: 'flex', alignItems: 'center', gap: f(8), background: `${m.color}12`, border: `1px solid ${m.color}44` }}>
              <span style={{ fontSize: f(20) }}>{m.icon}</span>
              <span style={{ fontFamily: 'Playfair Display, Georgia, serif', fontWeight: 700, fontSize: f(14), color: m.color }}>Meta {m.label}</span>
            </div>
          ))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: isP ? '1fr' : '1fr 1fr', gap: f(12), flex: 1 }}>
          {dt.kpis_acompanhar?.map((k, i) => <KpiCard key={i} kpi={k.kpi} meta30={k.meta_30d} meta60={k.meta_60d} meta90={k.meta_90d} f={f} />)}
        </div>
      </div>
    )});

    all.push({ id: 'dt-briefings', section: 'diretrizes_tecnicas', render: () => (
      <div style={{ width: '100%', height: '100%', background: C.secondary, display: 'flex', flexDirection: isP ? 'column' : 'row' }}>
        <div style={{ flex: isP ? '0 0 auto' : 1, display: 'flex', flexDirection: 'column', padding: isP ? '32px 40px 20px' : 48, borderRight: isP ? 'none' : '1px solid rgba(255,255,255,0.06)', borderBottom: isP ? '1px solid rgba(255,255,255,0.06)' : 'none' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: f(14), marginBottom: f(20) }}>
            <span style={{ fontSize: f(32) }}>✍️</span>
            <div style={{ fontFamily: 'Playfair Display, Georgia, serif', fontWeight: 900, fontSize: f(24), color: C.white, textTransform: 'uppercase' }}>Briefing Redatores</div>
          </div>
          <div style={{ padding: f(20), borderRadius: 16, flex: 1, background: 'rgba(255,102,0,0.07)', border: '1px solid rgba(255,102,0,0.22)' }}>
            <p style={{ fontFamily: 'Roboto', fontSize: f(14), color: 'rgba(255,255,255,0.85)', lineHeight: lh, margin: 0 }}>{dt.briefing_redatores}</p>
          </div>
          <div style={{ marginTop: f(16), display: 'grid', gridTemplateColumns: '1fr 1fr', gap: f(8) }}>
            {[{ icon: '⚡', label: 'Gancho nos 3 primeiros segundos' }, { icon: '📝', label: '300-400 chars por legenda' }, { icon: '❓', label: 'Perguntas para comentários' }, { icon: '🎯', label: 'CTA claro em todo post' }].map((r) => (
              <div key={r.label} style={{ display: 'flex', alignItems: 'center', gap: f(8), padding: f(10), borderRadius: 10, background: 'rgba(255,255,255,0.03)' }}>
                <span style={{ fontSize: f(16) }}>{r.icon}</span>
                <span style={{ fontFamily: 'Roboto', fontSize: f(11), color: 'rgba(255,255,255,0.7)', lineHeight: lh }}>{r.label}</span>
              </div>
            ))}
          </div>
        </div>
        <div style={{ flex: isP ? '0 0 auto' : 1, display: 'flex', flexDirection: 'column', padding: isP ? '20px 40px 32px' : 48 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: f(14), marginBottom: f(20) }}>
            <span style={{ fontSize: f(32) }}>🎨</span>
            <div style={{ fontFamily: 'Playfair Display, Georgia, serif', fontWeight: 900, fontSize: f(24), color: C.white, textTransform: 'uppercase' }}>Briefing Designers</div>
          </div>
          <div style={{ padding: f(20), borderRadius: 16, flex: 1, background: 'rgba(0,179,126,0.07)', border: '1px solid rgba(0,179,126,0.22)' }}>
            <p style={{ fontFamily: 'Roboto', fontSize: f(14), color: 'rgba(255,255,255,0.85)', lineHeight: lh, margin: 0 }}>{dt.briefing_designers}</p>
          </div>
        </div>
      </div>
    )});

    const perPage = 1; // 1 post por slide — conteúdo completo (legenda + slides carrossel)
    const calItems: Record<string, unknown>[] = dt.calendario_30_dias;
    const calPages = Math.max(1, Math.ceil(calItems.length / perPage));

    // ── helper: render de um card de calendário ─────────────────────────────
    const renderCalCard = (item: Record<string, unknown>, globalIdx: number, forPrint: boolean) => {
      const cols = [C.primary, C.green, C.yellow];
      const col  = cols[globalIdx % cols.length];
      const sc   = item.slides_carrossel as Record<string, unknown> | undefined;
      const fd   = item.foto_detalhes   as Record<string, unknown> | undefined;
      const legenda = String(item.legenda_completa || item.sugestao_legenda || '');
      const hashtags = (Array.isArray(item.hashtags) ? item.hashtags as string[] : String(item.hashtags || '').split(' ')).filter(Boolean);
      const slidesList = (sc?.slides as Record<string, unknown>[] | undefined) ?? [];

      if (forPrint) {
        // ── VERSÃO PDF: compacta, sem overflow, cabe em 1080px ──────────────
        return (
          <div key={globalIdx} style={{ flex: 1, borderRadius: f(8), padding: `${f(9)}px ${f(10)}px`, display: 'flex', flexDirection: 'column', gap: f(4), background: `${col}0c`, border: `1px solid ${col}33` }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: f(4), flexWrap: 'wrap' }}>
              <div style={{ borderRadius: f(4), padding: `${f(2)}px ${f(5)}px`, background: col, fontFamily: 'Playfair Display, Georgia, serif', fontWeight: 900, fontSize: f(13), color: C.secondary }}>Dia {String(item.dia)}</div>
              <span style={{ fontFamily: 'Roboto', fontSize: f(11), color: 'rgba(255,255,255,0.45)' }}>{String(item.dia_semana)}</span>
              <span style={{ padding: `${f(1)}px ${f(4)}px`, borderRadius: f(3), fontSize: f(10), fontWeight: 700, background: col + '22', color: col, border: `1px solid ${col}44`, fontFamily: 'Roboto' }}>{String(item.formato)}</span>
            </div>
            {/* Tema + Gancho */}
            <div style={{ fontFamily: 'Playfair Display, Georgia, serif', fontWeight: 700, fontSize: f(13), color: C.white, lineHeight: 1.2 }}>{String(item.tema)}</div>
            <div style={{ fontFamily: 'Roboto', fontSize: f(11), color: col }}>{String(item.gancho_3s)}</div>
            {/* Mídia: carrossel */}
            {sc && sc.qtd_slides ? (
              <div style={{ background: 'rgba(0,0,0,0.25)', borderRadius: f(4), padding: `${f(4)}px ${f(5)}px` }}>
                <div style={{ fontFamily: 'Playfair Display, Georgia, serif', fontWeight: 700, fontSize: f(9), color: col, marginBottom: f(2) }}>
                  🃏 {String(sc.qtd_slides)} SLIDES
                </div>
                {slidesList.map((s, si) => (
                  <div key={si} style={{ borderLeft: `2px solid ${col}55`, paddingLeft: f(3), marginBottom: f(2) }}>
                    <div style={{ fontFamily: 'Playfair Display, Georgia, serif', fontWeight: 700, fontSize: f(9), color: col }}>
                      Slide {String(s.numero || si+1)}: {String(s.titulo || '')}
                    </div>
                    {s.conteudo_principal ? (
                      <div style={{ fontFamily: 'Roboto', fontSize: f(8), color: 'rgba(255,255,255,0.7)', lineHeight: 1.4, whiteSpace: 'pre-wrap' }}>
                        {String(s.conteudo_principal)}
                      </div>
                    ) : null}
                  </div>
                ))}
                {sc.slide_final ? (
                  <div style={{ fontFamily: 'Roboto', fontSize: f(8), color: 'rgba(255,255,255,0.4)', fontStyle: 'italic' }}>
                    🔚 {String((sc.slide_final as Record<string,unknown>).cta || '')}
                  </div>
                ) : null}
              </div>
            ) : fd ? (
              <div style={{ background: 'rgba(0,0,0,0.25)', borderRadius: f(4), padding: `${f(4)}px ${f(5)}px` }}>
                <div style={{ fontFamily: 'Playfair Display, Georgia, serif', fontWeight: 700, fontSize: f(9), color: col, marginBottom: f(2) }}>📷 FOTO</div>
                <div style={{ fontFamily: 'Roboto', fontSize: f(9), color: 'rgba(255,255,255,0.65)', lineHeight: 1.4 }}>
                  {String(fd.descricao_imagem || '')}
                </div>
                {fd.texto_overlay && (
                  <div style={{ fontFamily: 'Roboto', fontSize: f(9), color: col, marginTop: f(1) }}>Overlay: "{String(fd.texto_overlay)}"</div>
                )}
              </div>
            ) : null}
            {/* Legenda completa */}
            {legenda ? (
              <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: f(4), padding: `${f(4)}px ${f(5)}px`, borderLeft: `3px solid ${col}` }}>
                <div style={{ fontFamily: 'Playfair Display, Georgia, serif', fontWeight: 700, fontSize: f(8), color: 'rgba(255,255,255,0.35)', marginBottom: f(2), textTransform: 'uppercase', letterSpacing: 1 }}>📝 Legenda</div>
                <p style={{ fontFamily: 'Roboto', fontSize: f(9), color: 'rgba(255,255,255,0.7)', lineHeight: 1.5, margin: 0, whiteSpace: 'pre-wrap' }}>{legenda}</p>
              </div>
            ) : null}
            {/* Rodapé */}
            <div style={{ marginTop: f(1) }}>
              <div style={{ fontFamily: 'Roboto', fontSize: f(9), color: C.white }}>CTA: {String(item.cta)}</div>
              <div style={{ fontFamily: 'Roboto', fontSize: f(8), color: col, marginTop: f(1) }}>{String(item.pilar)} · {String(item.objetivo)}</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: f(2), marginTop: f(2) }}>
                {hashtags.map((h: string) => (
                  <span key={h} style={{ fontFamily: 'Roboto', fontSize: f(7), color: 'rgba(255,255,255,0.3)' }}>{h}</span>
                ))}
              </div>
            </div>
          </div>
        );
      }

      // ── VERSÃO TELA: completa, scrollável ───────────────────────────────────
      // Bloco de rodapé reutilizado (CTA + pilar + hashtags + objetivo)
      const footerBlock = (
        <div style={{ display: 'flex', flexDirection: 'column', gap: f(6) }}>
          <div style={{ padding: `${f(6)}px ${f(10)}px`, borderRadius: 8, background: 'rgba(0,0,0,0.2)' }}>
            <span style={{ fontFamily: 'Roboto', fontSize: f(10), color: 'rgba(255,255,255,0.4)' }}>CTA: </span>
            <span style={{ fontFamily: 'Roboto', fontSize: f(11), color: C.white }}>{String(item.cta)}</span>
          </div>
          <Tag text={String(item.pilar)} color={col} f={f} />
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: f(4) }}>
            {hashtags.map((h: string) => (
              <span key={h} style={{ fontFamily: 'Roboto', fontSize: f(9), color: 'rgba(255,255,255,0.35)' }}>{h}</span>
            ))}
          </div>
          <div style={{ fontFamily: 'Roboto', fontSize: f(10), color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: 1 }}>🎯 {String(item.objetivo)}</div>
        </div>
      );

      return (
        <div key={globalIdx} style={{ flex: 1, borderRadius: 20, padding: f(22), display: 'flex', flexDirection: 'column', gap: f(10), background: `${col}0c`, border: `1px solid ${col}33`, overflowY: 'auto' }}>
          {/* Cabeçalho: Dia · Dia da semana · Formato */}
          <div style={{ display: 'flex', alignItems: 'center', gap: f(10) }}>
            <div style={{ borderRadius: 10, padding: `${f(6)}px ${f(12)}px`, background: col, fontFamily: 'Playfair Display, Georgia, serif', fontWeight: 900, fontSize: f(16), color: C.secondary }}>Dia {String(item.dia)}</div>
            <div style={{ fontFamily: 'Roboto', fontSize: f(12), color: 'rgba(255,255,255,0.5)' }}>{String(item.dia_semana)}</div>
            <Tag text={String(item.formato)} color={col} f={f} />
          </div>
          {/* Tema */}
          <div style={{ fontFamily: 'Playfair Display, Georgia, serif', fontWeight: 700, fontSize: f(15), color: C.white, lineHeight: lh }}>{String(item.tema)}</div>
          {/* Gancho */}
          <div style={{ fontFamily: 'Roboto', fontSize: f(12), color: col, lineHeight: lh }}>{String(item.gancho_3s)}</div>

          {sc && sc.qtd_slides ? (
            /* ── CARROSSEL: grid 2 colunas (slides | legenda) ─────────────── */
            <div style={{ display: 'grid', gridTemplateColumns: '3fr 3fr', gap: f(15), flex: 1 }}>
              {/* Coluna esquerda — slides em grid 2×N */}
              <div style={{ background: 'rgba(0,0,0,0.25)', borderRadius: 10, padding: `${f(8)}px ${f(10)}px`, display: 'grid', gridTemplateColumns: '1fr 1fr', alignContent: 'start' }}>
                {slidesList.map((s, si) => (
                  <div key={si} style={{ fontFamily: 'Roboto', fontSize: f(9), color: 'rgba(255,255,255,0.6)', lineHeight: 1.5, borderLeft: `2px solid ${col}55`, paddingLeft: f(6), marginBottom: f(6) }}>
                    <div style={{ color: col, fontWeight: 700, marginBottom: f(2) }}>Slide {String(s.numero || si+1)}: {String(s.titulo || '')}</div>
                    {s.conteudo_principal ? <div style={{ color: 'rgba(255,255,255,0.75)', whiteSpace: 'pre-wrap' }}>{String(s.conteudo_principal)}</div> : null}
                    {s.visual_sugerido ? <div style={{ color: 'rgba(255,255,255,0.35)', fontStyle: 'italic', marginTop: f(2) }}>Visual: {String(s.visual_sugerido)}</div> : null}
                  </div>
                ))}
                {sc.slide_final ? (
                  <div style={{ gridColumn: '1 / -1', fontFamily: 'Roboto', fontSize: f(9), color: 'rgba(255,255,255,0.4)', marginTop: f(3), fontStyle: 'italic' }}>
                    🔚 {String((sc.slide_final as Record<string,unknown>).cta || '')}
                  </div>
                ) : null}
              </div>
              {/* Coluna direita — legenda + rodapé */}
              <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 10, padding: `${f(8)}px ${f(10)}px`, borderLeft: `3px solid ${col}`, display: 'flex', flexDirection: 'column', gap: f(8) }}>
                <div style={{ fontFamily: 'Playfair Display, Georgia, serif', fontWeight: 700, fontSize: f(9), color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: 1 }}>📝 Legenda</div>
                {legenda ? (
                  <p style={{ fontFamily: 'Roboto', fontSize: f(10), color: 'rgba(255,255,255,0.7)', lineHeight: 1.6, margin: 0, whiteSpace: 'pre-wrap', flex: 1 }}>
                    {legenda}
                  </p>
                ) : null}
                {footerBlock}
              </div>
            </div>
          ) : fd ? (
            /* ── FOTO: layout vertical padrão ──────────────────────────────── */
            <>
              <div style={{ background: 'rgba(0,0,0,0.25)', borderRadius: 10, padding: `${f(8)}px ${f(10)}px` }}>
                <div style={{ fontFamily: 'Playfair Display, Georgia, serif', fontWeight: 700, fontSize: f(10), color: col, marginBottom: f(4) }}>📷 FOTO</div>
                <div style={{ fontFamily: 'Roboto', fontSize: f(9), color: 'rgba(255,255,255,0.6)', lineHeight: 1.5 }}>
                  {String(fd.descricao_imagem || '')}
                </div>
                {fd.texto_overlay ? (
                  <div style={{ fontFamily: 'Roboto', fontSize: f(9), color: col, marginTop: f(3) }}>
                    Overlay: "{String(fd.texto_overlay)}"
                  </div>
                ) : null}
              </div>
              {legenda ? (
                <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 10, padding: `${f(8)}px ${f(10)}px`, borderLeft: `3px solid ${col}` }}>
                  <div style={{ fontFamily: 'Playfair Display, Georgia, serif', fontWeight: 700, fontSize: f(9), color: 'rgba(255,255,255,0.35)', marginBottom: f(4), textTransform: 'uppercase', letterSpacing: 1 }}>📝 Legenda</div>
                  <p style={{ fontFamily: 'Roboto', fontSize: f(10), color: 'rgba(255,255,255,0.7)', lineHeight: 1.6, margin: 0, whiteSpace: 'pre-wrap' }}>
                    {legenda}
                  </p>
                </div>
              ) : null}
              {footerBlock}
            </>
          ) : (
            /* ── SEM MÍDIA ─────────────────────────────────────────────────── */
            <>
              {legenda ? (
                <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 10, padding: `${f(8)}px ${f(10)}px`, borderLeft: `3px solid ${col}` }}>
                  <div style={{ fontFamily: 'Playfair Display, Georgia, serif', fontWeight: 700, fontSize: f(9), color: 'rgba(255,255,255,0.35)', marginBottom: f(4), textTransform: 'uppercase', letterSpacing: 1 }}>📝 Legenda</div>
                  <p style={{ fontFamily: 'Roboto', fontSize: f(10), color: 'rgba(255,255,255,0.7)', lineHeight: 1.6, margin: 0, whiteSpace: 'pre-wrap' }}>{legenda}</p>
                </div>
              ) : null}
              {footerBlock}
            </>
          )}
        </div>
      );
    };

    for (let pg = 0; pg < calPages; pg++) {
      const pageItems = calItems.slice(pg * perPage, (pg + 1) * perPage);
      const pgCopy = pg;
      // Build title: "Calendário da Semana X · pg/total"
      const firstItem = pageItems[0] as Record<string, unknown>;
      const calDia = firstItem?.dia != null ? Number(firstItem.dia) : pg * perPage + 1;
      const weekNum = Math.ceil(calDia / 7);
      const calTotalLabel = calPages > 1 ? ` · ${pg + 1}/${calPages}` : '';
      const calTitle = `📅 Calendário da Semana ${weekNum}${calTotalLabel}`;
      all.push({
        id: `dt-calendario-${pg}`,
        section: 'diretrizes_tecnicas',
        render: () => (
          <div style={{ width: '100%', height: '100%', background: C.secondary, display: 'flex', flexDirection: 'column', padding: 56, overflow: 'hidden' }}>
            <div style={{ marginBottom: f(20), fontFamily: 'Playfair Display, Georgia, serif', fontWeight: 900, fontSize: 36, color: C.white, textTransform: 'uppercase' }}>{calTitle}</div>
            <div style={{ display: 'flex', flexDirection: isP ? 'column' : 'row', gap: f(20), flex: 1, overflow: 'hidden' }}>
              {pageItems.map((item, i) => renderCalCard(item, pgCopy * perPage + i, false))}
            </div>
          </div>
        ),
        renderPrint: () => (
          <div style={{ width: '100%', height: '100%', background: C.secondary, display: 'flex', flexDirection: 'column', padding: 48, overflow: 'hidden' }}>
            <div style={{ marginBottom: 16, fontFamily: 'Playfair Display, Georgia, serif', fontWeight: 900, fontSize: 32, color: C.white, textTransform: 'uppercase' }}>{calTitle}</div>
            <div style={{ display: 'flex', gap: 16, flex: 1, overflow: 'hidden' }}>
              {pageItems.map((item, i) => renderCalCard(item, pgCopy * perPage + i, true))}
            </div>
          </div>
        ),
      });
    }

    // Slide final — encerramento + próximos passos
    const clienteNome = auditData?.cliente?.perfil?.full_name || auditData?.cliente?.perfil?.username || 'Cliente';
    const clienteHandle = auditData?.cliente?.perfil?.username ? `@${auditData.cliente.perfil.username}` : '';
    all.push({ id: 'dt-encerramento', section: 'diretrizes_tecnicas', render: () => (
      <div style={{ width: '100%', height: '100%', background: C.secondary, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Barra superior laranja */}
        <div style={{ height: f(6), background: `linear-gradient(90deg, ${C.primary}, ${C.yellow})`, flexShrink: 0 }} />
        <div style={{ flex: 1, display: 'flex', flexDirection: isP ? 'column' : 'row', overflow: 'hidden' }}>
          {/* Lado esquerdo — mensagem */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: isP ? `${f(40)}px ${f(40)}px ${f(24)}px` : `${f(48)}px ${f(72)}px` }}>
            <div style={{ fontFamily: 'Roboto', fontSize: f(12), color: 'rgba(255,255,255,0.3)', letterSpacing: 4, textTransform: 'uppercase', marginBottom: f(16) }}>Relatório Concluído</div>
            <div style={{ fontFamily: 'Playfair Display, Georgia, serif', fontWeight: 900, fontSize: isP ? f(28) : 54, color: C.white, lineHeight: 1.1, textTransform: 'uppercase' }}>
              {clienteNome.split(' ')[0]},<br />
              <span style={{ color: C.primary }}>está pronta</span><br />
              para decolar! 🚀
            </div>
            <div style={{ marginTop: f(28), fontFamily: 'Roboto', fontSize: f(14), color: 'rgba(255,255,255,0.7)', lineHeight: 1.7, maxWidth: 540 }}>
              Esse plano foi construído especialmente para{' '}
              <strong style={{ color: C.white }}>{clienteHandle || clienteNome}</strong>.
              Cada estratégia foi pensada para acelerar seu crescimento no Instagram com consistência e autenticidade.
            </div>
          </div>
          {/* Lado direito — CTAs */}
          <div style={{ width: isP ? '100%' : '42%', flexShrink: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: f(20), padding: isP ? `${f(24)}px ${f(40)}px ${f(48)}px` : `${f(48)}px ${f(56)}px ${f(48)}px ${f(40)}px` }}>
            {/* WhatsApp */}
            <div style={{ borderRadius: f(16), padding: `${f(24)}px ${f(28)}px`, background: 'rgba(37,211,102,0.08)', border: '1px solid rgba(37,211,102,0.25)', display: 'flex', gap: f(18), alignItems: 'flex-start' }}>
              <div style={{ width: f(44), height: f(44), borderRadius: '50%', background: '#25D366', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <svg width={f(24)} height={f(24)} viewBox="0 0 24 24" fill="white">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
                  <path d="M12 0C5.373 0 0 5.373 0 12c0 2.025.507 3.933 1.395 5.608L0 24l6.562-1.378A11.945 11.945 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.818a9.818 9.818 0 01-5.001-1.366l-.36-.214-3.713.78.793-3.623-.235-.373A9.818 9.818 0 1112 21.818z"/>
                </svg>
              </div>
              <div>
                <div style={{ fontFamily: 'Playfair Display, Georgia, serif', fontWeight: 700, fontSize: f(14), color: '#25D366', marginBottom: f(6) }}>Dúvidas? Novos insights?</div>
                <div style={{ fontFamily: 'Roboto', fontSize: f(12), color: 'rgba(255,255,255,0.7)', lineHeight: 1.6 }}>
                  Me chama no WhatsApp! Estou aqui para responder perguntas, ajustar estratégias e trazer novos insights sempre que precisar.
                </div>
              </div>
            </div>
            {/* Próximo relatório */}
            <div style={{ borderRadius: f(16), padding: `${f(24)}px ${f(28)}px`, background: `rgba(255,102,0,0.08)`, border: `1px solid rgba(255,102,0,0.25)`, display: 'flex', gap: f(18), alignItems: 'flex-start' }}>
              <div style={{ width: f(44), height: f(44), borderRadius: '50%', background: C.primary, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontFamily: 'Playfair Display, Georgia, serif', fontWeight: 900, fontSize: f(18), color: C.white }}>7</div>
              <div>
                <div style={{ fontFamily: 'Playfair Display, Georgia, serif', fontWeight: 700, fontSize: f(14), color: C.primary, marginBottom: f(6) }}>Próximo relatório em 7 dias</div>
                <div style={{ fontFamily: 'Roboto', fontSize: f(12), color: 'rgba(255,255,255,0.7)', lineHeight: 1.6 }}>
                  Em uma semana teremos um novo relatório de acompanhamento para analisar a execução do plano, medir a evolução e ajustar o que for necessário.
                </div>
              </div>
            </div>
            <div style={{ textAlign: 'center', fontFamily: 'Roboto', fontSize: f(11), color: 'rgba(255,255,255,0.2)', letterSpacing: 2, textTransform: 'uppercase' }}>
              Radar Marketing · Powered by IA
            </div>
          </div>
        </div>
      </div>
    )});

  }

  return all;
}

// ─── Scale helper ─────────────────────────────────────────────────────────────
function ScaleManager({ isLandscape, W, H }: { isLandscape: boolean; W: number; H: number }) {
  useEffect(() => {
    function update() {
      const el = document.getElementById('slide-inner');
      if (!el) return;
      const parent = el.parentElement;
      if (!parent) return;
      const scale = Math.min(parent.clientWidth / W, parent.clientHeight / H);
      el.style.transform      = `scale(${scale})`;
      el.style.transformOrigin = 'top left';
    }
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, [isLandscape, W, H]);
  return null;
}

// ─── App ──────────────────────────────────────────────────────────────────────
export default function App() {
  const validSections: Section[] = ['all', 'overview_cliente', 'diretrizes_tecnicas'];
  const injectedSection = window.__SECTION__ as Section;
  const initialSection: Section = validSections.includes(injectedSection) ? injectedSection : 'all';

  const [section,     setSection]     = useState<Section>(initialSection);
  const [orientation, setOrientation] = useState<Orientation>('landscape');
  const [current,     setCurrent]     = useState(0);

  const isLandscape = orientation === 'landscape';
  const isPortrait  = !isLandscape;
  // both orientations double body fonts; titles stay raw (never go through f)
  const f: Fscale   = (n) => Math.round(n * 2);

  const W = isLandscape ? 1920 : 1080;
  const H = isLandscape ? 1080 : 1920;

  const slides = buildSlides(section, f, isPortrait);
  const total  = slides.length;
  const slide  = slides[current];

  const prev = useCallback(() => setCurrent((c) => Math.max(0, c - 1)),          []);
  const next = useCallback(() => setCurrent((c) => Math.min(total - 1, c + 1)), [total]);

  useEffect(() => { setCurrent(0); }, [section]);
  useEffect(() => { setCurrent(0); }, [orientation]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next();
      if (e.key === 'ArrowLeft'  || e.key === 'ArrowUp')   prev();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [next, prev]);

  // Inject/update print CSS whenever orientation changes
  useEffect(() => {
    let el = document.getElementById('__pdf_css__') as HTMLStyleElement | null;
    if (!el) {
      el = document.createElement('style');
      el.id = '__pdf_css__';
      document.head.appendChild(el);
    }
    // Usa dimensões nativas do slide (sem scale) para evitar barra preta no PDF.
    // @page size em px garante que cada slide ocupe uma página exata.
    el.textContent = `
      @media print {
        @page { size: ${W}px ${H}px; margin: 0; }
        #__screen_ui__ { display: none !important; }
        #__print_pages__ { display: block !important; }
        .pp { width: ${W}px; height: ${H}px; overflow: hidden; break-after: page; page-break-after: always; position: relative; }
        .ppi { width: ${W}px; height: ${H}px; transform: none; }
      }
      #__print_pages__ { display: none; }
    `;
  }, [isLandscape, W, H]);

  const sectionColor = slide?.section === 'overview_cliente' ? C.primary : C.green;
  const sectionLabel = slide?.section === 'overview_cliente' ? 'OVERVIEW CLIENTE' : 'DIRETRIZES TÉCNICAS';

  const navBtn = (label: string, onClick: () => void, active: boolean, activeColor: string, disabled?: boolean) => (
    <button onClick={onClick} disabled={disabled}
      style={{ padding: '5px 14px', borderRadius: 6, border: 'none', cursor: disabled ? 'not-allowed' : 'pointer', fontFamily: 'Playfair Display, Georgia, serif', fontWeight: 700, fontSize: 12, background: active ? activeColor : 'rgba(255,255,255,0.06)', color: active ? C.white : disabled ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.55)', transition: 'all 0.2s' }}>
      {label}
    </button>
  );

  return (
    <>
    <div id="__screen_ui__" style={{ minHeight: '100vh', background: '#0d0d0d', display: 'flex', flexDirection: 'column' }}>
      {/* NAV */}
      <div style={{ background: '#0a0a0a', borderBottom: '1px solid rgba(255,255,255,0.07)', padding: '10px 20px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ fontFamily: 'Playfair Display, Georgia, serif', fontWeight: 900, fontSize: 14, color: C.primary, letterSpacing: 2 }}>RADAR</div>
        <div style={{ width: 1, height: 20, background: 'rgba(255,255,255,0.08)' }} />
        <div style={{ display: 'flex', gap: 4 }}>
          {([['all','Tudo'], ['overview_cliente','Cliente'], ['diretrizes_tecnicas','Técnicas']] as [Section, string][]).map(([val, label]) =>
            navBtn(label, () => setSection(val), section === val, C.primary)
          )}
        </div>
        <div style={{ width: 1, height: 20, background: 'rgba(255,255,255,0.08)' }} />
        <div style={{ fontFamily: 'Playfair Display, Georgia, serif', fontWeight: 700, fontSize: 13, color: 'rgba(255,255,255,0.4)' }}>
          <span style={{ color: C.white }}>{current + 1}</span> / {total}
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          {navBtn('◀', prev, false, C.primary, current === 0)}
          {navBtn('▶', next, false, C.primary, current === total - 1)}
        </div>
        <div style={{ width: 1, height: 20, background: 'rgba(255,255,255,0.08)' }} />
        <div style={{ display: 'flex', gap: 4 }}>
          {navBtn('16:9', () => setOrientation('landscape'), !isPortrait, C.green)}
          {navBtn('9:16', () => setOrientation('portrait'),   isPortrait,  C.green)}
        </div>
        <div style={{ width: 1, height: 20, background: 'rgba(255,255,255,0.08)' }} />
        {navBtn('📄 PDF', () => window.print(), false, C.yellow)}
        <div style={{ marginLeft: 'auto', fontFamily: 'Roboto', fontSize: 12, color: sectionColor, fontWeight: 700 }}>{sectionLabel}</div>
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', maxWidth: 280 }}>
          {slides.map((s, i) => (
            <button key={s.id} onClick={() => setCurrent(i)} title={s.id}
              style={{ width: 8, height: 8, borderRadius: '50%', border: 'none', cursor: 'pointer', padding: 0, background: i === current ? (s.section === 'overview_cliente' ? C.primary : C.green) : 'rgba(255,255,255,0.12)', transition: 'all 0.2s' }} />
          ))}
        </div>
      </div>

      {/* VIEWPORT */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, overflow: 'hidden' }}>
        <div style={{ position: 'relative', width: isLandscape ? 'min(90vw, calc(85vh * 16 / 9))' : 'min(50vw, calc(85vh * 9 / 16))' }}>
          <div style={{ paddingTop: `${(H / W) * 100}%`, position: 'relative' }}>
            <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', borderRadius: 12, boxShadow: '0 32px 80px rgba(0,0,0,0.7)' }}>
              <div id="slide-inner" style={{ width: W, height: H }}>
                {slide?.render()}
              </div>
            </div>
          </div>
        </div>
      </div>
      <ScaleManager isLandscape={isLandscape} W={W} H={H} />

      <div style={{ padding: '8px 24px', textAlign: 'center', fontFamily: 'Roboto', fontSize: 11, color: 'rgba(255,255,255,0.18)' }}>
        ← → Navegar por teclado · Clique nos pontos para ir ao slide
      </div>
    </div>
    <div id="__print_pages__">
      {slides.map((s) => (
        <div key={s.id} className="pp">
          <div className="ppi">{s.renderPrint ? s.renderPrint() : s.render()}</div>
        </div>
      ))}
    </div>
    </>
  );
}
