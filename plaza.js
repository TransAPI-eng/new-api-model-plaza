/*!
 * new-api-model-plaza v0.1.0 — 给 new-api / one-api 站点换一个好看的模型广场 · MIT License
 * https://github.com/TransAPI-eng/new-api-model-plaza · 由 Trans86.com 开发维护
 * 只读取站点公开接口，不改后端、不碰数据库；Shadow DOM 隔离，样式不污染原站。
 *
 * 用法（站长只需两行）：
 *   <model-plaza></model-plaza>
 *   <script src="plaza.js"></script>
 *
 * 读取的接口（都可用属性改地址）：
 *   api       /api/pricing                          价格、分组、倍率、动态计费表达式
 *   status    /api/status                           显示币种、汇率、充值价格（price）
 *   perf      /api/perf-metrics/summary?hours=24    成功率、延迟、吞吐（没有就不显示）
 *   official  official.json（和 plaza.js 同目录）     官方价 + 当日 USD→CNY 汇率，每日构建
 * 可选覆盖：
 *   currency  USD | CNY       显示币种（默认跟随站点设置）
 *   rate      显示汇率         （默认跟随站点 usd_exchange_rate）
 *   topup     充值价格：实付多少元买 1 美元额度（默认跟随站点 price）
 *   fx        官方价换算汇率   （默认 official.json 里的当日汇率）
 *   labels    渠道标签覆盖 JSON：{ "分组名": { "title", "desc", "tags": [] } }
 *   view      channel | model
 */
(() => {
  'use strict'

  const VERSION = '0.1.0'
  const SCRIPT_SRC = document.currentScript && document.currentScript.src

  // ---------------------------------------------------------------------------
  // 数据整理：厂商 → 渠道 → 模型
  // ---------------------------------------------------------------------------

  const VENDOR_STYLE = {
    anthropic: { hue: 24, sat: 1 },
    openai: { hue: 162, sat: 0.55 },
    google: { hue: 222, sat: 0.75 },
    xai: { hue: 32, sat: 0.18 },
    deepseek: { hue: 204, sat: 0.7 },
    '智谱': { hue: 214, sat: 0.7 },
    '阿里巴巴': { hue: 252, sat: 0.6 },
    '通义千问': { hue: 252, sat: 0.6 },
    moonshot: { hue: 280, sat: 0.35 },
    minimax: { hue: 340, sat: 0.5 },
    mistral: { hue: 14, sat: 0.8 },
    meta: { hue: 212, sat: 0.6 }
  }

  const GUESS = [
    [/claude|anthropic/i, 'Anthropic'],
    [/^(gpt|o\d|chatgpt|dall-e|whisper|tts|text-embedding|davinci|babbage|codex|sora)/i, 'OpenAI'],
    [/gemini|gemma|imagen|veo/i, 'Google'],
    [/grok/i, 'xAI'],
    [/deepseek/i, 'DeepSeek'],
    [/qwen|qwq/i, '通义千问'],
    [/glm|chatglm|cogview/i, '智谱'],
    [/kimi|moonshot/i, 'Moonshot'],
    [/minimax|abab/i, 'MiniMax'],
    [/mistral|mixtral|codestral/i, 'Mistral'],
    [/llama/i, 'Meta'],
    [/doubao/i, '字节跳动']
  ]

  const TAGS = [
    [/0\s*注入|零注入/, '零注入'],
    [/满血/, '满血'],
    [/高缓|缓存/, '高缓存'],
    [/蒸馏/, '可蒸馏'],
    [/不限.{0,3}客户端|不限制客户端/, '不限客户端'],
    [/企业/, '企业级'],
    [/稳定/, '稳定'],
    [/高并发/, '高并发'],
    [/官\s*key|官方/, '官方 Key'],
    [/aws|bedrock/i, 'AWS Bedrock'],
    [/\baz\b|azure/i, 'Azure'],
    [/逆向/, '逆向'],
    [/特价|便宜|低价|性价比/, '特价'],
    [/备用/, '备用'],
    [/画图|绘图|生图/, '绘图'],
    [/pro/i, 'Pro 号池'],
    [/max/i, 'Max 号池']
  ]

  const key = (s) => String(s || '').trim().toLowerCase()

  function vendorStyle(name) {
    const s = VENDOR_STYLE[key(name)]
    if (s) return s
    let h = 0
    for (const ch of String(name)) h = (h * 31 + ch.codePointAt(0)) >>> 0
    return { hue: h % 360, sat: 0.45 }
  }

  function guessVendor(model) {
    for (const [re, name] of GUESS) if (re.test(model)) return name
    return '其他'
  }

  /**
   * new-api 动态计费表达式，例如
   *   tier("standard", p * 10 + cr * 1 + cc * 12.5 + cc1h * 20 + c * 50)
   *   len <= 272000 ? tier("≤272K", p * 4 + c * 20) : tier(">272K", p * 8 + c * 30)
   *   tier("base", fixed(0.04))
   * 系数都是「美元额度 / 1M tokens」，fixed 是每次调用。
   */
  function parseExpr(expr) {
    if (!expr) return null
    const tiers = []
    let pos = 0
    while ((pos = expr.indexOf('tier(', pos)) !== -1) {
      const head = /^tier\(\s*"([^"]*)"\s*,/.exec(expr.slice(pos))
      if (!head) break
      let i = pos + head[0].length
      let depth = 1
      const start = i
      for (; i < expr.length && depth; i++) {
        if (expr[i] === '(') depth++
        else if (expr[i] === ')') depth--
      }
      const body = expr.slice(start, i - 1)
      const t = { label: head[1], ok: true }
      for (const raw of body.split('+')) {
        const term = raw.trim()
        let m
        if ((m = /^([a-z]\w*)\s*\*\s*([\d.]+(?:e-?\d+)?)$/i.exec(term))) t[m[1]] = +m[2]
        else if ((m = /^([\d.]+(?:e-?\d+)?)\s*\*\s*([a-z]\w*)$/i.exec(term))) t[m[2]] = +m[1]
        else if ((m = /^fixed\(\s*([\d.]+)\s*\)$/.exec(term))) t.fixed = +m[1]
        else t.ok = false
      }
      tiers.push(t)
      pos = i
    }
    const cond = /^\s*len\s*<=\s*(\d+)\s*\?/.exec(expr)
    if (cond && tiers[0]) tiers[0].maxLen = +cond[1]
    return tiers.length && tiers[0].ok ? tiers : null
  }

  // 每个模型的基础价（美元额度，未乘分组倍率）
  function basePrice(m) {
    const tiers = m.billing_mode === 'tiered_expr' ? parseExpr(m.billing_expr) : null
    if (tiers) {
      const t = tiers[0]
      if (t.fixed != null && t.p == null) return { dynamic: true, perCall: t.fixed, tiers }
      return {
        dynamic: true,
        input: t.p ?? 0,
        output: t.c ?? 0,
        cache: t.cr ?? null,
        cacheWrite: t.cc ?? null,
        tiers
      }
    }
    if (m.quota_type === 1) return { perCall: +m.model_price || 0 }
    // new-api：倍率 1 = $2 / 1M tokens
    const input = (+m.model_ratio || 0) * 2
    return {
      input,
      output: input * (m.completion_ratio == null ? 1 : +m.completion_ratio),
      cache: m.cache_ratio == null ? null : input * m.cache_ratio,
      cacheWrite: m.create_cache_ratio == null ? null : input * m.create_cache_ratio
    }
  }

  function scale(b, g) {
    if (b.perCall != null) return { perCall: b.perCall * g }
    return {
      input: b.input * g,
      output: b.output * g,
      cache: b.cache == null ? null : b.cache * g,
      cacheWrite: b.cacheWrite == null ? null : b.cacheWrite * g
    }
  }

  const unit = (m, g) => (m.base.perCall != null ? Infinity : m.base.input * g)

  function normalize(raw, labels = {}) {
    const vendorNames = new Map((raw.vendors || []).map((v) => [v.id, v.name]))
    const groupRatio = raw.group_ratio || {}
    const groupDesc = raw.usable_group || {}
    const vendors = new Map()

    for (const m of raw.data || []) {
      const vname = vendorNames.get(m.vendor_id) || guessVendor(m.model_name)
      if (!vendors.has(vname)) vendors.set(vname, { name: vname, ...vendorStyle(vname), models: [], channels: new Map() })
      const v = vendors.get(vname)
      const groups = (m.enable_groups && m.enable_groups.length ? m.enable_groups : ['default']).filter((g) => g !== 'auto')
      const model = {
        name: m.model_name,
        vendor: vname,
        base: basePrice(m),
        endpoints: m.supported_endpoint_types || [],
        groups
      }
      v.models.push(model)
      for (const g of groups) {
        if (!v.channels.has(g)) {
          const label = labels[g] || {}
          const desc = label.desc ?? (groupDesc[g] && groupDesc[g] !== g ? groupDesc[g] : '')
          const tags = label.tags || TAGS.filter(([re]) => re.test(g + ' ' + desc)).map(([, t]) => t)
          v.channels.set(g, {
            id: g,
            title: label.title || g,
            desc,
            tags: [...new Set(tags)].slice(0, 4),
            ratio: groupRatio[g] == null ? 1 : +groupRatio[g],
            models: []
          })
        }
        v.channels.get(g).models.push(model)
      }
    }

    const list = [...vendors.values()].map((v) => {
      const channels = [...v.channels.values()]
      for (const c of channels) {
        c.models.sort((a, b) => unit(a, c.ratio) - unit(b, c.ratio))
        c.from = Math.min(...c.models.map((m) => unit(m, c.ratio)))
      }
      for (const m of v.models) {
        m.channels = channels.filter((c) => m.groups.includes(c.id))
        m.minRatio = Math.min(...m.channels.map((c) => c.ratio))
      }
      return { ...v, channels, from: Math.min(...channels.map((c) => c.from)) }
    })
    list.sort((a, b) => b.models.length - a.models.length)
    // 按大小交替排到两侧：… 3 1 2 4 …，最大的在正中
    const ring = []
    list.forEach((v, i) => (i % 2 ? ring.push(v) : ring.unshift(v)))
    return ring
  }

  // 官方价匹配：只做确定的变换，匹配不上就不显示折扣
  function officialFor(table, name) {
    if (!table) return null
    const n = key(name)
    const noDate = n.replace(/-\d{8}$/, '').replace(/-\d{4}-\d{2}-\d{2}$/, '')
    const noEffort = noDate.replace(/-(xhigh|high|medium|low|minimal|thinking)$/, '')
    for (const c of [n, noDate, noEffort, noEffort + '-preview', noEffort.replace(/\./g, '-')]) {
      if (table[c]) return { id: c, input: table[c][0], output: table[c][1], cache: table[c][2], cacheWrite: table[c][3] }
    }
    return null
  }

  // 性能数据两种格式：recent_success_series [{ts, success_rate}] 或 recent_success_rates [n]
  function normalizePerf(raw) {
    const map = new Map()
    const d = raw && (raw.data || raw)
    for (const m of (d && d.models) || []) {
      const series = (m.recent_success_series || []).map((x) => x.success_rate)
      map.set(m.model_name, {
        success: m.success_rate,
        latency: m.avg_latency_ms,
        tps: m.avg_tps,
        series: series.length ? series : m.recent_success_rates || []
      })
    }
    return map
  }

  // ---------------------------------------------------------------------------
  // 淡风景画（和 trans86 首页同一套思路）
  // ---------------------------------------------------------------------------

  function mulberry32(seed) {
    let a = seed >>> 0
    return () => {
      a = (a + 0x6d2b79f5) >>> 0
      let t = a
      t = Math.imul(t ^ (t >>> 15), t | 1)
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
  }
  const hsl = (h, s, l) =>
    `hsl(${(((h % 360) + 360) % 360).toFixed(1)} ${Math.max(0, Math.min(100, s)).toFixed(1)}% ${Math.max(0, Math.min(100, l)).toFixed(1)}%)`
  const accent = (hue, sat = 1, l = 72) => hsl(hue - 2, 62 * sat, l)

  let uid = 0
  function landscape(hue, sat, seed) {
    const r = mulberry32(seed)
    const W = 300
    const H = 450
    const id = `ls${++uid}`
    const smooth = r() > 0.45
    const sunX = 70 + r() * 160
    const sunY = 150 + r() * 70
    const layers = []
    const N = 4
    for (let i = 0; i < N; i++) {
      const t = i / (N - 1)
      const base = 250 + t * 120 + r() * 14
      const amp = (smooth ? 34 : 70) * (1 - t * 0.55)
      const step = smooth ? 50 : 26
      let d = `M0 ${H} L0 ${base}`
      let prev = [0, base]
      for (let x = step; x <= W + step; x += step) {
        const y = base - amp * (0.25 + r() * 0.75) * (Math.sin(x / 60 + i * 2 + r()) * 0.5 + 0.6)
        d += smooth ? ` Q${prev[0] + step / 2} ${prev[1]} ${x} ${y}` : ` L${x} ${y}`
        prev = [x, y]
      }
      d += ` L${W + step} ${H} Z`
      layers.push(
        `<linearGradient id="${id}l${i}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${hsl(hue - t * 8, (26 + t * 10) * sat, 72 - t * 42)}"/><stop offset="1" stop-color="${hsl(hue - t * 10, (22 + t * 8) * sat, 62 - t * 40)}"/></linearGradient>` +
          `<path d="${d}" fill="url(#${id}l${i})"/>` +
          (i < N - 1 ? `<rect x="0" y="${base - 6}" width="${W}" height="60" fill="url(#${id}m)" opacity="${0.5 - t * 0.2}"/>` : '')
      )
    }
    return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <linearGradient id="${id}s" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="${hsl(hue + 16, 32 * sat, 90)}"/>
          <stop offset=".55" stop-color="${hsl(hue + 4, 46 * sat, 84)}"/>
          <stop offset="1" stop-color="${accent(hue, sat, 74)}"/>
        </linearGradient>
        <radialGradient id="${id}g"><stop offset="0" stop-color="${hsl(hue + 12, 90 * sat, 96)}" stop-opacity=".9"/><stop offset="1" stop-color="${hsl(hue + 12, 90 * sat, 90)}" stop-opacity="0"/></radialGradient>
        <linearGradient id="${id}m" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="${hsl(hue, 40 * sat, 94)}"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
      </defs>
      <rect width="${W}" height="${H}" fill="url(#${id}s)"/>
      <circle cx="${sunX}" cy="${sunY}" r="90" fill="url(#${id}g)"/>
      <circle cx="${sunX}" cy="${sunY}" r="${16 + r() * 8}" fill="${hsl(hue + 14, 85 * sat, 95)}"/>
      ${layers.join('')}
    </svg>`
  }

  // ---------------------------------------------------------------------------
  // 组件
  // ---------------------------------------------------------------------------

  const esc = (s) =>
    String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])

  function num(v) {
    if (v == null || !isFinite(v)) return '—'
    if (v === 0) return '0'
    if (v < 0.01) return String(+v.toPrecision(2))
    if (v < 10) return v.toFixed(3).replace(/\.?0+$/, '')
    return v.toFixed(2).replace(/\.?0+$/, '')
  }

  // 搜索归一化：小写、字母数字之间断开、去掉 . - _ 空格
  const segs = (s) =>
    ' ' +
    String(s)
      .toLowerCase()
      .replace(/([a-z])(\d)/g, '$1 $2')
      .replace(/(\d)([a-z])/g, '$1 $2')
      .replace(/[^a-z0-9一-鿿]+/g, ' ')
      .trim() +
    ' '
  const compact = (s) => String(s).toLowerCase().replace(/[^a-z0-9一-鿿]+/g, '')

  const pct = (d) => (d * 100).toFixed(1).replace(/\.0$/, '') + '%'

  function statusColor(s) {
    if (s == null || !isFinite(s)) return 'var(--chip)'
    if (s >= 99) return 'hsl(152 55% 44%)'
    if (s >= 95) return 'hsl(110 45% 50%)'
    if (s >= 80) return 'hsl(36 88% 55%)'
    return 'hsl(6 70% 56%)'
  }

  const CSS = `
  :host{--bg:#f7f1ea;--ink:#2a1d14;--ink2:rgba(42,29,20,.62);--ink3:rgba(42,29,20,.4);--line:rgba(42,29,20,.14);--line-strong:rgba(42,29,20,.22);--leaf:#fdf8f2;--card:rgba(255,252,248,.78);--card-solid:#fffcf8;--chip:rgba(42,29,20,.07);--save:hsl(152 48% 34%);--save-bg:hsl(152 45% 42% / .12);--dear:hsl(6 62% 46%);--dear-bg:hsl(6 70% 56% / .12);--serif:"Noto Serif SC","Source Han Serif SC","Songti SC","STSong",Georgia,serif;--mono:"JetBrains Mono","SFMono-Regular",Consolas,monospace;--glow:hsl(22 62% 76%);
    display:block;position:relative;color:var(--ink);background:var(--bg);font-family:var(--serif);font-weight:400;line-height:1.5;overflow:hidden;isolation:isolate;-webkit-font-smoothing:antialiased}
  @media (prefers-color-scheme:dark){:host(:not([theme=light])){--bg:#17110d;--ink:#f4ebe2;--ink2:rgba(244,235,226,.66);--ink3:rgba(244,235,226,.4);--line:rgba(244,235,226,.14);--line-strong:rgba(244,235,226,.24);--leaf:#1f1712;--card:rgba(38,29,23,.78);--card-solid:#241b15;--chip:rgba(244,235,226,.08);--save:hsl(152 50% 62%);--dear:hsl(6 75% 70%)}}
  :host([theme=dark]){--bg:#17110d;--ink:#f4ebe2;--ink2:rgba(244,235,226,.66);--ink3:rgba(244,235,226,.4);--line:rgba(244,235,226,.14);--line-strong:rgba(244,235,226,.24);--leaf:#1f1712;--card:rgba(38,29,23,.78);--card-solid:#241b15;--chip:rgba(244,235,226,.08);--save:hsl(152 50% 62%);--dear:hsl(6 75% 70%)}
  *{box-sizing:border-box}
  button{font:inherit;color:inherit;background:none;border:0;cursor:pointer;padding:0}
  .glow{position:absolute;inset:-10% -10% auto;height:900px;z-index:-1;background:radial-gradient(60% 50% at 50% 38%,var(--glow),transparent 70%);opacity:.55;transition:background .9s ease}
  .wrap{max-width:1180px;margin:0 auto;padding:56px 16px 80px}
  .eyebrow{font-family:var(--mono);font-size:11px;letter-spacing:.22em;text-transform:uppercase;color:var(--ink3);text-align:center;margin:0}
  h2{font-size:clamp(28px,4.4vw,44px);font-weight:400;text-align:center;margin:10px 0 6px;letter-spacing:.01em}
  .sub{text-align:center;color:var(--ink2);font-size:14px;margin:0}
  .toolbar{display:flex;flex-wrap:wrap;gap:10px;justify-content:center;align-items:center;margin:22px 0 0}
  .seg{display:inline-flex;padding:3px;border-radius:999px;background:var(--chip)}
  .seg button{padding:6px 14px;border-radius:999px;font-size:13px;color:var(--ink2)}
  .seg button[aria-pressed=true]{background:var(--card-solid);color:var(--ink);box-shadow:0 1px 3px rgba(40,24,12,.12)}
  .search{height:34px;width:220px;max-width:100%;border-radius:999px;border:1px solid var(--line);background:var(--card);padding:0 14px;font:inherit;font-size:13px;color:var(--ink);outline:none}
  .search:focus{border-color:var(--ink3)}

  /* ---------- 第一层：厂商扇形卡片 ---------- */
  .fan{position:relative;height:360px;margin:34px auto 0;perspective:1400px;touch-action:pan-y;user-select:none;outline:none}
  .vc{position:absolute;left:50%;top:10px;width:212px;height:304px;margin-left:-106px;border-radius:18px;overflow:hidden;color:#fff;text-align:left;
    box-shadow:0 1px 2px rgba(40,24,12,.08),0 34px 60px -32px rgba(40,24,12,.6);transition:transform .7s cubic-bezier(.2,.8,.2,1),opacity .5s ease,filter .5s ease;will-change:transform}
  .vc svg{position:absolute;inset:0;width:100%;height:100%}
  .vc::after{content:"";position:absolute;inset:0;background:linear-gradient(to top,rgba(22,13,8,.66),rgba(22,13,8,.36) 30%,rgba(22,13,8,0) 58%),linear-gradient(to bottom,rgba(255,250,244,.3),rgba(255,250,244,0) 22%);pointer-events:none}
  .vc .rim{position:absolute;inset:0;border-radius:inherit;box-shadow:inset 0 0 0 1px rgba(255,255,255,.35);z-index:2;pointer-events:none}
  .vc .top{position:absolute;z-index:1;inset:16px 16px auto;display:flex;justify-content:space-between;color:rgba(34,22,13,.8);font-size:13px}
  .vc .top .mono{font-family:var(--mono);font-size:10px;letter-spacing:.16em;color:rgba(34,22,13,.5);padding-top:2px}
  .vc .body{position:absolute;z-index:1;inset:auto 16px 16px;text-shadow:0 1px 12px rgba(20,12,6,.35)}
  .vc .name{font-size:28px;line-height:1.15;display:block}
  .vc .meta{font-family:var(--mono);font-size:10px;letter-spacing:.14em;color:rgba(255,255,255,.72);margin-top:6px;text-transform:uppercase;display:block}
  .vc .from{margin-top:12px;padding-top:10px;border-top:1px solid rgba(255,255,255,.24);font-size:13px;display:flex;justify-content:space-between;align-items:center}
  .vc .from b{font-weight:400;font-variant-numeric:tabular-nums}
  .vc .go{width:24px;height:24px;border-radius:50%;background:rgba(255,255,255,.9);color:#2a1d14;display:grid;place-items:center;font-size:12px}
  .vc.dim{filter:saturate(.75) brightness(.96)}
  .ruler{display:flex;justify-content:center;align-items:center;gap:14px;margin-top:4px;font-family:var(--mono);font-size:11px;letter-spacing:.16em;color:var(--ink2);text-transform:uppercase}
  .ticks{display:flex;gap:9px;align-items:center}
  .ticks button{width:1px;height:10px;background:var(--ink3);border-radius:1px;transition:height .3s,background .3s}
  .ticks button[aria-current=true]{height:20px;width:2px;background:var(--ink)}
  .ticks button::before{content:"";display:block;margin:-6px -5px;height:22px}

  /* ---------- 第二、三层：树 ---------- */
  .branch-head{display:flex;align-items:baseline;gap:12px;margin:56px 0 4px;padding-left:4px}
  .branch-head .dot{width:12px;height:12px;border-radius:50%;background:var(--glow);box-shadow:0 0 0 4px color-mix(in srgb,var(--glow) 30%,transparent);flex:none;transform:translateY(-2px)}
  .branch-head h3{margin:0;font-size:24px;font-weight:400}
  .branch-head span{color:var(--ink2);font-size:14px;font-family:var(--mono);letter-spacing:.06em}
  .sort{margin-left:auto;display:flex;gap:8px;align-items:center;flex-wrap:wrap}
  .fbtn{display:inline-flex;align-items:center;gap:6px;height:34px;padding:0 14px;border-radius:999px;background:var(--chip);font-size:13px;color:var(--ink2)}
  .fbtn svg{width:15px;height:15px}
  .fbtn:hover,.fbtn[aria-expanded=true]{color:var(--ink)}
  .fbtn.on{background:var(--ink);color:var(--bg)}
  .fpanel{display:flex;flex-wrap:wrap;gap:8px;margin:12px 0 8px 9px;padding:14px;border-radius:14px;background:var(--card);border:1px solid var(--line);backdrop-filter:blur(8px)}
  .fchip{display:inline-flex;align-items:center;gap:7px;padding:6px 12px 6px 8px;border-radius:999px;border:1px solid var(--line);background:var(--card-solid);font-size:13px;transition:border-color .15s,background .15s}
  .fchip:hover{border-color:var(--ink3)}
  .fchip .box{width:16px;height:16px;border-radius:5px;border:1.5px solid var(--ink3);display:grid;place-items:center;font-size:11px;line-height:1;color:var(--bg)}
  .fchip[aria-pressed=true]{border-color:color-mix(in srgb,var(--glow) 70%,var(--ink) 25%);background:color-mix(in srgb,var(--glow) 22%,var(--card-solid))}
  .fchip[aria-pressed=true] .box{background:var(--ink);border-color:var(--ink)}
  .fclear{font-size:13px;color:var(--ink3);text-decoration:underline;text-underline-offset:3px;padding:6px 8px}
  .fclear:hover{color:var(--ink)}
  ul.tree{list-style:none;margin:0;padding:0 0 0 9px}
  ul.tree ul.tree{padding-left:0;margin:4px 0 6px 18px}
  .tree>li{position:relative;padding:8px 0 8px 30px}
  .tree>li::before{content:"";position:absolute;left:0;top:0;bottom:0;border-left:1.5px solid var(--line)}
  .tree>li:last-child::before{bottom:auto;height:34px}
  .tree>li::after{content:"";position:absolute;left:0;top:20px;width:24px;height:14px;border:1.5px solid var(--line);border-top:0;border-right:0;border-bottom-left-radius:12px;transform:translateY(-14px)}
  .tree>li.open::before,.tree>li.open::after{border-color:color-mix(in srgb,var(--glow) 80%,var(--ink) 20%)}

  .ch{position:relative;width:100%;display:grid;grid-template-columns:minmax(0,1fr) auto;gap:4px 18px;align-items:center;text-align:left;padding:14px 18px 14px 21px;border-radius:14px;background:var(--card-solid);border:1px solid var(--line-strong);
    box-shadow:inset 0 1px 0 rgba(255,255,255,.55),0 1px 2px rgba(40,24,12,.06),0 10px 24px -18px rgba(40,24,12,.45);transition:border-color .2s,transform .2s,box-shadow .2s}
  .ch::before{content:"";position:absolute;left:-1px;top:-1px;bottom:-1px;width:4px;border-radius:14px 0 0 14px;background:color-mix(in srgb,var(--glow) 55%,var(--line-strong))}
  .ch:hover{border-color:var(--ink3);transform:translateX(2px)}
  li.open>.ch{border-color:color-mix(in srgb,var(--glow) 65%,var(--ink) 30%);box-shadow:inset 0 1px 0 rgba(255,255,255,.55),0 0 0 3px color-mix(in srgb,var(--glow) 28%,transparent),0 20px 40px -26px rgba(40,24,12,.6)}
  li.open>.ch::before{background:color-mix(in srgb,var(--glow) 70%,var(--ink) 30%)}
  .ch .t{font-size:17px;display:flex;flex-wrap:wrap;align-items:center;gap:6px 10px;min-width:0}
  .ch .t strong{font-weight:400;overflow-wrap:anywhere}
  .ch .d{grid-column:1;color:var(--ink);opacity:.86;font-size:14px;font-weight:600;letter-spacing:.01em;overflow-wrap:anywhere}
  .ch .r{grid-row:1/span 2;grid-column:2;text-align:right;font-variant-numeric:tabular-nums}
  .ch .r .x{font-family:var(--mono);font-size:20px;letter-spacing:.02em}
  .ch .r .x small{font-size:12px;color:var(--ink3);margin-right:2px}
  .ch .r .f{font-size:12px;color:var(--ink2)}
  .tag{font-family:var(--mono);font-size:10px;letter-spacing:.08em;padding:2px 8px;border-radius:999px;background:var(--chip);color:var(--ink2);white-space:nowrap}
  .tag.hot{background:color-mix(in srgb,var(--glow) 45%,transparent);color:var(--ink)}
  .save{font-family:var(--mono);font-size:11px;letter-spacing:.02em;padding:2px 8px;border-radius:999px;background:var(--save-bg);color:var(--save);white-space:nowrap;font-variant-numeric:tabular-nums}
  .save.dear{background:var(--dear-bg);color:var(--dear)}
  .count{font-family:var(--mono);font-size:12px;color:var(--ink2);letter-spacing:.04em}

  /* ---------- 模型卡 ---------- */
  .models{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:12px;padding:6px 0 4px}
  .mc{position:relative;display:flex;flex-direction:column;padding:16px 18px 14px;border-radius:16px;background:var(--leaf);border:1px solid var(--line-strong);min-width:0;
    box-shadow:inset 0 1px 0 rgba(255,255,255,.5),0 1px 2px rgba(40,24,12,.06),0 14px 30px -22px rgba(40,24,12,.5);transition:border-color .2s,box-shadow .2s}
  .mc:hover{border-color:var(--ink3)}
  .mc.picked{border-color:var(--ink);box-shadow:0 0 0 3px color-mix(in srgb,var(--glow) 45%,transparent),0 14px 30px -22px rgba(40,24,12,.5)}
  .pick{flex:none;display:inline-flex;align-items:center;gap:5px;height:28px;padding:0 9px 0 6px;border-radius:8px;border:1px solid var(--line-strong);font-size:12px;color:var(--ink2);background:var(--card-solid)}
  .pick .box{width:15px;height:15px;border-radius:4px;border:1.5px solid var(--ink3);display:grid;place-items:center;font-size:10px;line-height:1;color:var(--bg)}
  .pick[aria-pressed=true]{border-color:var(--ink);color:var(--ink)}
  .pick[aria-pressed=true] .box{background:var(--ink);border-color:var(--ink)}
  .pick:hover{color:var(--ink);border-color:var(--ink3)}
  .mc .hd{display:flex;gap:10px;align-items:flex-start}
  .mc .n{flex:1;min-width:0;font-family:var(--mono);font-size:14px;font-weight:600;overflow-wrap:anywhere;line-height:1.4}
  .mc .v{display:block;font-family:var(--serif);font-weight:400;font-size:12px;color:var(--ink3);margin-top:1px}
  .copy{flex:none;width:28px;height:28px;border-radius:8px;display:grid;place-items:center;color:var(--ink3);border:1px solid transparent}
  .copy:hover{color:var(--ink);border-color:var(--line)}
  .copy svg{width:15px;height:15px}
  .mc .badges{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px;align-items:center}
  .bill{font-size:12px;color:hsl(36 80% 40%)}
  .bill.flat{color:var(--ink3)}
  .pg{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:4px 10px;margin-top:10px}
  .pg dt{font-size:12px;color:var(--ink3)}
  .pg dd{margin:0;font-family:var(--mono);font-size:15px;font-weight:600;font-variant-numeric:tabular-nums;white-space:nowrap}
  .pg dd small{font-weight:400;font-size:10.5px;color:var(--ink3);margin-left:2px}
  .pg>div{min-width:0}
  .off{margin-top:8px;font-size:11.5px;color:var(--ink3);font-variant-numeric:tabular-nums;line-height:1.6}
  .off s{text-decoration-color:var(--ink3)}
  .tiers{margin-top:4px;font-size:11.5px;color:var(--ink3);font-family:var(--mono)}
  .mc .ep{display:flex;gap:4px;flex-wrap:wrap}
  .mc .ep span{font-family:var(--mono);font-size:9.5px;letter-spacing:.06em;color:var(--ink3);border:1px solid var(--line);border-radius:4px;padding:0 5px}
  .perf{display:grid;grid-template-columns:minmax(0,1.6fr) auto auto;gap:4px 18px;align-items:end;margin-top:auto;padding-top:12px;border-top:1px solid var(--line)}
  .perf .k{font-size:12px;color:var(--ink3);display:flex;justify-content:space-between;gap:8px}
  .perf .k b{font-family:var(--mono);font-weight:400;color:var(--ink2)}
  .perf .val{font-family:var(--mono);font-size:13px;margin-top:3px;font-variant-numeric:tabular-nums}
  .bars{display:flex;gap:2px;height:16px;margin-top:5px}
  .bars i{flex:1;min-width:2px;max-width:8px;border-radius:2px}
  .perf-none{margin-top:auto;padding-top:12px;border-top:1px solid var(--line);font-size:12px;color:var(--ink3)}
  .spacer{height:10px}

  /* 按模型视图 */
  .cmp{display:grid;gap:6px;padding:4px 0}
  .cmp-row{display:grid;grid-template-columns:minmax(0,1.3fr) minmax(0,1fr) auto auto auto;gap:14px;align-items:center;padding:10px 14px;border-radius:10px;background:var(--leaf);border:1px solid var(--line-strong);font-size:13px}
  .cmp-row.picked{border-color:var(--ink)}

  /* ---------- 对比：底部托盘 + 对比表 ---------- */
  .tray{position:fixed;left:50%;bottom:20px;z-index:50;transform:translate(-50%,140%);display:flex;align-items:center;gap:12px;max-width:calc(100vw - 32px);padding:10px 10px 10px 18px;border-radius:999px;background:var(--ink);color:var(--bg);box-shadow:0 20px 50px -18px rgba(20,12,6,.6);transition:transform .35s cubic-bezier(.2,.8,.2,1);font-size:13px}
  .tray.show{transform:translate(-50%,0)}
  .tray .names{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;opacity:.7;font-family:var(--mono);font-size:11.5px;min-width:0}
  .tray button{flex:none;height:32px;padding:0 14px;border-radius:999px;font-size:13px}
  .tray .go-cmp{background:var(--bg);color:var(--ink)}
  .tray .go-cmp:disabled{opacity:.45;cursor:default}
  .tray .clr{color:var(--bg);opacity:.7}
  .dlg{position:fixed;inset:0;z-index:60;display:none;align-items:flex-end;justify-content:center;background:rgba(20,12,6,.42);backdrop-filter:blur(3px)}
  .dlg.show{display:flex}
  .sheet{width:min(1180px,100%);max-height:88vh;overflow:auto;background:var(--bg);border-radius:20px 20px 0 0;padding:22px 20px 28px;box-shadow:0 -20px 60px -20px rgba(20,12,6,.5)}
  .sheet-hd{display:flex;align-items:baseline;gap:12px;margin-bottom:14px}
  .sheet-hd h3{margin:0;font-size:22px;font-weight:400}
  .sheet-hd span{color:var(--ink3);font-size:12px}
  .sheet-hd .x{margin-left:auto;width:32px;height:32px;border-radius:50%;background:var(--chip);font-size:16px}
  .ctable{width:100%;border-collapse:separate;border-spacing:0;font-size:13px;min-width:560px}
  .ctable th,.ctable td{padding:10px 12px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top}
  .ctable thead th{position:sticky;top:-22px;background:var(--bg);z-index:1;font-weight:400}
  .ctable tbody th{color:var(--ink3);font-weight:400;white-space:nowrap;width:1%}
  .ctable td{font-family:var(--mono);font-variant-numeric:tabular-nums}
  .ctable td.best{background:var(--save-bg);color:var(--save)}
  .ctable .cn{font-family:var(--mono);font-size:13.5px;font-weight:600;overflow-wrap:anywhere}
  .ctable .cg{font-size:12px;color:var(--ink2);margin-top:2px}
  .ctable .rm{font-size:11px;color:var(--ink3);text-decoration:underline;text-underline-offset:2px;margin-top:6px}
  .scrollx{overflow-x:auto}
  .cmp-row .bar{height:6px;border-radius:3px;background:var(--chip);overflow:hidden}
  .cmp-row .bar i{display:block;height:100%;background:var(--glow);border-radius:3px}
  .cmp-row .p{font-variant-numeric:tabular-nums;text-align:right;white-space:nowrap;font-family:var(--mono);font-size:12.5px}
  .cmp-row .p small{color:var(--ink3);font-family:var(--serif)}
  .cmp-row.best{border-color:color-mix(in srgb,var(--glow) 70%,var(--ink) 15%)}
  .mhead{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.2fr);gap:12px;margin:2px 0 8px}
  .mhead>.mc{box-shadow:none}
  /* ---------- 备注（客户可见） ---------- */
  .note{grid-column:1/-1;display:flex;gap:7px;align-items:flex-start;margin-top:8px;padding:8px 11px;border-radius:10px;background:color-mix(in srgb,var(--glow) 22%,var(--card-solid));border:1px solid color-mix(in srgb,var(--glow) 45%,transparent);font-size:13px;line-height:1.55;color:var(--ink)}
  .note .pin{flex:none;width:14px;height:14px;margin-top:3px;color:color-mix(in srgb,var(--glow) 30%,var(--ink) 70%)}
  .note-text{flex:1;min-width:0}
  .mdesc{margin-top:6px;font-size:13px;color:var(--ink2);line-height:1.5}
  .star{display:inline-block;margin-right:6px;padding:1px 7px;border-radius:999px;background:hsl(40 90% 55% / .18);color:hsl(34 80% 36%);font-family:var(--serif);font-weight:400;font-size:11px;vertical-align:1px}
  .mc.featured{border-color:hsl(38 70% 55% / .7)}

  /* ---------- 编辑模式 ---------- */
  [contenteditable]{outline:none;border-radius:6px;transition:background .15s,box-shadow .15s;cursor:text}
  [contenteditable]:hover{background:color-mix(in srgb,var(--glow) 14%,transparent);box-shadow:0 0 0 3px color-mix(in srgb,var(--glow) 14%,transparent)}
  [contenteditable]:focus{background:var(--card-solid);box-shadow:0 0 0 2px color-mix(in srgb,var(--glow) 70%,var(--ink) 20%)}
  [contenteditable]:empty::before{content:attr(data-ph);color:var(--ink3);font-weight:400}
  .ch.editing{cursor:pointer}
  .ch.editing .t strong{padding:0 4px;margin-left:-4px}
  .ch.editing .d{padding:1px 4px;margin-left:-4px;min-height:1.5em}
  .tools{grid-column:1/-1;display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin-top:10px;padding-top:10px;border-top:1px dashed var(--line-strong)}
  .tl{height:26px;padding:0 10px;border-radius:7px;border:1px solid var(--line-strong);background:var(--card-solid);font-size:12px;color:var(--ink2);white-space:nowrap}
  .tl:hover:not(:disabled){color:var(--ink);border-color:var(--ink3)}
  .tl:disabled{opacity:.35;cursor:default}
  .tl[data-danger]{color:var(--dear)}
  .hid-label{font-size:12px;color:var(--dear)}
  .tag.ed{display:inline-flex;align-items:center;gap:3px;padding-right:4px}
  .tag-x{width:14px;height:14px;border-radius:50%;font-size:11px;line-height:1;color:var(--ink3)}
  .tag-x:hover{background:var(--dear-bg);color:var(--dear)}
  .tag-add{font-family:var(--mono);font-size:10px;padding:2px 8px;border-radius:999px;border:1px dashed var(--ink3);color:var(--ink2)}
  .tag-in{width:110px;height:22px;border-radius:999px;border:1px solid var(--ink3);background:var(--card-solid);padding:0 8px;font:inherit;font-size:12px;color:var(--ink);outline:none}
  li.is-hidden>.ch,.mc.is-hidden{opacity:.5;border-style:dashed}
  .mtools{display:flex;flex-wrap:wrap;gap:5px;align-items:center;margin:-4px 0 10px;padding-bottom:10px;border-bottom:1px dashed var(--line-strong)}
  .add-li::after{display:none}
  .add-li{padding-top:4px!important}
  .add-group,.add-model{width:100%;padding:13px;border-radius:14px;border:1.5px dashed var(--ink3);color:var(--ink2);font-size:14px;background:transparent}
  .add-model{width:auto;padding:8px 16px;border-radius:999px;font-size:13px;margin:2px 0 8px}
  .add-group:hover,.add-model:hover{color:var(--ink);border-color:var(--ink);background:var(--card)}
  .picker{margin:2px 0 12px;border-radius:14px;border:1px solid var(--line-strong);background:var(--card-solid);overflow:hidden}
  .picker-hd{display:flex;gap:10px;align-items:center;padding:10px 12px;border-bottom:1px solid var(--line)}
  .picker-hd .search{flex:1;width:auto}
  .picker-list{max-height:320px;overflow:auto;padding:6px}
  .prow{width:100%;display:grid;grid-template-columns:auto minmax(0,1.4fr) minmax(0,1fr) auto;gap:10px;align-items:center;padding:7px 8px;border-radius:8px;text-align:left;font-size:13px}
  .prow:hover{background:var(--chip)}
  .prow .box{width:16px;height:16px;border-radius:5px;border:1.5px solid var(--ink3);display:grid;place-items:center;font-size:11px;color:var(--bg)}
  .prow[aria-pressed=true] .box{background:var(--ink);border-color:var(--ink)}
  .prow .pn{font-family:var(--mono);overflow-wrap:anywhere}
  .prow .pc{color:var(--ink2);overflow-wrap:anywhere}
  .prow .pp{font-family:var(--mono);color:var(--ink2);white-space:nowrap}
  .editbar{position:fixed;top:14px;left:50%;transform:translateX(-50%);z-index:55;display:flex;align-items:center;gap:6px;max-width:calc(100vw - 24px);flex-wrap:wrap;justify-content:center;padding:7px 8px 7px 14px;border-radius:16px;background:var(--ink);color:var(--bg);box-shadow:0 18px 40px -16px rgba(20,12,6,.6);font-size:13px}
  .editbar b{font-weight:500}
  .eb-dot{width:8px;height:8px;border-radius:50%;background:hsl(36 90% 58%);box-shadow:0 0 0 3px hsl(36 90% 58% / .3)}
  .eb-n{opacity:.65;font-size:12px;margin:0 6px}
  .editbar button,.eb-import{height:30px;padding:0 11px;border-radius:9px;color:var(--bg);font-size:12.5px;display:inline-flex;align-items:center;cursor:pointer}
  .editbar button:hover,.eb-import:hover{background:rgba(255,255,255,.12)}
  .editbar .eb-primary{background:var(--bg);color:var(--ink)}
  .editbar .eb-primary:hover{background:var(--bg);opacity:.9}
  .edit-fab{position:fixed;right:20px;bottom:20px;z-index:45;height:40px;padding:0 16px;border-radius:999px;background:var(--card-solid);border:1px solid var(--line-strong);box-shadow:0 10px 30px -12px rgba(20,12,6,.45);font-size:13px}
  .edit-fab:hover{border-color:var(--ink)}
  .toast{position:fixed;left:50%;bottom:84px;transform:translate(-50%,20px);opacity:0;pointer-events:none;z-index:70;max-width:calc(100vw - 32px);padding:10px 16px;border-radius:12px;background:var(--ink);color:var(--bg);font-size:13px;transition:opacity .25s,transform .25s}
  .toast.show{opacity:1;transform:translate(-50%,0)}

  .more{margin:10px 0 4px;padding:8px 16px;border-radius:999px;border:1px solid var(--line);background:var(--card);font-size:13px;color:var(--ink2)}
  .more:hover{color:var(--ink);border-color:var(--ink3)}
  .empty{color:var(--ink3);font-size:14px;padding:30px 0;text-align:center}
  .foot{margin-top:46px;text-align:center;color:var(--ink3);font-size:12px;line-height:1.9}
  .credit{margin:10px 0 0;text-align:center;font-family:var(--mono);font-size:11px;letter-spacing:.06em;color:var(--ink3)}
  .credit a{color:inherit;text-decoration:none;border-bottom:1px solid var(--line-strong)}
  .credit a:hover{color:var(--ink);border-color:var(--ink3)}
  .state{padding:120px 16px;text-align:center;color:var(--ink2)}
  @media (max-width:640px){
    .fan{height:320px}.vc{width:180px;height:262px;margin-left:-90px}.vc .name{font-size:24px}
    .ch{grid-template-columns:1fr}.ch .r{grid-row:auto;grid-column:1;text-align:left;display:flex;gap:12px;align-items:baseline}
    .cmp-row{grid-template-columns:1fr auto}.cmp-row .bar{display:none}
    .sort{margin-left:0}.branch-head{flex-wrap:wrap}
    .models{grid-template-columns:1fr}.mhead{grid-template-columns:1fr}
    ul.tree ul.tree{margin-left:4px}.tree>li{padding-left:22px}.tree>li::after{width:16px}
  }
  @media (prefers-reduced-motion:reduce){.vc{transition:none}}
  `

  /**
   * 展示配置 plaza.config.json（只影响广场展示，不改 new-api 的分组、倍率、渠道）：
   * {
   *   channels: { "分组名": { title, desc, tags[], note, hidden } },
   *   cards:    { "分组名::模型名": { desc, note, featured, hidden } },
   *   custom:   [ { id, vendor, title, desc, tags[], note, hidden, items: ["分组名::模型名"] } ],
   *   order:    { "厂商名": ["分组名" | "custom:<id>", ...] }
   * }
   */
  const clone = (o) => JSON.parse(JSON.stringify(o))

  function normalizeCfg(c) {
    c = c && typeof c === 'object' ? c : {}
    return {
      version: 1,
      channels: c.channels && typeof c.channels === 'object' ? c.channels : {},
      cards: c.cards && typeof c.cards === 'object' ? c.cards : {},
      custom: Array.isArray(c.custom) ? c.custom.map((g) => ({ tags: [], items: [], ...g })) : [],
      order: c.order && typeof c.order === 'object' ? c.order : {}
    }
  }

  function cleanCfg(c) {
    const out = { version: 1, channels: {}, cards: {}, custom: c.custom || [], order: c.order || {} }
    for (const sec of ['channels', 'cards'])
      for (const [k, v] of Object.entries(c[sec] || {})) {
        const e = {}
        for (const [f, x] of Object.entries(v || {})) if (x !== false && x !== undefined && x !== null) e[f] = x
        if (Object.keys(e).length) out[sec][k] = e
      }
    return out
  }

  const PIN_ICON =
    '<svg class="pin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 17v5M9 3h6l-1 6 3 3v2H7v-2l3-3z"/></svg>'

  const COPY_ICON =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="12" height="12" rx="2.5"/><path d="M5 15V5.5A2.5 2.5 0 0 1 7.5 3H15"/></svg>'

  class ModelPlaza extends HTMLElement {
    constructor() {
      super()
      this.root = this.attachShadow({ mode: 'open' })
      this.vendors = []
      this.center = 0
      this.openKey = null
      this.view = 'channel'
      this.sort = 'default'
      this.q = ''
      this.site = {}
      this.perf = new Map()
      this.official = null
      this.filters = new Set()
      this.filterOpen = false
      this.picks = new Map() // 对比：key → { m, c }
      this._reg = new Map()
      this.editing = false
      this.history = []
    }

    // ---------- 可视化编辑 ----------
    /**
     * 只有管理员能编辑：由 new-api 服务端确认（/api/user/self 返回 role ≥ 10），不信任前端存储。
     * 即使有人强行打开编辑界面，改动也只是他自己浏览器里的草稿；
     * 生效必须把 plaza.config.json 放到服务器（需要服务器权限），或走服务端校验管理员身份的 save 接口。
     * demo-edit 属性仅供本地演示，生产环境不要加。
     */
    get canEdit() {
      return this.isAdmin === true || this.hasAttribute('demo-edit')
    }

    async checkAdmin() {
      this.isAdmin = false
      if (this.hasAttribute('demo-edit')) return
      let uid = ''
      try {
        const u = JSON.parse(localStorage.getItem('user') || 'null')
        if (u && u.id) uid = String(u.id)
      } catch {}
      if (!uid) return // 没登录，不必请求
      try {
        const r = await fetch(this.getAttribute('auth') || '/api/user/self', {
          credentials: 'include',
          headers: { 'New-Api-User': uid }
        })
        const j = r.ok ? await r.json() : null
        this.isAdmin = !!(j && j.success && j.data && j.data.role >= 10)
      } catch {
        this.isAdmin = false
      }
      if (this.isAdmin && this._raw && !this.editing) this.render()
    }

    get draftKey() {
      return 'model-plaza:draft:' + location.host + ':' + (this.getAttribute('api') || '/api/pricing')
    }

    enterEdit() {
      if (!this.canEdit) return
      let draft = null
      try {
        draft = JSON.parse(localStorage.getItem(this.draftKey) || 'null')
      } catch {}
      this.cfg = normalizeCfg(draft || clone(this.published))
      this.editing = true
      this.history = []
      this.view = 'channel'
      this.render()
    }

    exitEdit() {
      this.editing = false
      this.cfg = this.published
      this._noteOpen = this._tagInput = this._pickerOpen = null
      this.render()
    }

    snapshot() {
      this.history.push(JSON.stringify(this.cfg))
      if (this.history.length > 80) this.history.shift()
    }

    undo() {
      const s = this.history.pop()
      if (!s) return
      this.cfg = normalizeCfg(JSON.parse(s))
      this.saveDraft()
      this.refreshTree()
    }

    saveDraft() {
      try {
        localStorage.setItem(this.draftKey, JSON.stringify(cleanCfg(this.cfg)))
      } catch {}
      this.updateEditBar()
    }

    changeCount() {
      const a = cleanCfg(this.cfg)
      const b = cleanCfg(this.published)
      let n = 0
      for (const sec of ['channels', 'cards'])
        for (const k of new Set([...Object.keys(a[sec] || {}), ...Object.keys(b[sec] || {})]))
          if (JSON.stringify((a[sec] || {})[k]) !== JSON.stringify((b[sec] || {})[k])) n++
      const ca = new Map((a.custom || []).map((g) => [g.id, JSON.stringify(g)]))
      const cb = new Map((b.custom || []).map((g) => [g.id, JSON.stringify(g)]))
      for (const id of new Set([...ca.keys(), ...cb.keys()])) if (ca.get(id) !== cb.get(id)) n++
      for (const v of new Set([...Object.keys(a.order || {}), ...Object.keys(b.order || {})]))
        if (JSON.stringify((a.order || {})[v]) !== JSON.stringify((b.order || {})[v])) n++
      return n
    }

    editBar() {
      if (!this.editing) return this.canEdit ? '<button class="edit-fab" data-act="edit-enter">✎ 编辑广场</button>' : ''
      return `<div class="editbar" role="toolbar" aria-label="编辑模式">
        <span class="eb-dot"></span><b>编辑模式</b><span class="eb-n"></span>
        <button data-act="undo" title="Ctrl+Z">↶ 撤销</button>
        <button data-act="reset">重置为已发布</button>
        <label class="eb-import">导入<input type="file" accept=".json,application/json" data-import hidden></label>
        <button data-act="export" class="eb-primary">${this.getAttribute('save') ? '发布' : '导出发布文件'}</button>
        <button data-act="edit-exit">退出</button>
      </div>`
    }

    updateEditBar() {
      const el = this.root.querySelector('.eb-n')
      if (!el) return
      const n = this.changeCount()
      el.textContent = n ? `${n} 处修改 · 草稿已自动保存在本浏览器` : '没有未发布的修改'
    }

    async publish() {
      const body = JSON.stringify(cleanCfg(this.cfg), null, 2)
      const save = this.getAttribute('save')
      if (save) {
        try {
          const r = await fetch(save, { method: 'PUT', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body })
          if (!r.ok) throw new Error('HTTP ' + r.status)
          this.published = normalizeCfg(JSON.parse(body))
          localStorage.removeItem(this.draftKey)
          this.toast('已发布，客户刷新页面即可看到')
          this.updateEditBar()
          return
        } catch (e) {
          this.toast('发布失败：' + e.message + '，已改为下载文件')
        }
      }
      const a = document.createElement('a')
      a.href = URL.createObjectURL(new Blob([body], { type: 'application/json' }))
      a.download = 'plaza.config.json'
      a.click()
      setTimeout(() => URL.revokeObjectURL(a.href), 1000)
      this.toast('已下载 plaza.config.json：把它放到 plaza.js 同一个目录，客户刷新即生效')
    }

    toast(msg) {
      let t = this.root.querySelector('.toast')
      if (!t) return
      t.textContent = msg
      t.classList.add('show')
      clearTimeout(this._toastT)
      this._toastT = setTimeout(() => t.classList.remove('show'), 3200)
    }

    /** 编辑操作统一入口 */
    act(name, el) {
      const id = el.dataset.id
      const key = el.dataset.key
      const cfg = this.cfg
      const v = this.vendors[this.center]
      const chEntry = (cid) => {
        if (cid.startsWith('custom:')) return cfg.custom.find((g) => 'custom:' + g.id === cid)
        return (cfg.channels[cid] = cfg.channels[cid] || {})
      }
      const cardEntry = (k) => (cfg.cards[k] = cfg.cards[k] || {})
      if (name === 'edit-enter') return this.enterEdit()
      if (name === 'edit-exit') return this.exitEdit()
      if (name === 'undo') return this.undo()
      if (name === 'export') return this.publish()
      if (name === 'picker-open') {
        this._pickerOpen = id
        this._pickerQ = ''
        return this.refreshTree()
      }
      if (name === 'picker-close') {
        this._pickerOpen = null
        return this.refreshTree()
      }
      if (name === 'tag-add') {
        this._tagInput = id
        this.refreshTree()
        const inp = this.root.querySelector('.tag-in')
        return inp && inp.focus()
      }
      if (name === 'ch-note' || name === 'card-note') {
        this._noteOpen = id && name === 'ch-note' ? id : key
        this.refreshTree()
        const n = this.root.querySelector(`[data-edit$=".note"][data-id="${window.CSS.escape(this._noteOpen)}"]`)
        return n && n.focus()
      }
      this.snapshot()
      if (name === 'reset') {
        if (!confirm('放弃所有未发布的修改，回到已发布的版本？')) return this.history.pop()
        this.cfg = normalizeCfg(clone(this.published))
      } else if (name === 'ch-hide') {
        const e = chEntry(id)
        e.hidden = !e.hidden
      } else if (name === 'ch-up' || name === 'ch-down') {
        const ids = this.channelsOf(v).map((c) => c.id)
        const i = ids.indexOf(id)
        const j = name === 'ch-up' ? i - 1 : i + 1
        if (i < 0 || j < 0 || j >= ids.length) return this.history.pop()
        ;[ids[i], ids[j]] = [ids[j], ids[i]]
        cfg.order[v.name] = ids
        this.sort = 'default'
      } else if (name === 'ch-del') {
        const g = chEntry(id)
        if (!confirm(`删除自建分组「${g.title || '未命名分组'}」？`)) return this.history.pop()
        cfg.custom = cfg.custom.filter((x) => x !== g)
      } else if (name === 'tag-del') {
        const e = chEntry(id)
        const cur = e.tags ?? this.channelsOf(v).find((c) => c.id === id).tags
        e.tags = cur.filter((t) => t !== el.dataset.tag)
      } else if (name === 'card-hide') {
        const e = cardEntry(key)
        e.hidden = !e.hidden
      } else if (name === 'card-feature') {
        const e = cardEntry(key)
        e.featured = !e.featured
      } else if (name === 'card-remove') {
        const g = chEntry(id)
        g.items = g.items.filter((k) => k !== key)
      } else if (name === 'pair-toggle') {
        const g = chEntry(id)
        const k = key
        g.items = g.items.includes(k) ? g.items.filter((x) => x !== k) : [...g.items, k]
      } else if (name === 'group-add') {
        const gid = Date.now().toString(36)
        cfg.custom.push({ id: gid, vendor: v.name, title: '新分组', desc: '', tags: [], note: '', items: [] })
        const ids = this.channelsOf(v).map((c) => c.id)
        cfg.order[v.name] = ['custom:' + gid, ...ids.filter((x) => x !== 'custom:' + gid)]
        this.openKey = 'custom:' + gid
        this._pickerOpen = 'custom:' + gid
        this._pickerQ = ''
        this.sort = 'default'
        this.saveDraft()
        this.refreshTree()
        const t = this.root.querySelector(`[data-edit="ch.title"][data-id="custom:${gid}"]`)
        if (t) {
          t.focus()
          document.getSelection().selectAllChildren(t)
        }
        return
      }
      this.saveDraft()
      this.refreshTree()
    }

    /** contenteditable 输入：直接写进配置，不重画（保持光标） */
    onEditInput(el) {
      const [scope, field] = el.dataset.edit.split('.')
      const id = el.dataset.id
      const text = el.textContent.replace(/\s+\n/g, '\n').trim()
      if (scope === 'ch') {
        const v = this.vendors[this.center]
        if (id.startsWith('custom:')) {
          const g = this.cfg.custom.find((x) => 'custom:' + x.id === id)
          if (g) g[field] = text
        } else {
          const raw = v.channels.find((c) => c.id === id)
          const e = (this.cfg.channels[id] = this.cfg.channels[id] || {})
          if (raw && field !== 'note' && text === (raw[field] ?? '')) delete e[field]
          else if (!text && field === 'note') delete e.note
          else e[field] = text
        }
      } else if (scope === 'card') {
        const e = (this.cfg.cards[id] = this.cfg.cards[id] || {})
        if (text) e[field] = text
        else delete e[field]
      }
      clearTimeout(this._draftT)
      this._draftT = setTimeout(() => this.saveDraft(), 250)
    }

    // ---------- 对比 ----------
    static MAX_PICKS = 6

    pickKey(m, c) {
      return `${c.id}::${m.name}`
    }

    pickButton(m, c) {
      const k = this.pickKey(m, c)
      this._reg.set(k, { m, c })
      const on = this.picks.has(k)
      return `<button class="pick" data-pick="${esc(k)}" aria-pressed="${on}" title="加入对比"><span class="box">${on ? '✓' : ''}</span>对比</button>`
    }

    updateTray() {
      const tray = this.root.querySelector('.tray')
      if (!tray) return
      const n = this.picks.size
      tray.classList.toggle('show', n > 0)
      const names = [...this.picks.values()].map(({ m, c }) => `${m.name}@${c.title}`).join('  ·  ')
      tray.innerHTML = `<span>已选 <b>${n}</b> / ${ModelPlaza.MAX_PICKS}</span><span class="names">${esc(names)}</span>
        <button class="clr" data-cmp-clear>清空</button>
        <button class="go-cmp" data-cmp-open ${n < 2 ? 'disabled title="至少选 2 个"' : ''}>开始对比</button>`
    }

    openCompare() {
      const dlg = this.root.querySelector('.dlg')
      const items = [...this.picks.entries()].map(([k, { m, c }]) => ({
        k,
        m,
        c,
        p: scale(m.base, c.ratio),
        cmp: this.compare(m, c.ratio),
        perf: this.perf.get(m.name)
      }))
      if (items.length < 1) return this.closeCompare()
      const money = (v) => (v == null || !isFinite(v) ? null : v)
      const rows = [
        ['计费方式', (x) => ({ text: x.m.base.dynamic ? '动态计费' : x.p.perCall != null ? '按次计费' : '按量计费' })],
        ['渠道倍率', (x) => ({ v: x.c.ratio, text: '×' + +x.c.ratio.toFixed(3) }), 'low'],
        ['输入 / 1M', (x) => ({ v: money(x.p.input), text: x.p.input != null ? this.money(x.p.input) : null }), 'low'],
        ['输出 / 1M', (x) => ({ v: money(x.p.output), text: x.p.output != null ? this.money(x.p.output) : null }), 'low'],
        ['缓存读取 / 1M', (x) => ({ v: money(x.p.cache), text: x.p.cache != null ? this.money(x.p.cache) : null }), 'low'],
        ['缓存写入 / 1M', (x) => ({ v: money(x.p.cacheWrite), text: x.p.cacheWrite != null ? this.money(x.p.cacheWrite) : null }), 'low'],
        ['按次价格', (x) => ({ v: money(x.p.perCall), text: x.p.perCall != null ? this.money(x.p.perCall) + ' / 次' : null }), 'low'],
        ['比官方', (x) => (x.cmp ? { v: x.cmp.input, text: (x.cmp.input >= 0 ? '省 ' : '贵 ') + pct(Math.abs(x.cmp.input)) } : { text: null }), 'high'],
        ['官方输入价', (x) => ({ text: x.cmp ? '¥' + num(x.cmp.offIn) : null })],
        ['实付输入价', (x) => ({ v: x.cmp ? x.cmp.realIn : null, text: x.cmp ? '¥' + num(x.cmp.realIn) : null }), 'low'],
        ['成功率 24h', (x) => ({ v: x.perf ? x.perf.success : null, text: x.perf && x.perf.success != null ? num(x.perf.success) + '%' : null }), 'high'],
        ['平均延迟', (x) => ({ v: x.perf ? x.perf.latency : null, text: x.perf && x.perf.latency != null ? (x.perf.latency / 1000).toFixed(2) + 's' : null }), 'low'],
        ['吞吐', (x) => ({ v: x.perf ? x.perf.tps : null, text: x.perf && x.perf.tps != null ? num(x.perf.tps) + ' t/s' : null }), 'high'],
        ['端点', (x) => ({ text: x.m.endpoints.join(', ') || null })]
      ]
      const body = rows
        .map(([label, fn, better]) => {
          const cells = items.map(fn)
          if (cells.every((c) => c.text == null)) return ''
          const vals = cells.map((c) => c.v).filter((v) => v != null && isFinite(v))
          let target = null
          if (better && vals.length >= 2 && Math.min(...vals) !== Math.max(...vals))
            target = better === 'low' ? Math.min(...vals) : Math.max(...vals)
          return `<tr><th scope="row">${label}</th>${cells
            .map((c) => `<td class="${target != null && c.v === target ? 'best' : ''}">${c.text == null ? '—' : esc(c.text)}</td>`)
            .join('')}</tr>`
        })
        .join('')
      dlg.innerHTML = `<div class="sheet" role="dialog" aria-modal="true" aria-label="模型对比">
        <div class="sheet-hd"><h3>模型对比</h3><span>${items.length} 项 · 绿色为该行最优</span><button class="x" data-cmp-close aria-label="关闭">✕</button></div>
        <div class="scrollx"><table class="ctable">
          <thead><tr><th></th>${items
            .map((x) => `<th><div class="cn">${esc(x.m.name)}</div><div class="cg">${esc(x.m.vendor)} · ${esc(x.c.title)}</div><button class="rm" data-unpick="${esc(x.k)}">移除</button></th>`)
            .join('')}</tr></thead>
          <tbody>${body}</tbody>
        </table></div></div>`
      dlg.classList.add('show')
    }

    closeCompare() {
      const dlg = this.root.querySelector('.dlg')
      if (dlg) dlg.classList.remove('show')
    }

    static get observedAttributes() {
      return ['api', 'status', 'perf', 'official', 'currency', 'rate', 'topup', 'fx']
    }

    connectedCallback() {
      this.view = this.getAttribute('view') === 'model' ? 'model' : 'channel'
      if (!this._raw) {
        this._booting = true
        this.load().finally(() => (this._booting = false))
      }
    }

    attributeChangedCallback(name, oldV, newV) {
      if (!this.isConnected || oldV === newV) return
      if (['api', 'status', 'perf', 'official'].includes(name)) {
        clearTimeout(this._reload)
        // 元素升级时会对已有属性各触发一次；那时首次加载已在进行，不重复请求
        this._reload = setTimeout(() => (oldV === null && this._booting ? null : this.load()), 0)
      } else if (this._raw) this.render()
    }

    set data(raw) {
      this._raw = raw
      this.setup()
    }

    async load() {
      this.root.innerHTML = `<style>${CSS}</style><div class="state">正在读取模型价格…</div>`
      const attr = (n, d) => this.getAttribute(n) ?? d
      // 公开接口不带登录凭据：跨域部署时 new-api 的 CORS 是通配符，带凭据会被浏览器拒绝
      const json = (url) => (url ? fetch(url).then((r) => (r.ok ? r.json() : null)) : Promise.resolve(null))
      const soft = (p) => p.catch(() => null)
      try {
        const officialUrl = attr('official', SCRIPT_SRC ? new URL('official.json', SCRIPT_SRC).href : 'official.json')
        const configUrl = attr('config', SCRIPT_SRC ? new URL('plaza.config.json', SCRIPT_SRC).href : 'plaza.config.json')
        const [raw, status, perf, official, labels, config] = await Promise.all([
          json(attr('api', '/api/pricing')),
          soft(json(attr('status', '/api/status'))),
          soft(json(attr('perf', '/api/perf-metrics/summary?hours=24'))),
          soft(json(officialUrl)),
          soft(json(this.getAttribute('labels'))),
          soft(json(configUrl + (configUrl.includes('?') ? '&' : '?') + 't=' + Date.now()))
        ])
        if (!raw) throw new Error('pricing 接口无数据')
        this.site = (status && status.data) || {}
        this.perf = normalizePerf(perf)
        this.official = official
        this.published = normalizeCfg(config)
        // 兼容旧的 labels 属性
        for (const [g, l] of Object.entries(labels || {})) this.published.channels[g] = { ...l, ...this.published.channels[g] }
        this.editing = false
        this.cfg = this.published
        this.data = raw
        this.checkAdmin()
      } catch (e) {
        this.root.innerHTML = `<style>${CSS}</style><div class="state">价格读取失败：${esc(e.message)}</div>`
      }
    }

    setup() {
      this.vendors = normalize(this._raw)
      if (!this.cfg) this.cfg = this.published = normalizeCfg(null)
      // 模型@分组 索引，自建分组用它引用真实价格
      this._pairs = new Map()
      for (const v of this.vendors) for (const c of v.channels) for (const m of c.models) this._pairs.set(this.pickKey(m, c), { m, c })
      this.center = Math.max(0, Math.ceil(this.vendors.length / 2) - 1)
      this.openKey = null
      this.picks.clear()
      this.filters.clear()
      this.render()
    }

    // ---------- 币种 ----------
    // 站点显示：美元额度 → 站点自己的显示币种（跟原站价格页一致）
    /**
     * 币种切换。注意：这类站点的「$」是额度美元，不是真实美元，绝不能按市场汇率换算。
     *   USD  = 额度（站点余额实际扣除的数），和原站 USD 显示一致
     *   CNY  = 额度 × 充值价（实付多少元买 1 美元额度）= 客户真实花的人民币
     *          站点没配充值价时，退回站点自己的显示汇率 usd_exchange_rate
     *   CUSTOM = 站点自定义币种（仅当站点设置为 CUSTOM 时出现）
     */
    get cur() {
      if (this._cur) return this._cur
      const a = this.getAttribute('currency')
      if (a) return a
      const t = this.site.quota_display_type
      return t === 'CNY' || t === 'CUSTOM' ? t : 'USD'
    }

    cnyRate() {
      return +(this.getAttribute('rate') || this.topup || this.site.usd_exchange_rate || 0) || null
    }

    get display() {
      const s = this.site
      if (this.cur === 'CNY' && this.cnyRate()) return { sym: '¥', rate: this.cnyRate() }
      if (this.cur === 'CUSTOM') return { sym: s.custom_currency_symbol || '¤', rate: +(s.custom_currency_exchange_rate || 1) }
      return { sym: '$', rate: 1 }
    }

    currencySwitch() {
      const opts = [['USD', '$ 额度'], ...(this.cnyRate() ? [['CNY', '¥ 人民币']] : [])]
      if (this.site.quota_display_type === 'CUSTOM') opts.push(['CUSTOM', `${esc(this.site.custom_currency_symbol || '¤')} 站点币种`])
      if (opts.length < 2) return ''
      return `<div class="seg" role="group" aria-label="币种" title="$ 为站点额度；¥ = 额度 × 充值价 ¥${num(this.cnyRate() || 0)}">${opts
        .map(([k, l]) => `<button data-cur="${k}" aria-pressed="${this.cur === k}">${l}</button>`)
        .join('')}</div>`
    }

    money(quota) {
      if (quota == null || !isFinite(quota)) return '—'
      const d = this.display
      return d.sym + num(quota * d.rate)
    }

    // 实付：买 1 美元额度要花多少元（站点充值价格 price）
    get topup() {
      const v = +(this.getAttribute('topup') || this.site.price)
      return v > 0 ? v : null
    }

    get fx() {
      const v = +(this.getAttribute('fx') || (this.official && this.official.fx && this.official.fx.CNY))
      return v > 0 ? v : null
    }

    /** 和官方比：返回 { input, output, offIn, offOut, realIn, realOut }，算不了返回 null */
    compare(m, g) {
      const p = scale(m.base, g)
      if (p.perCall != null || !this.topup || !this.fx) return null
      const off = officialFor(this.official && this.official.models, m.name)
      if (!off || !off.input) return null
      const realIn = p.input * this.topup
      const realOut = p.output * this.topup
      const offIn = off.input * this.fx
      const offOut = off.output * this.fx
      return {
        input: 1 - realIn / offIn,
        output: off.output ? 1 - realOut / offOut : null,
        realIn,
        realOut,
        offIn,
        offOut,
        off
      }
    }

    saveBadge(cmp, prefix = '比官方') {
      if (!cmp) return ''
      const a = cmp.input
      const b = cmp.output
      const same = b == null || Math.abs(a - b) < 0.0005
      const show = (d) => (d >= 0 ? `省 ${pct(d)}` : `贵 ${pct(-d)}`)
      const dear = same ? a < 0 : a < 0 && b < 0
      const text = same ? `${prefix}${show(a)}` : `${prefix}输入${show(a)} · 输出${show(b)}`
      return `<span class="save ${dear ? 'dear' : ''}" title="官方价按 1 USD = ¥${this.fx} 换算；实付按本站充值价 ¥${this.topup} / 1 美元额度">${text}</span>`
    }

    // ---------- 渲染 ----------
    render() {
      const v = this.vendors[this.center]
      if (!v) {
        this.root.innerHTML = `<style>${CSS}</style><div class="state">这个站点还没有公开模型。</div>`
        return
      }
      this.style.setProperty('--glow', accent(v.hue, v.sat, 76))
      const o = this.official
      this.root.innerHTML = `<style>${CSS}</style>
        <div class="glow"></div>
        <div class="wrap">
          <p class="eyebrow">Model Plaza</p>
          <h2>模型广场</h2>
          <p class="sub">${this.vendors.length} 家厂商 · ${this.vendors.reduce((n, x) => n + x.models.length, 0)} 个模型 · 选一家厂商，沿着分支看渠道与价格</p>
          <div class="fan" tabindex="0" role="group" aria-label="厂商">${this.vendors.map((x, i) => this.vendorCard(x, i)).join('')}</div>
          <div class="ruler">
            <span>${esc(v.name)}</span>
            <span class="ticks">${this.vendors.map((x, i) => `<button data-go="${i}" aria-label="${esc(x.name)}" ${i === this.center ? 'aria-current="true"' : ''}></button>`).join('')}</span>
            <span>${String(this.center + 1).padStart(2, '0')} / ${String(this.vendors.length).padStart(2, '0')}</span>
          </div>
          <div class="toolbar">
            <div class="seg" role="group" aria-label="视图">
              <button data-view="channel" aria-pressed="${this.view === 'channel'}">按渠道</button>
              <button data-view="model" aria-pressed="${this.view === 'model'}">按模型比价</button>
            </div>
            <input class="search" type="search" placeholder="搜索模型，如 opus / gpt-5" value="${esc(this.q)}">
            ${this.currencySwitch()}
          </div>
          <section class="branches">${this.branches(v)}</section>
          <p class="foot">价格来自本站公开接口，实时同步 · 每百万 tokens<br>${
            this.topup && this.fx
              ? `「比官方省」= 1 − 实付 ÷ 官方价；实付按本站充值价 ¥${num(this.topup)} = 1 美元额度，官方价按 1 USD = ¥${this.fx}${o && o.fx && o.fx.time && !this.getAttribute('fx') ? `（${esc(new Date(o.fx.time).toISOString().slice(0, 10))} 汇率）` : ''} 换算`
              : '未获取到充值价或汇率，暂不显示与官方的价差'
          }${this.perf.size ? '<br>状态 / 延迟 / 吞吐为该模型近 24 小时全渠道数据' : ''}</p>
          ${this.hasAttribute('no-credit') ? '' : '<p class="credit"><a href="https://github.com/TransAPI-eng/new-api-model-plaza" target="_blank" rel="noopener">开源模型广场</a> · by <a href="https://trans86.com" target="_blank" rel="noopener">Trans86</a></p>'}
        </div>
        <div class="tray" aria-live="polite"></div>
        <div class="dlg"></div>
        ${this.editBar()}
        <div class="toast" role="status"></div>`
      this.layoutFan()
      this.bind()
      this.updateTray()
      this.updateEditBar()
    }

    vendorBest(v) {
      let best = null
      for (const c of v.channels)
        for (const m of c.models) {
          const cmp = this.compare(m, c.ratio)
          if (cmp && (best == null || cmp.input > best)) best = cmp.input
        }
      return best
    }

    vendorCard(v, i) {
      const best = this.vendorBest(v)
      return `<button class="vc" data-i="${i}" aria-label="${esc(v.name)}">
        ${landscape(v.hue, v.sat, 7 + i * 13)}
        <span class="rim"></span>
        <span class="top"><span>${esc(v.name)}</span><span class="mono">${String(i + 1).padStart(2, '0')}</span></span>
        <span class="body">
          <span class="name">${esc(v.name)}</span>
          <span class="meta">${v.channels.length} 渠道 · ${v.models.length} 模型</span>
          <span class="from"><span>${best != null && best > 0 ? `最高省 <b>${pct(best)}</b>` : `输入低至 <b>${this.money(v.from)}</b>`}</span><span class="go">↓</span></span>
        </span>
      </button>`
    }

    // 模糊搜索：OPUS5.5 / opus 5-5 / Opus-5-5 都能命中 claude-opus-5-5，按匹配程度排序
    score(m) {
      if (!this.q) return 0
      if (this._sq !== this.q) {
        this._sq = this.q
        this._sc = new Map()
        this._qs = segs(this.q)
        this._qc = compact(this.q)
        this._qt = this.q.split(/\s+/).map(compact).filter(Boolean)
      }
      let s = this._sc.get(m.name)
      if (s == null) {
        const ms = segs(m.name)
        const mc = compact(m.name)
        s =
          mc === this._qc ? 0
          : ms.endsWith(this._qs) ? 1
          : ms.includes(this._qs) ? 2
          : mc.includes(this._qc) ? 3
          : this._qt.length && this._qt.every((t) => mc.includes(t)) ? 4
          : Infinity
        this._sc.set(m.name, s)
      }
      return s
    }

    matches(m) {
      return this.score(m) < Infinity
    }

    rank(models) {
      return this.q ? models.filter((m) => this.matches(m)).sort((a, b) => this.score(a) - this.score(b)) : models
    }

    /** 搜索时把用户带到最匹配的模型：必要时切换厂商，并展开它 */
    direct() {
      if (!this.q) return
      let best = null
      this.vendors.forEach((v, i) => {
        for (const m of v.models) {
          const s = this.score(m)
          if (s < Infinity && (!best || s < best.s || (s === best.s && i === this.center))) best = { s, i, m }
        }
      })
      if (!best) return
      const here = this.vendors[this.center].models.some((m) => this.score(m) === best.s)
      if (!here) {
        const q = this.q
        this.go(best.i)
        this.q = q
      }
      if (this.view === 'model') this.openKey = best.m.name
      else {
        const v = this.vendors[this.center]
        const target = here ? this.rank(v.models)[0] : best.m
        const ch = v.channels.filter((c) => c.models.includes(target) && this.passFilters(c, Math.min(...v.channels.map((x) => x.from))))
        ch.sort((a, b) => a.ratio - b.ratio)
        if (ch[0]) this.openKey = ch[0].id
      }
    }

    branches(v) {
      return this.view === 'channel' ? this.channelTree(v) : this.modelTree(v)
    }

    // ---------- 筛选：最低价 + 渠道特点标签，多选取交集 ----------
    filterOptions(chans, cheapest) {
      const counts = new Map([['最低价', chans.filter((c) => c.from === cheapest).length]])
      for (const c of chans) for (const t of c.tags) counts.set(t, (counts.get(t) || 0) + 1)
      return [...counts].filter(([, n]) => n > 0)
    }

    passFilters(c, cheapest) {
      for (const f of this.filters) {
        if (f === '最低价' ? c.from !== cheapest : !c.tags.includes(f)) return false
      }
      return true
    }

    filterBar(options) {
      const n = this.filters.size
      return `<button class="fbtn ${n ? 'on' : ''}" data-ftoggle aria-expanded="${!!this.filterOpen}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 6h16M7 12h10M10 18h4"/></svg>筛选${n ? ` · ${n}` : ''}</button>`
    }

    filterPanel(options) {
      if (!this.filterOpen) return ''
      return `<div class="fpanel" role="group" aria-label="筛选渠道">
        ${options
          .map(
            ([t, n]) => `<button class="fchip" data-filter="${esc(t)}" aria-pressed="${this.filters.has(t)}">
              <span class="box">${this.filters.has(t) ? '✓' : ''}</span>${esc(t)}<span class="count">${n}</span></button>`
          )
          .join('')}
        ${this.filters.size ? '<button class="fclear" data-fclear>清除筛选</button>' : ''}
      </div>`
    }

    // ---------- 展示配置（覆盖层）：只改广场的展示，不碰 new-api 的真实计费 ----------
    chOverride(id) {
      return this.cfg.channels[id] || {}
    }

    cardCfg(m, c) {
      return this.cfg.cards[this.pickKey(m, c)] || {}
    }

    /** 某厂商下的分组：自建分组 + 真实分组，合并展示配置，并按配置排序 */
    channelsOf(v) {
      const cfg = this.cfg
      const real = v.channels.map((c) => {
        const o = cfg.channels[c.id] || {}
        return {
          id: c.id,
          custom: false,
          title: o.title ?? c.title,
          desc: o.desc ?? c.desc,
          tags: o.tags ?? c.tags,
          note: o.note || '',
          hidden: !!o.hidden,
          ratio: c.ratio,
          items: c.models.map((m) => ({ m, c }))
        }
      })
      const custom = (cfg.custom || [])
        .filter((g) => g.vendor === v.name)
        .map((g) => ({
          id: 'custom:' + g.id,
          custom: true,
          title: g.title || '未命名分组',
          desc: g.desc || '',
          tags: g.tags || [],
          note: g.note || '',
          hidden: !!g.hidden,
          ratio: null,
          items: (g.items || []).map((k) => this._pairs.get(k)).filter(Boolean)
        }))
      let list = [...custom, ...real]
      for (const ch of list) {
        if (!this.editing) ch.items = ch.items.filter((it) => !this.cardCfg(it.m, it.c).hidden)
        ch.items.sort((a, b) => (this.cardCfg(b.m, b.c).featured ? 1 : 0) - (this.cardCfg(a.m, a.c).featured ? 1 : 0))
        ch.from = Math.min(...ch.items.map((it) => unit(it.m, it.c.ratio)))
      }
      if (!this.editing) list = list.filter((ch) => !ch.hidden && ch.items.length)
      const order = cfg.order && cfg.order[v.name]
      if (order) {
        const idx = new Map(order.map((id, i) => [id, i]))
        list = list.map((ch, i) => ({ ch, i })).sort((a, b) => (idx.get(a.ch.id) ?? 1e6 + a.i) - (idx.get(b.ch.id) ?? 1e6 + b.i)).map((x) => x.ch)
      }
      return list
    }

    editableText(value, field, id, placeholder, tag = 'span', cls = '') {
      return `<${tag} class="${cls}" contenteditable="plaintext-only" spellcheck="false" data-edit="${field}" data-id="${esc(id)}" data-ph="${esc(placeholder)}">${esc(value)}</${tag}>`
    }

    channelTree(v) {
      const all = this.channelsOf(v)
      const searched = all.filter((c) => (this.editing && c.custom && !this.q) || c.items.some((it) => this.matches(it.m)))
      const cheapest = Math.min(...searched.map((c) => c.from))
      const options = this.filterOptions(searched, cheapest)
      let chans = searched.filter((c) => this.passFilters(c, cheapest))
      if (this.sort === 'cheap') chans = [...chans].sort((a, b) => a.from - b.from)
      if (this.sort === 'models') chans = [...chans].sort((a, b) => b.items.length - a.items.length)
      if ((this.openKey == null || (this.openKey && !chans.some((c) => c.id === this.openKey))) && chans[0]) this.openKey = chans[0].id
      const ed = this.editing
      return `<div class="branch-head"><i class="dot"></i><h3>${esc(v.name)}</h3><span>${chans.length}${chans.length !== searched.length ? ` / ${searched.length}` : ''} 个渠道</span>
          <div class="sort">${this.filterBar(options)}
          <div class="seg" role="group" aria-label="排序">
            <button data-sort="default" aria-pressed="${this.sort === 'default'}">${ed ? '自定义顺序' : '默认'}</button>
            <button data-sort="cheap" aria-pressed="${this.sort === 'cheap'}">最便宜</button>
            <button data-sort="models" aria-pressed="${this.sort === 'models'}">模型最多</button>
          </div></div></div>
        ${this.filterPanel(options)}
        ${chans.length ? '' : `<p class="empty">${this.filters.size ? '没有同时满足这些条件的渠道' : '没有匹配的模型'}</p>`}
        <ul class="tree">${chans
          .map((c, ci) => {
            const open = c.id === this.openKey
            const items = this.q ? c.items.filter((it) => this.matches(it.m)).sort((a, b) => this.score(a.m) - this.score(b.m)) : c.items
            let best = null
            for (const it of items) {
              const cmp = this.compare(it.m, it.c.ratio)
              if (cmp && (best == null || cmp.input > best)) best = cmp.input
            }
            const shown = this.all || this.q || ed ? items : items.slice(0, 12)
            const head = ed ? this.channelHeadEdit(c, ci, chans.length, best, cheapest, items.length) : this.channelHead(c, open, best, cheapest, chans.length, items.length)
            return `<li class="${open ? 'open' : ''} ${c.hidden ? 'is-hidden' : ''}">
              ${head}
              ${
                open
                  ? `<ul class="tree"><li>
                      ${ed && c.custom ? this.pickerPanel(v, c) : ''}
                      ${items.length ? `<div class="models">${shown.map((it) => this.modelCard(it.m, it.c, { via: c })).join('')}</div>` : `<p class="empty">${c.custom ? '这个分组还没有模型，点上方「添加模型」挑选' : '没有模型'}</p>`}${
                      shown.length < items.length ? `<button class="more" data-more>展开全部 ${items.length} 个模型</button>` : ''
                    }</li></ul>`
                  : ''
              }
            </li>`
          })
          .join('')}
          ${ed ? '<li class="add-li"><button class="add-group" data-act="group-add">＋ 新增分组</button></li>' : ''}</ul>`
    }

    ratioCell(c) {
      return c.custom
        ? `<span class="r"><span class="x" style="font-size:15px">精选</span><br><span class="f">${isFinite(c.from) ? '输入低至 ' + this.money(c.from) : '—'}</span></span>`
        : `<span class="r"><span class="x"><small>×</small>${+c.ratio.toFixed(3)}</span><br><span class="f">输入低至 ${this.money(c.from)}</span></span>`
    }

    badgesOf(c, best, cheapest, count, n) {
      return `${c.custom ? '<span class="tag hot">精选</span>' : ''}${c.from === cheapest && isFinite(cheapest) && count > 1 ? '<span class="tag hot">最低价</span>' : ''}${best != null ? `<span class="save ${best < 0 ? 'dear' : ''}">${best >= 0 ? '最高省' : '贵'} ${pct(Math.abs(best))}</span>` : ''}`
    }

    channelHead(c, open, best, cheapest, count, n) {
      return `<button class="ch" data-open="${esc(c.id)}" aria-expanded="${open}">
          <span class="t"><strong>${esc(c.title)}</strong>${this.badgesOf(c, best, cheapest, count)}${c.tags.map((t) => `<span class="tag">${esc(t)}</span>`).join('')}<span class="count">${n} 模型</span></span>
          <span class="d">${esc(c.desc) || '&nbsp;'}</span>
          ${this.ratioCell(c)}
          ${c.note ? `<span class="note">${PIN_ICON}<span>${esc(c.note)}</span></span>` : ''}
        </button>`
    }

    channelHeadEdit(c, i, total, best, cheapest, n) {
      const showNote = c.note || this._noteOpen === c.id
      const tool = (act, label, extra = '') => `<button class="tl" data-act="${act}" data-id="${esc(c.id)}" ${extra}>${label}</button>`
      return `<div class="ch editing" data-open="${esc(c.id)}" role="button" tabindex="0">
          <span class="t">${this.editableText(c.title, 'ch.title', c.id, '分组名称', 'strong')}${this.badgesOf(c, best, cheapest, total)}
            ${c.tags.map((t) => `<span class="tag ed">${esc(t)}<button class="tag-x" data-act="tag-del" data-id="${esc(c.id)}" data-tag="${esc(t)}" aria-label="删除标签">×</button></span>`).join('')}
            ${this._tagInput === c.id ? `<input class="tag-in" data-tag-input="${esc(c.id)}" placeholder="输入后回车" maxlength="12">` : `<button class="tag-add" data-act="tag-add" data-id="${esc(c.id)}">＋ 标签</button>`}
            <span class="count">${n} 模型</span></span>
          ${this.editableText(c.desc, 'ch.desc', c.id, '点击填写分组说明，客户一眼能看到的卖点', 'span', 'd')}
          ${this.ratioCell(c)}
          ${showNote ? `<span class="note">${PIN_ICON}${this.editableText(c.note, 'ch.note', c.id, '写一条备注，会显示给客户', 'span', 'note-text')}</span>` : ''}
          <span class="tools">
            ${tool('ch-up', '↑ 上移', i === 0 ? 'disabled' : '')}${tool('ch-down', '↓ 下移', i === total - 1 ? 'disabled' : '')}
            ${showNote ? '' : tool('ch-note', '✎ 备注')}
            ${tool('ch-hide', c.hidden ? '◉ 显示' : '◌ 隐藏')}
            ${c.custom ? tool('ch-del', '🗑 删除分组', 'data-danger') : ''}
            ${c.hidden ? '<span class="hid-label">已隐藏 · 客户看不到</span>' : ''}
          </span>
        </div>`
    }

    /** 自建分组的「添加模型」面板：从本厂商所有真实分组里挑 模型@分组 */
    pickerPanel(v, ch) {
      const g = (this.cfg.custom || []).find((x) => 'custom:' + x.id === ch.id)
      if (!g) return ''
      const open = this._pickerOpen === ch.id
      if (!open) return `<button class="add-model" data-act="picker-open" data-id="${esc(ch.id)}">＋ 添加模型</button>`
      const q = this._pickerQ || ''
      const qs = segs(q)
      const qc = compact(q)
      const rows = []
      for (const c of v.channels)
        for (const m of c.models) {
          if (q && !(segs(m.name).includes(qs) || compact(m.name).includes(qc) || compact(c.title).includes(qc))) continue
          rows.push({ m, c, k: this.pickKey(m, c) })
        }
      rows.sort((a, b) => unit(a.m, a.c.ratio) - unit(b.m, b.c.ratio))
      const inSet = new Set(g.items || [])
      return `<div class="picker">
        <div class="picker-hd"><input class="search picker-q" placeholder="搜模型或分组，如 opus 5.5 / CC_MAX" value="${esc(q)}"><span class="count">已选 ${inSet.size}</span><button class="tl" data-act="picker-close" data-id="${esc(ch.id)}">完成</button></div>
        <div class="picker-list">${rows
          .slice(0, 80)
          .map(({ m, c, k }) => {
            const p = scale(m.base, c.ratio)
            return `<button class="prow" data-act="pair-toggle" data-id="${esc(ch.id)}" data-key="${esc(k)}" aria-pressed="${inSet.has(k)}">
              <span class="box">${inSet.has(k) ? '✓' : ''}</span><span class="pn">${esc(m.name)}</span><span class="pc">${esc(this.chOverride(c.id).title ?? c.title)} ×${+c.ratio.toFixed(3)}</span><span class="pp">${p.perCall != null ? this.money(p.perCall) + '/次' : this.money(p.input) + ' 入'}</span></button>`
          })
          .join('')}${rows.length > 80 ? `<p class="count" style="padding:8px">还有 ${rows.length - 80} 项，输入关键词缩小范围</p>` : ''}${rows.length ? '' : '<p class="empty">没有匹配的模型</p>'}</div>
      </div>`
    }

    /** 模型卡：名称 / 计费方式 / 价格 / 与官方比 / 状态·延迟·吞吐 */
    modelCard(m, c, opts = {}) {
      const g = c ? c.ratio : m.minRatio
      const p = scale(m.base, g)
      const cmp = this.compare(m, g)
      const perf = this.perf.get(m.name)
      const prices =
        p.perCall != null
          ? `<div><dt>按次</dt><dd>${this.money(p.perCall)}<small>/ 次</small></dd></div>`
          : `<div><dt>输入</dt><dd>${this.money(p.input)}<small>/ 1M</small></dd></div>
             <div><dt>输出</dt><dd>${this.money(p.output)}<small>/ 1M</small></dd></div>
             ${p.cache != null ? `<div><dt>缓存读取</dt><dd>${this.money(p.cache)}<small>/ 1M</small></dd></div>` : p.cacheWrite != null ? `<div><dt>缓存写入</dt><dd>${this.money(p.cacheWrite)}<small>/ 1M</small></dd></div>` : ''}`
      const tiers = m.base.tiers && m.base.tiers.length > 1
        ? `<div class="tiers">${m.base.tiers
            .slice(1)
            .map((t) => `${esc(t.label)}：入 ${this.money((t.p ?? 0) * g)} · 出 ${this.money((t.c ?? 0) * g)}`)
            .join('<br>')}${m.base.tiers[0].maxLen ? `（≤${Math.round(m.base.tiers[0].maxLen / 1000)}K 用上方价格）` : ''}</div>`
        : ''
      const off = cmp
        ? `<div class="off"><s>¥${num(cmp.offIn)}</s> → ¥${num(cmp.realIn)} / 1M 输入${cmp.off.output ? ` · 输出 <s>¥${num(cmp.offOut)}</s> → ¥${num(cmp.realOut)}` : ''}</div>`
        : ''
      const series = perf ? perf.series.slice(-24) : []
      const perfHtml = perf
        ? `<div class="perf">
            <div><div class="k"><span>状态</span><b>${perf.success == null ? '—' : num(perf.success) + '%'}</b></div>
              <div class="bars" aria-label="近 24 小时成功率">${(series.length ? series : [perf.success]).map((s) => `<i style="background:${statusColor(s)}" title="${s == null ? '无数据' : num(s) + '%'}"></i>`).join('')}</div></div>
            <div><div class="k">延迟</div><div class="val">${perf.latency == null ? '—' : (perf.latency / 1000).toFixed(2) + 's'}</div></div>
            <div><div class="k">吞吐</div><div class="val">${perf.tps == null ? '—' : num(perf.tps) + 't/s'}</div></div>
          </div>`
        : this.perf.size
          ? '<div class="perf-none">近 24 小时暂无调用数据</div>'
          : '<div class="spacer"></div>'
      const groupLine = !c && m.channels.length
        ? `<span class="tag">最低倍率渠道 ${esc(m.channels.find((x) => x.ratio === m.minRatio).title)}${m.channels.length > 1 ? ` +${m.channels.length - 1}` : ''}</span>`
        : ''
      const meta = c ? this.cardCfg(m, c) : {}
      const key = c ? this.pickKey(m, c) : ''
      const ed = this.editing && c
      const via = opts.via && opts.via.custom ? `<span class="tag">来自 ${esc(this.chOverride(c.id).title ?? c.title)} ×${+c.ratio.toFixed(3)}</span>` : ''
      const tool = (act, label) => `<button class="tl" data-act="${act}" data-key="${esc(key)}"${opts.via ? ` data-id="${esc(opts.via.id)}"` : ''}>${label}</button>`
      const showNote = meta.note || (ed && this._noteOpen === key)
      return `<div class="mc ${c && this.picks.has(key) ? 'picked' : ''} ${meta.featured ? 'featured' : ''} ${meta.hidden ? 'is-hidden' : ''}">
        ${ed ? `<div class="mtools">${tool('card-feature', meta.featured ? '★ 取消推荐' : '☆ 推荐')}${meta.note || this._noteOpen === key ? '' : tool('card-note', '✎ 备注')}${tool('card-hide', meta.hidden ? '◉ 显示' : '◌ 隐藏')}${opts.via && opts.via.custom ? tool('card-remove', '✕ 移出分组') : ''}${meta.hidden ? '<span class="hid-label">已隐藏</span>' : ''}</div>` : ''}
        <div class="hd"><div class="n">${meta.featured ? '<span class="star">★ 推荐</span>' : ''}${esc(m.name)}<span class="v">${esc(m.vendor)}${m.endpoints.length ? ' · ' + m.endpoints.map(esc).join(', ') : ''}</span></div>
          ${c ? this.pickButton(m, c) : ''}<button class="copy" data-copy="${esc(m.name)}" aria-label="复制模型名">${COPY_ICON}</button></div>
        ${ed ? this.editableText(meta.desc || '', 'card.desc', key, '一句话介绍这个模型（可选）', 'div', 'mdesc') : meta.desc ? `<div class="mdesc">${esc(meta.desc)}</div>` : ''}
        <div class="badges"><span class="bill ${m.base.dynamic ? '' : 'flat'}">${m.base.dynamic ? '动态计费' : p.perCall != null ? '按次计费' : '按量计费'}</span>${this.saveBadge(cmp)}${groupLine}${via}</div>
        ${showNote ? `<div class="note">${PIN_ICON}${ed ? this.editableText(meta.note || '', 'card.note', key, '写一条备注，会显示给客户', 'span', 'note-text') : `<span>${esc(meta.note)}</span>`}</div>` : ''}
        <dl class="pg">${prices}</dl>
        ${tiers}${off}
        ${opts.noPerf ? '' : perfHtml}
      </div>`
    }

    modelTree(v) {
      const models = this.rank(v.models)
      if (this.openKey == null || (this.openKey !== '' && !models.some((m) => m.name === this.openKey))) this.openKey = models[0]?.name ?? null
      const merged = new Map(this.channelsOf(v).filter((c) => !c.custom).map((c) => [c.id, c]))
      const view = (c) => merged.get(c.id)
      const cheapest = Math.min(...[...merged.values()].map((c) => c.from))
      const options = this.filterOptions([...merged.values()], cheapest)
      return `<div class="branch-head"><i class="dot"></i><h3>${esc(v.name)}</h3><span>${models.length} 个模型 · 点开看各渠道价格</span>
          <div class="sort">${this.filterBar(options)}</div></div>
        ${this.filterPanel(options)}
        ${models.length ? '' : '<p class="empty">没有匹配的模型</p>'}
        <ul class="tree">${models
          .map((m) => {
            const open = m.name === this.openKey
            const priced = m.channels
              .filter((c) => {
                const mc = view(c)
                return mc && mc.items.some((it) => it.m === m) && this.passFilters(mc, cheapest)
              })
              .map((c) => ({ c, p: scale(m.base, c.ratio), cmp: this.compare(m, c.ratio) }))
              .sort((a, b) => (a.p.input ?? a.p.perCall) - (b.p.input ?? b.p.perCall))
            const best = priced[0]
            const max = Math.max(...priced.map((x) => x.p.input ?? x.p.perCall)) || 1
            const perf = this.perf.get(m.name)
            return `<li class="${open ? 'open' : ''}">
              <button class="ch" data-open="${esc(m.name)}" aria-expanded="${open}">
                <span class="t"><strong style="font-family:var(--mono);font-size:15px">${esc(m.name)}</strong>${best && best.cmp ? this.saveBadge(best.cmp, '最高') : ''}<span class="count">${m.channels.length} 渠道${perf && perf.success != null ? ` · 成功率 ${num(perf.success)}%` : ''}</span></span>
                <span class="d">${m.base.dynamic ? '动态计费' : m.base.perCall != null ? '按次计费' : '按量计费'}</span>
                <span class="r"><span class="f">最低</span><br><span class="x" style="font-size:17px">${this.money(best && (best.p.input ?? best.p.perCall))}</span></span>
              </button>
              ${
                open
                  ? `<ul class="tree"><li>
                      <div class="mhead">${this.modelCard(m, null)}</div>
                      ${priced.length ? '' : '<p class="empty">没有满足筛选条件的渠道</p>'}
                      <div class="cmp">${priced
                        .map(({ c, p, cmp }, k) => {
                          const val = p.input ?? p.perCall
                          return `<div class="cmp-row ${k === 0 ? 'best' : ''} ${this.picks.has(this.pickKey(m, c)) ? 'picked' : ''}"><span><strong style="font-weight:400">${esc(view(c).title)}</strong> <span class="count">×${+c.ratio.toFixed(3)}</span> ${view(c).tags.slice(0, 2).map((t) => `<span class="tag">${esc(t)}</span>`).join(' ')}</span>
                          <span class="bar"><i style="width:${Math.max(4, (val / max) * 100)}%"></i></span>
                          <span class="p">${p.perCall != null ? `${this.money(p.perCall)} <small>/次</small>` : `${this.money(p.input)} <small>入</small> · ${this.money(p.output)} <small>出</small>`}</span>
                          <span>${cmp ? `<span class="save ${cmp.input < 0 ? 'dear' : ''}">${cmp.input >= 0 ? '省' : '贵'} ${pct(Math.abs(cmp.input))}</span>` : ''}</span>${this.pickButton(m, c)}</div>`
                        })
                        .join('')}</div></li></ul>`
                  : ''
              }
            </li>`
          })
          .join('')}</ul>`
    }

    // ---------- 扇形卡片：和首页一样的转盘 ----------
    layoutFan() {
      const n = this.vendors.length
      const loop = n >= 7
      const narrow = this.getBoundingClientRect().width < 640
      const W = narrow ? 180 : 212
      this.root.querySelectorAll('.vc').forEach((el, i) => {
        let o = i - this.center
        if (loop) o = ((((o + n / 2) % n) + n) % n) - n / 2
        const a = Math.abs(o)
        const s = Math.sign(o)
        const x = s * (a * W * 0.62 - Math.max(0, a - 1) * a * W * 0.035)
        const rot = -s * Math.min(52, a * 16)
        const sc = 1 - Math.min(a, 4) * 0.065
        const y = a * a * 5
        el.style.transform = `translateX(${x}px) translateY(${y}px) rotateY(${rot}deg) scale(${sc})`
        el.style.zIndex = String(100 - Math.round(a * 2))
        el.style.opacity = a > 3.5 ? '0' : a > 3 ? String((3.5 - a) * 2) : '1'
        el.style.pointerEvents = a > 3.2 ? 'none' : ''
        el.classList.toggle('dim', a > 0)
        el.tabIndex = a === 0 ? 0 : -1
      })
    }

    go(i) {
      const n = this.vendors.length
      i = ((i % n) + n) % n
      if (i === this.center) return
      this.center = i
      this.openKey = null
      this.all = false
      this.filters.clear()
      this.layoutFan()
      const v = this.vendors[i]
      this.style.setProperty('--glow', accent(v.hue, v.sat, 76))
      const r = this.root
      r.querySelectorAll('.ticks button').forEach((b, k) => b.toggleAttribute('aria-current', k === i))
      const spans = r.querySelectorAll('.ruler > span')
      spans[0].textContent = v.name
      spans[2].textContent = `${String(i + 1).padStart(2, '0')} / ${String(n).padStart(2, '0')}`
      r.querySelector('.branches').innerHTML = this.branches(v)
    }

    bind() {
      const r = this.root
      const fan = r.querySelector('.fan')
      if (!this._bound) this.bindOnce()
      r.querySelector('.search').addEventListener('input', (e) => {
        this.q = e.target.value.trim()
        this.openKey = null
        this.direct()
        this.refreshTree()
      })
      fan.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowLeft') this.go(this.center - 1)
        if (e.key === 'ArrowRight') this.go(this.center + 1)
      })
      let lastWheel = 0
      fan.addEventListener(
        'wheel',
        (e) => {
          if (Math.abs(e.deltaX) < Math.abs(e.deltaY)) return
          e.preventDefault()
          const now = Date.now()
          if (now - lastWheel < 260) return
          lastWheel = now
          this.go(this.center + Math.sign(e.deltaX))
        },
        { passive: false }
      )
      fan.addEventListener('pointerdown', (e) => {
        this._startX = e.clientX
        this._dragged = false
      })
    }

    bindOnce() {
      this._bound = true
      const r = this.root
      r.addEventListener('click', (e) => {
        const t = e.target.closest(
          '[data-act],[data-cur],[data-i],[data-go],[data-view],[data-sort],[data-open],[data-more],[data-copy],[data-ftoggle],[data-filter],[data-fclear],[data-pick],[data-cmp-open],[data-cmp-close],[data-cmp-clear],[data-unpick]'
        )
        if (!t) {
          if (e.target.classList && e.target.classList.contains('dlg')) this.closeCompare()
          return
        }
        // 编辑模式：点在可编辑文字、输入框上时不展开/收起分组
        if (t.dataset.open != null && e.target.closest('[contenteditable],input,.tools')) return
        if (t.dataset.act != null) {
          if (!t.disabled) this.act(t.dataset.act, t)
          return
        }
        if (t.dataset.cur != null) {
          this._cur = t.dataset.cur
          return this.render()
        }
        if (t.dataset.pick != null) {
          const k = t.dataset.pick
          if (this.picks.has(k)) this.picks.delete(k)
          else if (this.picks.size < ModelPlaza.MAX_PICKS && this._reg.has(k)) this.picks.set(k, this._reg.get(k))
          else {
            t.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-3px)' }, { transform: 'translateX(3px)' }, { transform: 'translateX(0)' }], 240)
            return
          }
          this.refreshTree()
          this.updateTray()
        } else if (t.dataset.cmpOpen != null) this.openCompare()
        else if (t.dataset.cmpClose != null) this.closeCompare()
        else if (t.dataset.cmpClear != null) {
          this.picks.clear()
          this.refreshTree()
          this.updateTray()
        } else if (t.dataset.unpick != null) {
          this.picks.delete(t.dataset.unpick)
          this.refreshTree()
          this.updateTray()
          this.picks.size ? this.openCompare() : this.closeCompare()
        } else if (t.dataset.ftoggle != null) {
          this.filterOpen = !this.filterOpen
          this.refreshTree()
        } else if (t.dataset.filter != null) {
          const f = t.dataset.filter
          this.filters.has(f) ? this.filters.delete(f) : this.filters.add(f)
          this.refreshTree()
        } else if (t.dataset.fclear != null) {
          this.filters.clear()
          this.refreshTree()
        } else if (t.dataset.copy != null) {
          navigator.clipboard && navigator.clipboard.writeText(t.dataset.copy).catch(() => {})
          t.style.color = 'var(--save)'
          setTimeout(() => (t.style.color = ''), 900)
        } else if (t.dataset.more != null) {
          this.all = true
          this.refreshTree()
        } else if (t.dataset.i != null) {
          const i = +t.dataset.i
          if (i === this.center) r.querySelector('.branches').scrollIntoView({ behavior: 'smooth', block: 'start' })
          else if (!this._dragged) this.go(i)
        } else if (t.dataset.go != null) this.go(+t.dataset.go)
        else if (t.dataset.view) {
          this.view = t.dataset.view
          this.openKey = null
          this.render()
        } else if (t.dataset.sort) {
          this.sort = t.dataset.sort
          this.refreshTree()
        } else if (t.dataset.open != null) {
          this.all = false
          this.openKey = this.openKey === t.dataset.open ? '' : t.dataset.open
          this.refreshTree()
        }
      })
      window.addEventListener('pointerup', (e) => {
        if (this._startX == null) return
        const dx = e.clientX - this._startX
        this._startX = null
        if (Math.abs(dx) > 40) {
          this._dragged = true
          this.go(this.center - Math.round(dx / 110) || this.center - Math.sign(dx))
          setTimeout(() => (this._dragged = false), 0)
        }
      })
      window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') this.closeCompare()
        const inField = e.composedPath().some((n) => n.isContentEditable || n.tagName === 'INPUT')
        if (this.editing && !inField && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
          e.preventDefault()
          this.undo()
        }
      })
      // ---------- 编辑：文字、标签、挑选面板、导入 ----------
      r.addEventListener('focusin', (e) => {
        if (e.target.isContentEditable) this.snapshot()
      })
      r.addEventListener('input', (e) => {
        const el = e.target
        if (el.dataset && el.dataset.edit) this.onEditInput(el)
        else if (el.classList.contains('picker-q')) {
          this._pickerQ = el.value
          const pos = el.selectionStart
          this.refreshTree()
          const n = this.root.querySelector('.picker-q')
          if (n) {
            n.focus()
            n.setSelectionRange(pos, pos)
          }
        }
      })
      r.addEventListener('keydown', (e) => {
        const el = e.target
        if (el.dataset && el.dataset.edit === 'ch.title' && e.key === 'Enter') {
          e.preventDefault()
          el.blur()
        }
        if (el.dataset && el.dataset.tagInput != null) {
          if (e.key === 'Enter' && el.value.trim()) {
            const id = el.dataset.tagInput
            this.snapshot()
            const v = this.vendors[this.center]
            const ch = this.channelsOf(v).find((c) => c.id === id)
            const entry = id.startsWith('custom:') ? this.cfg.custom.find((g) => 'custom:' + g.id === id) : (this.cfg.channels[id] = this.cfg.channels[id] || {})
            const cur = entry.tags ?? ch.tags
            entry.tags = [...new Set([...cur, el.value.trim()])]
            this.saveDraft()
            this.refreshTree()
            const n = this.root.querySelector('.tag-in')
            if (n) n.focus()
          } else if (e.key === 'Escape') {
            this._tagInput = null
            this.refreshTree()
          }
        }
      })
      r.addEventListener('focusout', (e) => {
        const el = e.target
        if (el.dataset && el.dataset.tagInput != null) {
          setTimeout(() => {
            if (this._tagInput === el.dataset.tagInput && !this.root.activeElement?.classList.contains('tag-in')) {
              this._tagInput = null
              this.refreshTree()
            }
          }, 150)
        }
        if (el.isContentEditable && el.dataset.edit && el.dataset.edit.endsWith('.note') && !el.textContent.trim()) {
          this._noteOpen = null
          setTimeout(() => this.refreshTree(), 0)
        }
      })
      r.addEventListener('change', async (e) => {
        if (e.target.dataset && e.target.dataset.import != null && e.target.files[0]) {
          try {
            const cfg = normalizeCfg(JSON.parse(await e.target.files[0].text()))
            this.snapshot()
            this.cfg = cfg
            this.saveDraft()
            this.refreshTree()
            this.toast('已导入配置')
          } catch {
            this.toast('导入失败：不是有效的配置文件')
          }
          e.target.value = ''
        }
      })
      this._ro = new ResizeObserver(() => this.layoutFan())
      this._ro.observe(this)
    }

    refreshTree() {
      const pl = this.root.querySelector('.picker-list')
      const keep = pl ? pl.scrollTop : 0
      this.root.querySelector('.branches').innerHTML = this.branches(this.vendors[this.center])
      const pl2 = this.root.querySelector('.picker-list')
      if (pl2) pl2.scrollTop = keep
    }
  }

  if (!customElements.get('model-plaza')) customElements.define('model-plaza', ModelPlaza)
  window.ModelPlaza = { version: VERSION, normalize, parseExpr, basePrice, officialFor, normalizePerf }
})()
