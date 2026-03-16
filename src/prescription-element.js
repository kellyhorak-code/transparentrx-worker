function animateNumber(el,value){let start=0;const duration=600;const startTime=performance.now();function update(time){const progress=Math.min((time-startTime)/duration,1);const current=start+(value-start)*progress;el.textContent="$"+current.toFixed(2);if(progress<1){requestAnimationFrame(update)}}requestAnimationFrame(update)}

// TransparentRx Prescription Economics Web Component — build 2026-03-10c
// prescription-element.js — TransparentRx v3.1
// Upgrade trigger: fires 1.5s after first analysis completes — slide-up banner, non-blocking

const API = 'https://transparentrx-pricing.kellybhorak.workers.dev';

function normalizeNdc(ndc) {
  return (ndc || '').replace(/\D/g, '').padStart(11, '0');
}

// ─────────────────────────────────────────────────────────
//  BROWSER FINGERPRINT ENGINE
//  Canvas + WebGL + screen + timezone + hardware → SHA-256
//  Survives localStorage clear, cookie clear, cache wipe
// ─────────────────────────────────────────────────────────
async function getBrowserFingerprint() {
  const signals = [];

  // Canvas fingerprint
  try {
    const c = document.createElement('canvas');
    c.width = 200; c.height = 50;
    const ctx = c.getContext('2d');
    ctx.textBaseline = 'top';
    ctx.font = '14px Arial';
    ctx.fillStyle = '#f60';
    ctx.fillRect(125, 1, 62, 20);
    ctx.fillStyle = '#069';
    ctx.fillText('TransparentRx🔬', 2, 15);
    ctx.fillStyle = 'rgba(102,204,0,0.7)';
    ctx.fillText('TransparentRx🔬', 4, 17);
    signals.push(c.toDataURL());
  } catch(e) { signals.push('canvas_err'); }

  // WebGL renderer
  try {
    const c2 = document.createElement('canvas');
    const gl = c2.getContext('webgl') || c2.getContext('experimental-webgl');
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    signals.push(gl.getParameter(ext.UNMASKED_VENDOR_WEBGL));
    signals.push(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL));
  } catch(e) { signals.push('webgl_err'); }

  // Stable device signals
  signals.push(navigator.language || '');
  signals.push(navigator.platform || '');
  signals.push(String(navigator.hardwareConcurrency || 0));
  signals.push(String(screen.width) + 'x' + String(screen.height));
  signals.push(String(screen.colorDepth));
  signals.push(Intl.DateTimeFormat().resolvedOptions().timeZone || '');
  signals.push(String(window.devicePixelRatio || 1));

  // Hash everything together
  const raw = signals.join('|||');
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,'0')).join('');
}


class PrescriptionEconomics extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.isPremium    = false;
    this.demoUsed     = false;
    this.selectedDrug = '';
    this.duration     = 30;
    this.isPremium    = false;
    this.userEmail    = null;
    this.drugType     = 'generic';
  }

  connectedCallback() {
    this.demoUsed = localStorage.getItem('transparentrx_demo_used') === 'true';
    this.render();
    this.setupEventListeners();
  }

  render() {
    this.shadowRoot.innerHTML = `
      <style>
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;600&family=Inter:wght@300;400;500;600;700&display=swap');

        :host { display:block; width:100%; background:#000; font-family:'Inter',-apple-system,BlinkMacSystemFont,sans-serif; color:#fff; }

        .page { display:flex; flex-direction:column; align-items:center; padding:2rem 1rem; box-sizing:border-box; }
        .wrap { max-width:1680px; width:100%; margin:0 auto; }

        /* ── Header ── */
        .trx-header { text-align:center; margin-bottom:2rem; }
        .logo { font-size:2rem; font-weight:700; }
        .logo-transparent { color:#4CFC0F; }
        .logo-rx { background:#4CFC0F; color:#000; padding:.2rem .5rem; border-radius:8px; margin:0 2px; }
        .tagline { color:#555; font-size:.75rem; margin-top:.25rem; letter-spacing:.06em; text-transform:uppercase; }

        /* ── Dashboard ── */
        .dashboard { display:flex; flex-direction:column; gap:1.5rem; width:100%; }
        @media(min-width:768px) {
          .dashboard { flex-direction:row; align-items:flex-start; }
          .sidebar { width:360px; min-width:320px; position:sticky; top:1rem; }
          .main-panel { flex:1; min-width:0; }
        }
        @media(min-width:1200px) { .sidebar { width:420px; } }

        /* ── Sidebar ── */
        .sidebar { background:#060606; border:1px solid #181818; border-radius:24px; padding:1.75rem; }
        .sec-lbl {
          font-size:.58rem; font-weight:700; letter-spacing:.18em; text-transform:uppercase;
          color:#333; margin:1.5rem 0 .875rem; padding-bottom:.5rem;
          border-bottom:1px solid #141414; display:flex; align-items:center; gap:.5rem;
        }
        .sec-lbl::before { content:''; width:6px; height:6px; border-radius:50%; background:#4CFC0F; flex-shrink:0; }
        .sec-lbl:first-of-type { margin-top:0; }

        /* ── Input groups ── */
        .ig { margin-bottom:1.1rem; position:relative; }
        .ig label { display:block; font-size:.62rem; font-weight:600; text-transform:uppercase; letter-spacing:.1em; color:#444; margin-bottom:.5rem; }
        .ig input, .ig select {
          width:100%; padding:.8rem 1rem; background:#000; border:1px solid #1e1e1e;
          border-radius:60px; color:#fff; font-size:.9rem; font-family:'Inter',sans-serif;
          box-sizing:border-box; transition:border-color .2s, box-shadow .2s, background .2s;
          -webkit-appearance:none; appearance:none;
        }
        .ig select {
          background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath fill='%234CFC0F' d='M1 1l5 5 5-5'/%3E%3C/svg%3E");
          background-repeat:no-repeat; background-position:right 1rem center; padding-right:2.5rem; cursor:pointer;
        }
        .ig select option { background:#0a0a0a; color:#fff; }
        .ig select:disabled { opacity:.25; cursor:not-allowed; }

        /* Neon glow — while actively typing */
        .ig input.lit {
          border-color:#4CFC0F;
          box-shadow:0 0 0 3px rgba(76,252,15,.18), 0 0 20px rgba(76,252,15,.14);
          background:#010f01;
        }
        .ig input:focus {
          outline:none; border-color:#4CFC0F;
          box-shadow:0 0 0 3px rgba(76,252,15,.18), 0 0 20px rgba(76,252,15,.14);
          background:#010f01;
        }
        .ig select:focus { outline:none; border-color:#4CFC0F; box-shadow:0 0 0 3px rgba(76,252,15,.1); }

        /* ── Spinners ── */
        .nw { position:relative; }
        .nw input { padding-right:3rem; }
        input[type=number]::-webkit-inner-spin-button,
        input[type=number]::-webkit-outer-spin-button { -webkit-appearance:none; }
        input[type=number] { -moz-appearance:textfield; appearance:textfield; }
        .spins { position:absolute; right:8px; top:50%; transform:translateY(-50%); display:flex; flex-direction:column; gap:1px; }
        .sb { background:#0a0a0a; border:1px solid #1e1e1e; width:26px; height:20px; display:flex; align-items:center; justify-content:center; cursor:pointer; color:#444; font-size:9px; user-select:none; transition:all .15s; }
        .sb:first-child { border-radius:4px 4px 0 0; }
        .sb:last-child  { border-radius:0 0 4px 4px; }
        .sb:hover { background:#4CFC0F; color:#000; border-color:#4CFC0F; }

        /* ── Pill / form buttons ── */
        .pill-row { display:flex; flex-wrap:wrap; gap:.4rem; margin-top:.4rem; }
        .pb { padding:.4rem .8rem; background:#000; border:1px solid #1e1e1e; border-radius:60px; color:#555; cursor:pointer; font-size:.75rem; font-family:'Inter',sans-serif; transition:all .15s; }
        .pb:hover { border-color:#4CFC0F; color:#4CFC0F; }
        .pb.on { background:#4CFC0F; color:#000; border-color:#4CFC0F; font-weight:600; }

        /* ── Drug type toggle ── */
        .drug-type-wrap { display:none; margin-bottom:1.1rem; }
        .drug-type-wrap.show { display:block; animation:fadeSlide .35s ease; }
        @keyframes fadeSlide { from{opacity:0;transform:translateY(-4px)} to{opacity:1;transform:translateY(0)} }
        .drug-type-label { font-size:.62rem; font-weight:600; text-transform:uppercase; letter-spacing:.1em; color:#444; margin-bottom:.6rem; }
        .type-row { display:flex; background:#060606; border:1px solid #1e1e1e; border-radius:14px; padding:4px; }
        .tb { flex:1; padding:.65rem .5rem; border-radius:10px; background:transparent; border:none; color:#444; cursor:pointer; text-align:center; display:flex; flex-direction:column; align-items:center; gap:.2rem; transition:all .2s ease; font-family:'Inter',sans-serif; }
        .tb:hover { color:#fff; }
        .tb.on { background:#4CFC0F; color:#000; font-weight:700; box-shadow:0 2px 12px rgba(76,252,15,.35); animation:toggleGlow .25s ease; }
        @keyframes toggleGlow { 0%{box-shadow:0 0 0 rgba(76,252,15,0)} 100%{box-shadow:0 4px 14px rgba(76,252,15,.35)} }
        .tb-name { font-size:.82rem; font-weight:600; }
        .tb-sub { font-size:.6rem; opacity:.7; letter-spacing:.04em; text-transform:uppercase; }
        .tb.on .tb-sub { opacity:.6; }
        .price-delta-hint { margin-top:.5rem; padding:.45rem .85rem; background:rgba(76,252,15,.05); border:1px solid rgba(76,252,15,.15); border-radius:8px; font-size:.68rem; color:#4CFC0F; text-align:center; opacity:.85; }

        /* ── Duration buttons ── */
        .dur-row { display:flex; gap:.4rem; margin-top:.4rem; }
        .db { flex:1; padding:.6rem .4rem; background:#000; border:1px solid #1e1e1e; border-radius:10px; color:#555; cursor:pointer; font-size:.75rem; font-family:'Inter',sans-serif; text-align:center; transition:all .15s; }
        .db:hover { border-color:#4CFC0F; color:#4CFC0F; }
        .db.on { background:#4CFC0F; color:#000; border-color:#4CFC0F; font-weight:700; }
        .custom-dur { display:none; margin-top:.75rem; }
        .custom-dur.show { display:block; }

        /* ── Calc display ── */
        .cd { background:#000; border:1px solid #141414; border-radius:14px; padding:.8rem 1rem; }
        .cd-lbl { font-size:.58rem; color:#333; text-transform:uppercase; letter-spacing:.08em; margin-bottom:.2rem; }
        .cd-val { font-family:'IBM Plex Mono',monospace; font-size:1.25rem; font-weight:600; color:#4CFC0F; }
        .cd-unit { font-size:.72rem; color:#333; margin-left:.3rem; }

        /* ── CTA ── */
        .cta { width:100%; padding:1rem 2rem; background:#4CFC0F; color:#000; border:none; border-radius:60px; font-weight:700; font-size:.85rem; font-family:'Inter',sans-serif; cursor:pointer; text-transform:uppercase; letter-spacing:.07em; transition:all .3s; margin-top:1.25rem; }
        .cta:hover { background:#5eff20; transform:translateY(-2px); box-shadow:0 10px 24px -5px rgba(76,252,15,.35); }

        /* ── Autocomplete ── */
        .acd { display:none; position:absolute; top:calc(100% + 4px); left:0; right:0; background:#080808; border:1px solid #222; border-radius:16px; max-height:260px; overflow-y:auto; z-index:1000; box-shadow:0 20px 40px -10px rgba(0,0,0,.9); }
        .aci { padding:.8rem 1rem; cursor:pointer; border-bottom:1px solid #0e0e0e; color:#ddd; font-size:.875rem; transition:background .1s; }
        .aci:last-child { border-bottom:none; }
        .aci:hover { background:#0e0e0e; }
        .aci:hover strong { color:#4CFC0F; }
        .aci strong { transition:color .15s; }

        /* ── Error ── */
        .err { display:none; background:rgba(255,68,68,.08); border:1px solid rgba(255,68,68,.3); color:#ff6666; padding:.65rem 1rem; border-radius:60px; font-size:.78rem; text-align:center; margin-bottom:1rem; }

        /* ── Main panel ── */
        .main-panel { background:#060606; border:1px solid #181818; border-radius:24px; padding:2rem; min-height:500px; position:relative; }

        /* ── Loading overlay ── */
        .overlay { display:none; position:fixed; inset:0; background:rgba(0,0,0,.93); backdrop-filter:blur(10px); align-items:center; justify-content:center; z-index:9999; flex-direction:column; gap:1rem; }
        .spinner { width:44px; height:44px; border:3px solid #111; border-top-color:#4CFC0F; border-radius:50%; animation:spin .7s linear infinite; }
        @keyframes spin { to { transform:rotate(360deg); } }
        .overlay-txt { color:#4CFC0F; font-size:.8rem; letter-spacing:.08em; text-transform:uppercase; }

        /* ══════════════════════════════════════
           UPGRADE BANNER — slide up, non-blocking
        ══════════════════════════════════════ */
        .upgrade-banner {
          position:sticky;
          bottom:0;
          left:0; right:0;
          background:linear-gradient(135deg, #060f06, #020802);
          border:1px solid rgba(76,252,15,.25);
          border-radius:20px;
          padding:1.25rem 1.5rem;
          display:flex;
          align-items:center;
          justify-content:space-between;
          gap:1rem;
          flex-wrap:wrap;
          margin-top:1.5rem;
          box-shadow:0 -8px 40px -10px rgba(76,252,15,.15), 0 0 0 1px rgba(76,252,15,.08);

          /* Slide-up animation */
          transform:translateY(calc(100% + 2rem));
          opacity:0;
          transition:transform .6s cubic-bezier(.34,1.2,.64,1), opacity .4s ease;
        }
        .upgrade-banner.visible {
          transform:translateY(0);
          opacity:1;
        }

        .ub-left { display:flex; align-items:center; gap:1rem; flex:1; min-width:0; }
        .ub-pulse {
          width:10px; height:10px; border-radius:50%; background:#4CFC0F; flex-shrink:0;
          box-shadow:0 0 0 0 rgba(76,252,15,.4);
          animation:pulse 2s infinite;
        }
        @keyframes pulse {
          0%   { box-shadow:0 0 0 0 rgba(76,252,15,.4); }
          70%  { box-shadow:0 0 0 8px rgba(76,252,15,0); }
          100% { box-shadow:0 0 0 0 rgba(76,252,15,0); }
        }
        .ub-text {}
        .ub-title { font-size:.85rem; font-weight:600; color:#fff; margin-bottom:.15rem; }
        .ub-sub   { font-size:.75rem; color:#555; }

        .ub-right { display:flex; align-items:center; gap:.75rem; flex-shrink:0; }
        .ub-btn {
          padding:.65rem 1.5rem; background:#4CFC0F; color:#000; border:none;
          border-radius:60px; font-weight:700; font-size:.8rem; font-family:'Inter',sans-serif;
          cursor:pointer; white-space:nowrap; transition:all .25s;
          letter-spacing:.03em;
        }
        .ub-btn:hover { background:#5eff20; transform:translateY(-1px); box-shadow:0 6px 16px -4px rgba(76,252,15,.4); }
        .ub-email-wrap { display:flex; gap:.5rem; align-items:center; flex-wrap:wrap; }
        .ub-email-input {
          padding:.6rem 1rem; background:#0a0a0a; border:1px solid #2a2a2a;
          border-radius:60px; color:#fff; font-size:.82rem; font-family:'Inter',sans-serif;
          width:200px; transition:border-color .2s, box-shadow .2s;
        }
        .ub-email-input:focus { outline:none; border-color:#4CFC0F; box-shadow:0 0 0 3px rgba(76,252,15,.15); }
        .ub-email-input::placeholder { color:#444; }
        .ub-dismiss {
          color:#333; font-size:1rem; cursor:pointer; padding:.25rem; line-height:1;
          transition:color .2s; flex-shrink:0;
        }
        .ub-dismiss:hover { color:#666; }

        /* ══════════════════════════════════════
           ECONOMICS — Museum Grade
        ══════════════════════════════════════ */

        /* Initial */
        .init h2 { color:#4CFC0F; font-size:1.9rem; margin-bottom:.75rem; font-weight:700; }
        .init p { color:#555; line-height:1.65; font-size:.9rem; max-width:560px; margin-bottom:2rem; }
        .vp-grid { display:grid; gap:.75rem; }
        .vp { background:#000; border:1px solid #141414; border-radius:14px; padding:1.25rem; }
        .vp h3 { color:#4CFC0F; font-size:.85rem; font-weight:600; margin-bottom:.35rem; }
        .vp p  { color:#444; font-size:.78rem; margin:0; line-height:1.5; }

        /* Section header */
        .sec-hd { font-size:.58rem; font-weight:700; letter-spacing:.2em; text-transform:uppercase; color:#4CFC0F; margin-bottom:1.25rem; display:flex; align-items:center; gap:.75rem; }
        .sec-hd::after { content:''; flex:1; height:1px; background:linear-gradient(90deg,rgba(76,252,15,.2),transparent); }

        /* ── 1. TruePrice Range Bar ── */
        .rbox { background:#000; border:1px solid #181818; border-radius:20px; padding:1.75rem; margin-bottom:1.5rem; position:relative; overflow:hidden; }
        .rbox::before { content:''; position:absolute; top:-80px; left:50%; transform:translateX(-50%); width:500px; height:200px; background:radial-gradient(ellipse, rgba(76,252,15,.04) 0%, transparent 70%); pointer-events:none; }
        .rbox-top { display:flex; justify-content:space-between; align-items:center; margin-bottom:1.5rem; }
        .conf { font-size:.68rem; padding:.25rem .875rem; border:1px solid #4CFC0F; border-radius:20px; color:#4CFC0F; background:rgba(76,252,15,.06); }
        .markup-pill { font-size:.68rem; padding:.25rem .875rem; border:1px solid #ff8c00; border-radius:20px; color:#ff8c00; background:rgba(255,140,0,.06); }
        .drug-lbl { font-size:.8rem; color:#666; font-style:italic; }

        .track-wrap { position:relative; margin:1.5rem 0 .75rem; }
        .track { height:14px; border-radius:7px; background:linear-gradient(90deg,#4CFC0F 0%,#a8e063 25%,#ffaa00 55%,#ff6b00 78%,#ff4444 100%); box-shadow:0 0 24px rgba(76,252,15,.1); position:relative; }

        .udot-wrap { position:absolute; top:-10px; transform:translateX(-50%); display:flex; flex-direction:column; align-items:center; z-index:10; transition:left .8s cubic-bezier(.34,1.56,.64,1); }
        .udot { width:32px; height:32px; border-radius:50%; background:#fff; border:3px solid #000; box-shadow:0 0 0 2px #fff, 0 4px 16px rgba(0,0,0,.6); }
        .udot-tag { position:absolute; top:-26px; left:50%; transform:translateX(-50%); background:#fff; color:#000; font-size:.6rem; font-weight:700; padding:.1rem .45rem; border-radius:4px; white-space:nowrap; }
        .udot-tag::after { content:''; position:absolute; bottom:-4px; left:50%; transform:translateX(-50%); border:4px solid transparent; border-top-color:#fff; }
        .tdot-wrap { position:absolute; top:-4px; transform:translateX(-50%); display:flex; flex-direction:column; align-items:center; z-index:9; transition:left .8s cubic-bezier(.34,1.56,.64,1); pointer-events:none; }
        .tdot { width:6px; height:22px; background:#4CFC0F; border-radius:3px; box-shadow:0 0 8px rgba(76,252,15,.6); }
        .tdot-tag { position:absolute; top:26px; left:50%; transform:translateX(-50%); color:#4CFC0F; font-size:.55rem; font-weight:700; white-space:nowrap; letter-spacing:.03em; }

        .rlabels { display:flex; justify-content:space-between; margin-top:.75rem; }
        .rlabel-col { display:flex; flex-direction:column; gap:.2rem; }
        .rlabel-col:nth-child(2) { align-items:center; }
        .rlabel-col:last-child { align-items:flex-end; }
        .rl-tag { font-size:.6rem; color:#444; letter-spacing:.05em; }
        .rl-val { font-family:'IBM Plex Mono',monospace; font-size:1.1rem; font-weight:600; }
        .rl-val.g { color:#4CFC0F; }
        .rl-val.a { color:#ffaa00; }
        .rl-val.r { color:#ff4444; }

        .rstats { display:grid; grid-template-columns:1fr 1fr 1fr; gap:1px; background:#141414; border-radius:14px; overflow:hidden; margin-top:1.25rem; }
        .rsc { background:#000; padding:1rem; text-align:center; }
        .rsc-lbl { font-size:.58rem; color:#333; text-transform:uppercase; letter-spacing:.08em; margin-bottom:.35rem; }
        .rsc-val { font-family:'IBM Plex Mono',monospace; font-size:1.1rem; font-weight:600; }
        .rsc-sub { font-size:.65rem; color:#2a2a2a; margin-top:.2rem; }

        /* ── 2. Waterfall ── */
        .wbox { background:#000; border:1px solid #181818; border-radius:20px; padding:1.75rem; margin-bottom:1.5rem; }
        .wbox-title { font-size:.58rem; font-weight:700; letter-spacing:.15em; text-transform:uppercase; color:#4CFC0F; margin-bottom:1.5rem; }
        .wlayout { display:flex; gap:2rem; align-items:flex-end; }
        .wbars { flex:0 0 100px; display:flex; flex-direction:column-reverse; gap:2px; }
        .wbar { border-radius:2px; }
        .wlayers { flex:1; display:flex; flex-direction:column; gap:.5rem; }
        .wl { display:flex; align-items:center; gap:.75rem; padding:.7rem 1rem; background:#060606; border:1px solid #0e0e0e; border-radius:12px; transition:border-color .2s; }
        .wl:hover { border-color:#1a1a1a; }
        .wsw { width:10px; height:10px; border-radius:2px; flex-shrink:0; }
        .wi { flex:1; min-width:0; }
        .wn { font-size:.8rem; color:#ccc; text-align:left; }
        .wd { font-size:.62rem; color:#333; margin-top:.1rem; }
        .wv { font-family:'IBM Plex Mono',monospace; font-size:.875rem; font-weight:600; }
        .wp { font-size:.62rem; color:#333; margin-left:.3rem; }

        .fmv-line { height:1px; background:rgba(76,252,15,.25); margin:1rem 0; position:relative; }
        .fmv-tag { position:absolute; right:0; top:-10px; font-size:.62rem; color:#4CFC0F; background:rgba(76,252,15,.08); border:1px solid rgba(76,252,15,.15); padding:.12rem .5rem; border-radius:4px; }

        .ez { display:flex; justify-content:space-between; align-items:center; background:rgba(255,68,68,.04); border:1px solid rgba(255,68,68,.1); border-radius:10px; padding:.75rem 1rem; margin-top:.75rem; }
        .ez-lbl { font-size:.68rem; color:#cc5555; }
        .ez-val { font-family:'IBM Plex Mono',monospace; font-size:1rem; font-weight:600; color:#ff4444; }

        /* ── 3. Break-Even ── */
        .bbox { background:linear-gradient(135deg,#040a04,#000); border:1px solid #1e2a1e; border-radius:20px; padding:1.75rem; position:relative; overflow:hidden; }
        .bbox::before { content:''; position:absolute; top:-100px; left:-100px; width:400px; height:400px; background:radial-gradient(circle, rgba(76,252,15,.05) 0%, transparent 60%); pointer-events:none; }
        .bbox-title { font-size:.58rem; font-weight:700; letter-spacing:.15em; text-transform:uppercase; color:#4CFC0F; margin-bottom:1.5rem; }

        .bestats { display:grid; grid-template-columns:repeat(3,1fr); gap:1px; background:#141414; border-radius:16px; overflow:hidden; margin-bottom:1.5rem; }
        .besc { background:#030803; padding:1.5rem 1rem; text-align:center; }
        .besc-ico { font-size:1.1rem; margin-bottom:.5rem; }
        .besc-lbl { font-size:.58rem; color:#333; text-transform:uppercase; letter-spacing:.08em; margin-bottom:.5rem; }
        .besc-val { font-family:'IBM Plex Mono',monospace; font-size:1.5rem; font-weight:600; line-height:1; }
        .besc-sub { font-size:.62rem; color:#333; margin-top:.3rem; line-height:1.4; }
        .grn { color:#4CFC0F; }
        .wht { color:#fff; }

        .tline-wrap { margin:1rem 0; }
        .tline-lbl { font-size:.6rem; color:#333; text-transform:uppercase; letter-spacing:.08em; margin-bottom:.5rem; }
        .tline { height:6px; background:#0a0a0a; border-radius:3px; overflow:hidden; }
        .tline-fill { height:100%; background:#4CFC0F; border-radius:3px; transition:width .9s cubic-bezier(.34,1.56,.64,1); box-shadow:0 0 10px rgba(76,252,15,.35); }
        .tmarks { display:flex; justify-content:space-between; margin-top:.4rem; }
        .tmark { font-size:.62rem; color:#2a2a2a; }
        .tmark.hi { color:#4CFC0F; }

        .net-msg { text-align:center; padding:.875rem 1rem; border-radius:12px; font-size:.82rem; }
        .net-pos { background:rgba(76,252,15,.04); border:1px solid rgba(76,252,15,.1); color:#4CFC0F; }
        .net-neu { background:rgba(255,170,0,.04); border:1px solid rgba(255,170,0,.1); color:#ffaa00; }

        /* ── Not found ── */
        .nf { background:rgba(255,68,68,.04); border:1px solid rgba(255,68,68,.15); border-radius:16px; padding:2rem; text-align:center; }
        .nf h3 { color:#ff5555; margin-bottom:.5rem; }
        .nf p  { color:#666; font-size:.825rem; }

        /* ── Disclaimer ── */
        .disc { font-size:.62rem; color:#222; text-align:center; margin-top:2rem; padding-top:1rem; border-top:1px solid #0e0e0e; }


        /* ══════════════════════════════════════
           EMAIL GATE — blocks reuse, converts abusers
        ══════════════════════════════════════ */
        .gate-overlay {
          display:none;
          position:absolute; inset:0;
          background:rgba(0,0,0,.92);
          backdrop-filter:blur(12px);
          border-radius:24px;
          z-index:100;
          align-items:center;
          justify-content:center;
          padding:2rem;
        }
        .gate-overlay.show { display:flex; }
        .gate-box {
          max-width:420px; width:100%;
          background:#060606;
          border:1px solid #2a2a2a;
          border-radius:20px;
          padding:2rem;
          text-align:center;
        }
        .gate-ico { font-size:2.5rem; margin-bottom:1rem; }
        .gate-title { font-size:1.2rem; font-weight:700; color:#fff; margin-bottom:.5rem; }
        .gate-sub { font-size:.825rem; color:#555; margin-bottom:1.75rem; line-height:1.6; }
        .gate-input {
          width:100%; padding:.875rem 1.25rem;
          background:#000; border:1px solid #1e1e1e;
          border-radius:60px; color:#fff; font-size:.9rem;
          font-family:'Inter',sans-serif; box-sizing:border-box;
          margin-bottom:.875rem; text-align:center;
          transition:border-color .2s, box-shadow .2s;
        }
        .gate-input:focus { outline:none; border-color:#4CFC0F; box-shadow:0 0 0 3px rgba(76,252,15,.15); }
        .gate-btn {
          width:100%; padding:.875rem; background:#4CFC0F; color:#000;
          border:none; border-radius:60px; font-weight:700; font-size:.9rem;
          font-family:'Inter',sans-serif; cursor:pointer; transition:all .25s;
          margin-bottom:.75rem;
        }
        .gate-btn:hover { background:#5eff20; }
        .gate-btn:disabled { background:#1a1a1a; color:#333; cursor:not-allowed; }
        .gate-msg { font-size:.78rem; margin-top:.5rem; min-height:1.2em; }
        .gate-msg.ok  { color:#4CFC0F; }
        .gate-msg.err { color:#ff5555; }
        .gate-upgrade-note {
          font-size:.72rem; color:#333; margin-top:1rem;
          border-top:1px solid #141414; padding-top:1rem;
        }
        .gate-upgrade-note a { color:#4CFC0F; cursor:pointer; }

        @media(max-width:500px) {
          .bestats { grid-template-columns:1fr; }
          .rstats  { grid-template-columns:1fr 1fr; }
          .wlayout { flex-direction:column; }
          .wbars   { width:100%; flex-direction:row; align-items:flex-end; height:80px; }
          .upgrade-banner { flex-direction:column; align-items:flex-start; }
        }
      </style>

      <!-- Loading -->
      <div class="overlay" id="overlay">
        <div class="spinner"></div>
        <div class="overlay-txt">Analyzing pricing layers…</div>
      </div>

      <div class="page">
        <div class="wrap">

          <div class="trx-header">
            <div class="logo">
              <span class="logo-transparent">Transparent</span><span class="logo-rx">RX</span>.io
            </div>
            <div class="tagline">TruePrice™ intelligence · break-even analytics</div>
          </div>

          <div class="dashboard">

            <!-- ═══ SIDEBAR ═══ -->
            <div class="sidebar">
              <div class="err" id="errMsg"></div>

              <div class="sec-lbl">Medication</div>

              <div class="ig">
                <label>Drug Name</label>
                <input id="drugIn" type="text" placeholder="Search medication…" autocomplete="off" spellcheck="false">
                <div class="acd" id="acd"></div>
              </div>

              <div class="drug-type-wrap" id="drugTypeWrap">
                <div class="drug-type-label">Generic / Brand</div>
                <div class="type-row">
                  <div class="tb on" data-t="generic">
                    <span class="tb-name">Generic</span>
                    <span class="tb-sub" id="genericSub">—</span>
                  </div>
                  <div class="tb" data-t="brand">
                    <span class="tb-name">Brand</span>
                    <span class="tb-sub" id="brandSub">—</span>
                  </div>
                </div>
                <div class="price-delta-hint" id="priceDeltaHint">⚡ Brand drugs average 8–10× higher than generic equivalents</div>
              </div>

              <div class="ig">
                <label>Dosage Form</label>
                <div class="pill-row" id="doseForm">
                  <div class="pb on" data-f="tablet">Tablet</div>
                  <div class="pb" data-f="capsule">Capsule</div>
                  <div class="pb" data-f="liquid">Liquid</div>
                  <div class="pb" data-f="inhaler">Inhaler</div>
                  <div class="pb" data-f="patch">Patch</div>
                  <div class="pb" data-f="cream">Cream</div>
                </div>
              </div>

              <div class="ig">
                <label>Dosage Strength</label>
                <select id="strSel" disabled>
                  <option value="">Search drug first…</option>
                </select>
              </div>

              <div class="sec-lbl">Prescription Details</div>

              <div class="ig">
                <label>Prescription Duration</label>
                <div class="dur-row">
                  <div class="db on" data-d="30">30 days</div>
                  <div class="db" data-d="90">90 days</div>
                  <div class="db" data-d="custom">Custom</div>
                </div>
                <div class="custom-dur" id="customDurWrap">
                  <input id="customDur" type="number" placeholder="Enter days…" min="1" max="365">
                </div>
              </div>

              <div class="ig">
                <label>Units Per Day</label>
                <div class="nw">
                  <input id="daily" type="number" value="1" min="0.25" max="10" step="0.25">
                  <div class="spins">
                    <div class="sb" id="dUp">▲</div>
                    <div class="sb" id="dDown">▼</div>
                  </div>
                </div>
              </div>

              <div class="ig">
                <label>Your Current Price ($)</label>
                <input id="userPrice" type="number" placeholder="0.00" value="18.00" step="0.01" min="0">
              </div>

              <div class="sec-lbl">Calculated</div>

              <div class="ig">
                <label>Quantity Per Fill</label>
                <div class="cd" id="qtyDisp">
                  <div class="cd-lbl">auto-calculated</div>
                  <span class="cd-val">30</span><span class="cd-unit">units</span>
                </div>
              </div>

              <button class="cta" id="analyzeBtn">Generate TruePrice™ Analysis</button>
            </div>

            <!-- ═══ MAIN PANEL ═══ -->
            <div class="main-panel" id="mainPanel">

              <!-- Initial state -->
              <div class="init" id="initV">
                <h2>TruePrice™ Intelligence</h2>
                <p>See through the pricing layers. We reveal acquisition costs, pharmacy margins, PBM spreads, and extraction zones — then compute your exact economic position against fair market value.</p>
                <div class="vp-grid">
                  <div class="vp"><h3>TruePrice™ Range</h3><p>Live market range from acquisition cost to retail ceiling — with your price positioned on the spectrum.</p></div>
                  <div class="vp"><h3>Price Layer Decomposition</h3><p>Every dollar explained: from what the pharmacy paid to what they charged you, layer by layer.</p></div>
                  <div class="vp"><h3>Break-Even Economics</h3><p>The exact day TransDex™ pays for itself. Net monthly and annual gain from your specific scenario.</p></div>
                </div>
              </div>

              <!-- Results -->
              <div id="resV" style="display:none;">

                <div class="sec-hd">TruePrice™ Market Range</div>
                <div class="rbox">
                  <div class="rbox-top">
                    <span class="conf" id="confBadge">⬤ High Confidence</span>
                    <span class="markup-pill" id="markupPill" style="display:none;"></span>
                    <span class="drug-lbl" id="drugLbl">—</span>
                  </div>
                  <div class="track-wrap">
                    <div class="track" id="track">
                      <div class="udot-wrap" id="udot" style="left:60%">
                        <div class="udot-tag">You</div>
                        <div class="udot"></div>
                      </div>
                      <div class="tdot-wrap" id="tdot" style="left:50%">
                        <div class="tdot"></div>
                        <div class="tdot-tag">TruePrice™</div>
                      </div>
                    </div>
                    <div class="rlabels">
                      <div class="rlabel-col" id="rlLowCol">
                        <span class="rl-tag">Acquisition Low</span>
                        <span class="rl-val g" id="rlLow">—</span>
                      </div>
                      <div class="rlabel-col">
                        <span class="rl-tag">TruePrice™</span>
                        <span class="rl-val a" id="rlTdi">—</span>
                      </div>
                      <div class="rlabel-col" id="rlHighCol">
                        <span class="rl-tag">Market High</span>
                        <span class="rl-val r" id="rlHigh">—</span>
                      </div>
                    </div>
                  </div>
                  <div class="rstats">
                    <div class="rsc">
                      <div class="rsc-lbl">Per Unit — Low</div>
                      <div class="rsc-val g" id="rscPillLow">—</div>
                      <div class="rsc-sub">acquisition basis</div>
                    </div>
                    <div class="rsc">
                      <div class="rsc-lbl">TruePrice™</div>
                      <div class="rsc-val a" id="rscPillTdi">—</div>
                      <div class="rsc-sub">fair market value</div>
                    </div>
                    <div class="rsc">
                      <div class="rsc-lbl">Per Unit — High</div>
                      <div class="rsc-val r" id="rscPillHigh">—</div>
                      <div class="rsc-sub">market ceiling</div>
                    </div>
                  </div>
                </div>

                <div class="sec-hd">Price Layer Decomposition</div>
                <div class="wbox">
                  <div class="wbox-title">What You Pay — Every Layer Revealed</div>
                  <div class="wlayout">
                    <div class="wbars" id="wBars"></div>
                    <div class="wlayers" id="wLayers"></div>
                  </div>
                  <div id="fmvLine" style="display:none;"><div class="fmv-line"><span class="fmv-tag">TruePrice™ threshold</span></div></div>
                  <div class="ez" id="ezBox" style="display:none;">
                    <div class="ez-lbl">Extraction Zone — above TruePrice™</div>
                    <div>
                      <span class="ez-val" id="ezVal">—</span>
                      <span style="font-size:.62rem;color:#444;margin-left:.35rem;">per fill</span>
                    </div>
                  </div>
                </div>

                <div class="sec-hd">Break-Even Economics</div>
                <div class="bbox">
                  <div class="bbox-title">Your TransDex™ Plan ROI — $12/month</div>
                  <div class="bestats" id="beStats"></div>
                  <div class="tline-wrap">
                    <div class="tline-lbl">Monthly savings timeline</div>
                    <div class="tline"><div class="tline-fill" id="tFill" style="width:0%"></div></div>
                    <div class="tmarks">
                      <span class="tmark">Day 1</span>
                      <span class="tmark hi" id="beMarker">—</span>
                      <span class="tmark">Day 30</span>
                    </div>
                  </div>
                  <div class="net-msg" id="netMsg"></div>
                </div>

                <!-- ── UPGRADE BANNER — slides up 1.5s after results render ── -->
                <div class="upgrade-banner" id="upgradeBanner">
                  <div class="ub-left">
                    <div class="ub-pulse"></div>
                    <div class="ub-text">
                      <div class="ub-title">Your free analysis is complete</div>
                      <div class="ub-sub">Unlock unlimited TruePrice™ — most members save more than the annual cost on a single prescription</div>
                    </div>
                  </div>
                  <div class="ub-right">
                    <button class="ub-btn" id="upgradeBtn">See Plans →</button>
                    <span class="ub-dismiss" id="dismissBanner" title="Dismiss">✕</span>
                  </div>
                </div>

                <!-- Pricing modal -->
                <div id="pricingModal" style="display:none;position:fixed;inset:0;z-index:10000;background:rgba(0,0,0,.85);backdrop-filter:blur(4px);display:none;align-items:center;justify-content:center;padding:1rem;">
                  <div style="background:#111;border:1px solid #222;border-radius:16px;max-width:520px;width:100%;padding:2rem;position:relative;">
                    <button id="closePricing" style="position:absolute;top:1rem;right:1rem;background:none;border:none;color:#555;font-size:1.25rem;cursor:pointer;">✕</button>
                    <div style="text-align:center;margin-bottom:1.5rem;">
                      <div style="font-size:.7rem;letter-spacing:.12em;color:#4CFC0F;font-weight:700;margin-bottom:.5rem;">TRANSPARENTRX PREMIUM</div>
                      <h2 style="font-size:1.4rem;font-weight:800;margin:0 0 .4rem;">Know what your drugs actually cost</h2>
                      <p style="color:#666;font-size:.85rem;margin:0;">Unlimited TruePrice™ lookups. Cancel anytime.</p>
                    </div>
                    <!-- Plans -->
                    <div style="display:grid;grid-template-columns:1fr 1fr;gap:.75rem;margin-bottom:1.25rem;">
                      <!-- Monthly -->
                      <div id="planMonthly" class="plan-card" data-plan="monthly" style="border:1px solid #333;border-radius:10px;padding:1rem;cursor:pointer;transition:border-color .15s;">
                        <div style="font-size:.65rem;letter-spacing:.1em;color:#888;font-weight:700;margin-bottom:.4rem;">MONTHLY</div>
                        <div style="font-size:1.6rem;font-weight:800;line-height:1;">$12</div>
                        <div style="font-size:.75rem;color:#555;margin-top:.2rem;">per month</div>
                      </div>
                      <!-- Annual — highlighted -->
                      <div id="planAnnual" class="plan-card plan-selected" data-plan="annual" style="border:1px solid #4CFC0F;border-radius:10px;padding:1rem;cursor:pointer;position:relative;background:rgba(76,252,15,.04);">
                        <div style="position:absolute;top:-.6rem;left:50%;transform:translateX(-50%);background:#4CFC0F;color:#000;font-size:.6rem;font-weight:800;padding:.15rem .5rem;border-radius:20px;letter-spacing:.06em;white-space:nowrap;">BEST VALUE</div>
                        <div style="font-size:.65rem;letter-spacing:.1em;color:#4CFC0F;font-weight:700;margin-bottom:.4rem;">ANNUAL</div>
                        <div style="font-size:1.6rem;font-weight:800;line-height:1;">$8.33</div>
                        <div style="font-size:.75rem;color:#555;margin-top:.2rem;">per month · $99.99/yr</div>
                      </div>
                    </div>
                    <!-- Email field -->
                    <input id="checkoutEmail" type="email" placeholder="your@email.com" autocomplete="email"
                      style="width:100%;box-sizing:border-box;padding:.75rem 1rem;background:#1a1a1a;border:1px solid #333;border-radius:8px;color:#fff;font-size:.9rem;margin-bottom:.75rem;outline:none;">
                    <button id="checkoutBtn" style="width:100%;padding:.875rem;background:#4CFC0F;color:#000;border:none;border-radius:8px;font-weight:800;font-size:1rem;cursor:pointer;letter-spacing:-.01em;">
                      Start Subscription →
                    </button>
                    <p style="text-align:center;color:#444;font-size:.72rem;margin-top:.75rem;">
                      Secure checkout via Stripe · Cancel anytime · No hidden fees
                    </p>
                    <!-- Already have account -->
                    <div style="border-top:1px solid #222;margin-top:1rem;padding-top:1rem;text-align:center;">
                      <span style="color:#555;font-size:.78rem;">Already a member? </span>
                      <button id="loginLink" style="background:none;border:none;color:#4CFC0F;font-size:.78rem;cursor:pointer;text-decoration:underline;">Send me a login link</button>
                    </div>
                  </div>
                </div>

              </div><!-- /resV -->

              <!-- Not found -->
              <div id="nfV" style="display:none;">
                <div class="nf">
                  <h3>Drug not found in TruePrice™ database</h3>
                  <p>Try the generic name (e.g. "metformin" not "Glucophage"). Our engine will research this medication.</p>
                </div>
              </div>


              <!-- ── EMAIL GATE OVERLAY ── -->
              <div class="gate-overlay" id="gateOverlay">
                <div class="gate-box">
                  <div class="gate-ico">🔒</div>
                  <div class="gate-title" id="gateTitle">You've used your free analysis</div>
                  <div class="gate-sub" id="gateSub">
                    Enter your email to continue. If you're a TransDex™ subscriber, you'll be unlocked instantly.
                  </div>
                  <input class="gate-input" type="email" id="gateEmail" placeholder="your@email.com" autocomplete="email">
                  <button class="gate-btn" id="gateSubmitBtn">Continue →</button>
                  <div class="gate-msg" id="gateMsg"></div>
                  <div class="gate-upgrade-note">
                    Not a subscriber? <a id="gateUpgradeLink">Unlock unlimited access for $9.99/mo →</a>
                  </div>
                </div>
              </div>

            </div><!-- /main-panel -->
          </div><!-- /dashboard -->

          <div class="disc">
            TruePrice™ estimates based on NADAC (CMS), AWP benchmarks, and live retail market data across 18,000+ price observations.
            Not medical advice. Prices vary by pharmacy and insurance plan.
          </div>

        </div>
      </div>
    `;
  }

  // ─────────────────────────────────────────
  //  EVENT LISTENERS
  // ─────────────────────────────────────────
  setupEventListeners() {
    const sr = this.shadowRoot;

    // Neon glow helpers
    const litUp   = el => el.classList.add('lit');
    const litDown = el => el.classList.remove('lit');

    // Drug input
    const drugIn = sr.getElementById('drugIn');
    let st;
    drugIn.addEventListener('focus', () => litUp(drugIn));
    drugIn.addEventListener('blur',  () => { litDown(drugIn); setTimeout(() => this.hideAc(), 200); });
    drugIn.addEventListener('input', () => { clearTimeout(st); st = setTimeout(() => this.fetchDrugs(), 280); });

    // Manual number/price inputs
    ['userPrice','daily','customDur'].forEach(id => {
      const el = sr.getElementById(id);
      if (!el) return;
      el.addEventListener('focus', () => litUp(el));
      el.addEventListener('blur',  () => litDown(el));
      el.addEventListener('input', () => this.recalc());
    });

    // ── Check session on load
    this._checkSession();

    // ── Handle Stripe return
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('payment') === 'success') {
      // Clean URL
      const clean = new URL(window.location.href);
      clean.searchParams.delete('payment');
      clean.searchParams.delete('email');
      window.history.replaceState({}, '', clean.toString());
      // Show success message
      setTimeout(() => {
        const sr2 = this.shadowRoot;
        if (!sr2) return;
        const banner = sr2.getElementById('upgradeBanner');
        if (banner) {
          banner.style.background = 'rgba(76,252,15,.08)';
          banner.style.borderColor = '#4CFC0F';
          banner.querySelector('.ub-title').textContent = '🎉 Welcome to TransparentRx Premium';
          banner.querySelector('.ub-sub').textContent   = 'Check your email — your login link is on its way.';
          const right = banner.querySelector('.ub-right');
          if (right) right.innerHTML = '';
          banner.style.transform = 'translateY(0)';
        }
      }, 500);
    }

    // ── Triple-click dev tools (3 clicks within 1.5s)
    let _clicks = 0, _ct = null;
    this.addEventListener('click', () => {
      _clicks++;
      clearTimeout(_ct);
      _ct = setTimeout(() => { _clicks = 0; }, 1500);
      if (_clicks >= 3) {
        _clicks = 0;
        const existing = document.getElementById('_trxDev');
        if (existing) { existing.remove(); return; }
        const ov = document.createElement('div');
        ov.id = '_trxDev';
        ov.style.cssText = 'position:fixed;bottom:1.5rem;right:1.5rem;z-index:99999;background:#111;border:1px solid #4CFC0F;border-radius:12px;padding:1rem 1.25rem;font-family:monospace;font-size:.78rem;color:#fff;box-shadow:0 8px 32px rgba(0,0,0,.6);min-width:200px;';
        ov.innerHTML = `
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.75rem;">
            <span style="color:#4CFC0F;font-weight:700;">⚙ TRX Dev</span>
            <span onclick="document.getElementById('_trxDev').remove()" style="cursor:pointer;color:#555;font-size:1rem;">✕</span>
          </div>
          <button onclick="location.reload(true)" style="width:100%;padding:.4rem;background:#4CFC0F;color:#000;border:none;border-radius:6px;font-weight:700;cursor:pointer;margin-bottom:.5rem;">🔄 Hard Reload</button>
          <button onclick="localStorage.clear();sessionStorage.clear();location.reload(true)" style="width:100%;padding:.4rem;background:#222;color:#fff;border:1px solid #333;border-radius:6px;cursor:pointer;margin-bottom:.5rem;">🗑 Clear Storage + Reload</button>
          <button onclick="document.cookie.split(';').forEach(c=>{document.cookie=c.replace(/^ +/,'').replace(/=.*/,'=;expires='+new Date().toUTCString()+';path=/')}); location.reload(true)" style="width:100%;padding:.4rem;background:#222;color:#fff;border:1px solid #333;border-radius:6px;cursor:pointer;margin-bottom:.75rem;">🍪 Clear Cookies + Reload</button>
          <div style="color:#333;font-size:.68rem;text-align:center;">triple-click to close</div>
        `;
        document.body.appendChild(ov);
      }
    });

    // Strength — NDC read directly from dropdown in analyze()

    // Drug type — wired via setupDrugTypeToggle
    this.setupDrugTypeToggle();

    // Dosage form
    sr.querySelectorAll('.pb').forEach(b => {
      b.addEventListener('click', () => {
        sr.querySelectorAll('.pb').forEach(x => x.classList.remove('on'));
        b.classList.add('on');
      });
    });

    // Duration
    sr.querySelectorAll('.db').forEach(b => {
      b.addEventListener('click', () => {
        sr.querySelectorAll('.db').forEach(x => x.classList.remove('on'));
        b.classList.add('on');
        const cw = sr.getElementById('customDurWrap');
        if (b.dataset.d === 'custom') {
          cw.classList.add('show');
          sr.getElementById('customDur').focus();
        } else {
          cw.classList.remove('show');
          this.duration = parseInt(b.dataset.d);
          this.recalc();
        }
      });
    });

    // Daily spinners
    sr.getElementById('dUp').addEventListener('click', () => {
      const el = sr.getElementById('daily');
      el.value = Math.min(10, Math.round((parseFloat(el.value)+.25)*4)/4);
      this.recalc();
    });
    sr.getElementById('dDown').addEventListener('click', () => {
      const el = sr.getElementById('daily');
      el.value = Math.max(.25, Math.round((parseFloat(el.value)-.25)*4)/4);
      this.recalc();
    });

    // Analyze
    sr.getElementById('analyzeBtn').addEventListener('click', () => this.analyze());

    // Upgrade banner CTA — submit email then redirect to upgrade
    // ── Pricing modal interactions
    let selectedPlan = 'annual';

    const showPricingModal = () => {
      const modal = sr.getElementById('pricingModal');
      if (modal) { modal.style.display = 'flex'; }
    };

    sr.getElementById('upgradeBtn').addEventListener('click', showPricingModal);

    sr.getElementById('closePricing')?.addEventListener('click', () => {
      const modal = sr.getElementById('pricingModal');
      if (modal) modal.style.display = 'none';
    });

    // Plan card toggle
    sr.querySelectorAll('.plan-card').forEach(card => {
      card.addEventListener('click', () => {
        selectedPlan = card.dataset.plan;
        sr.querySelectorAll('.plan-card').forEach(c => {
          c.style.borderColor = c.dataset.plan === selectedPlan ? '#4CFC0F' : '#333';
          c.style.background  = c.dataset.plan === selectedPlan ? 'rgba(76,252,15,.04)' : '';
        });
      });
    });

    // Checkout button
    sr.getElementById('checkoutBtn').addEventListener('click', async () => {
      const email = (sr.getElementById('checkoutEmail')?.value || '').trim();
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        sr.getElementById('checkoutEmail').style.borderColor = '#ff4444';
        return;
      }
      const btn = sr.getElementById('checkoutBtn');
      btn.textContent = 'Redirecting…';
      btn.disabled = true;
      try {
        const res  = await fetch(`${API}/api/checkout`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ plan: selectedPlan, email })
        });
        const data = await res.json();
        if (data.url) {
          window.location.href = data.url;
        } else {
          throw new Error(data.error || 'Checkout failed');
        }
      } catch (e) {
        btn.textContent = 'Start Subscription →';
        btn.disabled = false;
        alert('Something went wrong. Please try again.');
      }
    });

    // Login link — send magic link to existing subscriber
    sr.getElementById('loginLink')?.addEventListener('click', async () => {
      const email = (sr.getElementById('checkoutEmail')?.value || '').trim();
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        sr.getElementById('checkoutEmail').style.borderColor = '#ff8c00';
        sr.getElementById('checkoutEmail').placeholder = 'Enter your email first';
        return;
      }
      await fetch(`${API}/api/auth/request-link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });
      const loginBtn = sr.getElementById('loginLink');
      loginBtn.textContent = '✓ Check your email';
      loginBtn.style.color = '#4CFC0F';
    });

    // Dismiss banner
    sr.getElementById('dismissBanner').addEventListener('click', () => {
      const banner = sr.getElementById('upgradeBanner');
      banner.style.transition = 'transform .4s ease, opacity .3s ease';
      banner.style.transform  = 'translateY(calc(100% + 2rem))';
      banner.style.opacity    = '0';
    });

    this.recalc();
  }

  // ─────────────────────────────────────────
  //  DRUG AUTOCOMPLETE
  // ─────────────────────────────────────────
  async fetchDrugs() {
    const sr  = this.shadowRoot;
    const q   = sr.getElementById('drugIn').value.trim();
    const dd  = sr.getElementById('acd');
    if (q.length < 2) { dd.style.display='none'; return; }
    try {
      const res  = await fetch(`${API}/api/search?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      const seen = new Map();
      (data||[]).forEach(item => {
        const raw     = (item.display || item.name || '').trim();
        const cleaned = raw.replace(/\s+\d[\d.]*\s*(mg|mcg|ml|%|g|iu|units?)\b.*/i,'').trim() || raw;
        const key     = cleaned.toLowerCase();
        if (!seen.has(key)) seen.set(key, { ...item, cleaned });
      });
      const drugs = Array.from(seen.values()).slice(0,12);
      if (!drugs.length) { dd.style.display='none'; return; }
      dd.innerHTML = drugs.map(d =>
        `<div class="aci"
            data-canonical="${d.canonical||d.cleaned}"
            data-brand="${d.brand||''}"
            data-ndc="${d.ndc||''}">
            <strong>${d.canonical||d.cleaned}</strong>
         </div>`
      ).join('');
      dd.style.display = 'block';
      dd.querySelectorAll('.aci').forEach(el => {
        el.addEventListener('click', () => this.selectDrug(el.dataset.canonical, el.dataset.brand));
      });
    } catch(e) { console.error(e); }
  }

  hideAc() {
    const dd = this.shadowRoot.getElementById('acd');
    if (dd) dd.style.display = 'none';
  }

  async selectDrug(canonical, brand) {
    const sr = this.shadowRoot;

    // Fill input with canonical name only
    sr.getElementById('drugIn').value = canonical;
    this.selectedDrug = canonical;
    this.hideAc();

    // Show generic/brand toggle with drug-specific labels
    const wrap = sr.getElementById('drugTypeWrap');
    if (wrap) {
      wrap.classList.add('show');
      const gsub = sr.getElementById('genericSub');
      const bsub = sr.getElementById('brandSub');
      if (gsub) gsub.textContent = canonical;
      if (bsub) bsub.textContent = brand || '—';
    }

    // Strength lookup uses canonical name ONLY
    try {
      const res  = await fetch(`${API}/api/strengths?drug=${encodeURIComponent(canonical)}`);
      const data = await res.json();
      const sel  = sr.getElementById('strSel');
      sel.disabled = false;
      if (data && data.length) {
        sel.innerHTML = data.map(s =>
          `<option value="${normalizeNdc(s.ndc)}">${s.strength}</option>`
        ).join('');
        sel.selectedIndex = 0;
      } else {
        sel.innerHTML = '<option value="">No strengths on file</option>';
      }
    } catch(e) { console.error(e); }
  }

  setupDrugTypeToggle() {
    const sr = this.shadowRoot;
    const buttons = sr.querySelectorAll('.tb');

    buttons.forEach(btn => {
      btn.addEventListener('click', () => {
        const type = btn.dataset.t;

        // Update internal state
        this.drugType = type;

        // Toggle active style
        buttons.forEach(b => b.classList.remove('on'));
        btn.classList.add('on');

        // Update price delta hint
        const hint = sr.getElementById('priceDeltaHint');
        if (hint) {
          if (type === 'brand') {
            hint.textContent = '⚠ Brand medications typically cost 8–10× more than generics';
            hint.style.color = '#ffaa00';
          } else {
            hint.textContent = '✓ Generics deliver identical clinical effect at far lower cost';
            hint.style.color = '#4CFC0F';
          }
        }
      });
    });
  }

  // ─────────────────────────────────────────
  //  RECALC
  // ─────────────────────────────────────────
  recalc() {
    const sr    = this.shadowRoot;
    const daily = parseFloat(sr.getElementById('daily').value) || 1;
    const qty   = Math.ceil(this.duration * daily);
    const el    = sr.getElementById('qtyDisp');
    if (el) el.innerHTML = `<div class="cd-lbl">auto-calculated</div><span class="cd-val">${qty}</span><span class="cd-unit">units</span>`;
  }

  // ─────────────────────────────────────────
  async _checkSession() {
    // Check for magic link token in URL first
    const params = new URLSearchParams(window.location.search);
    const token  = params.get('trx_token');
    if (token) {
      try {
        const res  = await fetch(`${API}/api/auth/verify?token=${token}`, { credentials: 'include' });
        const data = await res.json();
        if (data.success) {
          this.isPremium = !!data.isPremium;
          this.userEmail = data.email;
          // Clean token from URL
          const url = new URL(window.location.href);
          url.searchParams.delete('trx_token');
          window.history.replaceState({}, '', url.toString());
          this._updateAuthUI();
          return;
        }
      } catch(e) {}
    }
    // Check existing session cookie
    try {
      const res  = await fetch(`${API}/api/auth/session`, { credentials: 'include' });
      const data = await res.json();
      if (data.authenticated) {
        this.isPremium = !!data.isPremium;
        this.userEmail = data.email;
        this._updateAuthUI();
      }
    } catch(e) {}
  }

  _updateAuthUI() {
    const sr = this.shadowRoot;
    if (!sr) return;
    // Hide upgrade banner for premium users
    if (this.isPremium) {
      const banner = sr.getElementById('upgradeBanner');
      if (banner) banner.style.display = 'none';
    }
    // Show email in dev tools if open
    const dev = document.getElementById('_trxDev');
    if (dev && this.userEmail) {
      const info = dev.querySelector('._trxEmail');
      if (!info) {
        const p = document.createElement('div');
        p.className = '_trxEmail';
        p.style.cssText = 'color:#4CFC0F;font-size:.7rem;margin-top:.5rem;text-align:center;';
        p.textContent = `✓ ${this.userEmail}${this.isPremium ? ' · Premium' : ''}`;
        dev.appendChild(p);
      }
    }
  }

  //  ANALYZE — with fingerprint + IP gate
  // ─────────────────────────────────────────
  async analyze() {
    const sr = this.shadowRoot;
    const strengthSelect = sr.getElementById('strSel');

    if (!this.selectedDrug) { this.showErr('Please select a drug first.'); return; }
    if (!strengthSelect.value) { this.showErr('Please select a dosage strength.'); return; }

    const ndc       = normalizeNdc(strengthSelect.value);
    const userPrice = parseFloat(sr.getElementById('userPrice').value) || 0;
    const daily     = parseFloat(sr.getElementById('daily').value) || 1;
    const drugType  = this.drugType || 'generic';
    console.log('[TRX] NDC used →', ndc);

    // ── Step 1: Usage gate disabled — email captured in upgrade banner after first run
    if (false) {
      this.showLoading(true);
      try {
        const fp = await getBrowserFingerprint();
        this._fp = fp;
        const gateRes = await fetch(`${API}/api/check-usage`, {
          method:'POST',
          headers:{'Content-Type':'application/json'},
          credentials:'include',
          body: JSON.stringify({ fingerprint: fp })
        });
        const gate = await gateRes.json();

        if (!gate.allowed) {
          this.showLoading(false);
          this.showGate(gate.reason);
          return;
        }

        // Store hashes for confirm step after analysis
        this._fpHash = gate.fpHash;
        this._ipHash = gate.ipHash;
      } catch(e) {
        // Fail open — don't block on network errors
        console.warn('Usage gate check failed, proceeding:', e);
      } finally {
        this.showLoading(false);
      }
    }

    // ── Step 2: Run the analysis
    this.showLoading(true);
    try {
      const res = await fetch(`${API}/api/price`, {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ ndc, userPrice, dailyDosage:daily, drugType: this.drugType })
      });
      if (!res.ok) throw new Error(res.status);
      const data = await res.json();
      this.renderResults(data, userPrice, daily);
updateConfidence(data.observations);


      // ── Step 3: Confirm usage server-side (fire and forget)
      if (!this.isPremium && (this._fpHash || this._ipHash)) {
        fetch(`${API}/api/confirm-usage`, {
          method:'POST',
          headers:{'Content-Type':'application/json'},
          credentials:'include',
          body: JSON.stringify({ fingerprint: this._fpHash || this._ipHash || 'unknown', ndc: ndc })
        }).catch(() => {});
        localStorage.setItem('transparentrx_demo_used','true');
        this.demoUsed = true;
      }
    } catch(e) {
      console.error(e);
      this.showErr('Analysis unavailable — please try again.');
      sr.getElementById('nfV').style.display = 'block';
    } finally { this.showLoading(false); }
  }

  // ─────────────────────────────────────────
  //  SHOW GATE
  // ─────────────────────────────────────────
  showGate(reason) {
    const sr = this.shadowRoot;
    const overlay = sr.getElementById('gateOverlay');
    const title   = sr.getElementById('gateTitle');
    const sub     = sr.getElementById('gateSub');

    if (reason === 'fingerprint') {
      title.textContent = 'You\'ve used your free analysis';
      sub.textContent   = 'Enter your email to check your subscription status, or upgrade for unlimited access.';
    } else if (reason === 'ip') {
      title.textContent = 'Free analysis already used on this network';
      sub.textContent   = 'Enter your email — if you\'re a TransDex™ subscriber you\'ll be unlocked instantly.';
    } else {
      title.textContent = 'Sign in to continue';
      sub.textContent   = 'Enter your email to access your account or start a free analysis.';
    }

    overlay.classList.add('show');

    // Wire gate buttons (once)
    if (!this._gateWired) {
      this._gateWired = true;

      sr.getElementById('gateSubmitBtn').addEventListener('click', () => this.submitGate());
      sr.getElementById('gateEmail').addEventListener('keydown', e => { if (e.key === 'Enter') this.submitGate(); });
      sr.getElementById('gateUpgradeLink').addEventListener('click', () => {
        this.dispatchEvent(new CustomEvent('trx:upgrade', { bubbles:true, composed:true }));
      });
    }
  }

  async submitGate() {
    const sr  = this.shadowRoot;
    const btn = sr.getElementById('gateSubmitBtn');
    const msg = sr.getElementById('gateMsg');
    const email = sr.getElementById('gateEmail').value.trim();

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      msg.textContent = 'Please enter a valid email address.';
      msg.className   = 'gate-msg err';
      return;
    }

    btn.disabled    = true;
    btn.textContent = 'Checking…';
    msg.textContent = '';

    try {
      const res  = await fetch(`${API}/api/auth/email-gate`, {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        credentials:'include',
        body: JSON.stringify({ email, fpHash: this._fpHash, ipHash: this._ipHash })
      });
      const data = await res.json();

      if (data.action === 'unlocked') {
        msg.textContent = '✓ ' + data.message;
        msg.className   = 'gate-msg ok';
        // Give them a session via the magic link flow, hide gate, and re-run
        setTimeout(() => {
          sr.getElementById('gateOverlay').classList.remove('show');
          this.isPremium = true;
          this.analyze();
        }, 1800);
      } else if (data.action === 'upgrade') {
        msg.textContent = data.message;
        msg.className   = 'gate-msg ok';
        setTimeout(() => {
          this.dispatchEvent(new CustomEvent('trx:upgrade', { bubbles:true, composed:true }));
        }, 1200);
      } else {
        throw new Error(data.error || 'Unknown response');
      }
    } catch(e) {
      msg.textContent = 'Something went wrong. Please try again.';
      msg.className   = 'gate-msg err';
      btn.disabled    = false;
      btn.textContent = 'Continue →';
    }
  }

  // ─────────────────────────────────────────
  //  RENDER RESULTS
  // ─────────────────────────────────────────
  renderResults(data, userPrice, daily) {
updateConfidence(data.observations);

    const sr = this.shadowRoot;
    sr.getElementById('initV').style.display = 'none';
    sr.getElementById('nfV').style.display   = 'none';
    sr.getElementById('resV').style.display  = 'block';

    const tp   = data.truePrice || {};
    const lyrs = data.layers    || [];
    const low  = parseFloat(tp.low)  || 0;
    const high = parseFloat(tp.high) || 0;
    const tdi  = parseFloat(tp.tdi || tp.mid || (low + (high-low)*.35)) || ((low+high)/2);
    const qty  = Math.ceil(this.duration * daily);

    // Range bar
    sr.getElementById('drugLbl').textContent     = this.selectedDrug || '—';
    sr.getElementById('rlTdi').textContent        = `$${tdi.toFixed(2)}`;

    // Low/High labels — only show if real market data exists
    const hasLow  = low > 0;
    const hasHigh = high > 0 && high !== low;
    const rlLowCol  = sr.getElementById('rlLowCol');
    const rlHighCol = sr.getElementById('rlHighCol');
    if (hasLow)  { sr.getElementById('rlLow').textContent  = `$${low.toFixed(2)}`;  rlLowCol.style.display  = ''; }
    else         { rlLowCol.style.display  = 'none'; }
    if (hasHigh) { sr.getElementById('rlHigh').animateNumber(this.shadowRoot.getElementById("rlTdi"),high.toFixed(2)); rlHighCol.style.display = ''; }
    else         { rlHighCol.style.display = 'none'; }

    // Markup pill — (retail - acquisition) / acquisition
    const acquisition = low > 0 ? low : tdi * 0.55;
    if (userPrice > 0 && acquisition > 0) {
      const markupPct = ((userPrice - acquisition) / acquisition) * 100;
      const markupX   = (userPrice / acquisition).toFixed(1);
      const pill = sr.getElementById('markupPill');
      pill.textContent = `${markupPct.toFixed(0)}% markup on cost · ${markupX}×`;
      pill.style.display = '';
    }
    const ppu = qty > 0 ? 1/qty : 0;
    sr.getElementById('rscPillLow').textContent   = `$${(low  * ppu).toFixed(3)}`;
    sr.getElementById('rscPillTdi').textContent   = `$${(tdi  * ppu).toFixed(3)}`;
    sr.getElementById('rscPillHigh').textContent  = `$${(high * ppu).toFixed(3)}`;
    const rng = Math.max(high - low, .01);
    const pct    = Math.max(2, Math.min(98, ((userPrice - low) / rng) * 100));
    const tdiPct = Math.max(2, Math.min(98, ((tdi - low) / rng) * 100));
    setTimeout(() => {
      sr.getElementById('udot').style.left = `${pct}%`;
      sr.getElementById('tdot').style.left = `${tdiPct}%`;
    }, 100);

    this.renderWaterfall(lyrs, userPrice, tdi);
    this.renderBreakEven(userPrice, tdi, daily);

    // ── Slide-up upgrade banner after 1.5s (only for non-premium users)
    if (!this.isPremium) {
      setTimeout(() => {
        const banner = sr.getElementById('upgradeBanner');
        if (banner) banner.classList.add('visible');
      }, 1500);
    }
  }

  // ─────────────────────────────────────────
  //  WATERFALL
  // ─────────────────────────────────────────
  renderWaterfall(lyrs, userPrice, tdi) {
    const sr     = this.shadowRoot;
    const colors = ['#4CFC0F','#7ed957','#ffaa00','#ff8c00','#ff4444'];
    const base   = lyrs.length > 0
      ? lyrs.map((l,i) => ({ name:l.name, desc:l.description||'', val:parseFloat(l.value)||0, color:colors[i%colors.length] }))
      : [
          { name:'Acquisition Cost',  desc:'NADAC — actual pharmacy cost',     val:userPrice*.18, color:colors[0] },
          { name:'Dispensing Fee',    desc:'Pharmacist labor & overhead',       val:userPrice*.12, color:colors[1] },
          { name:'Pharmacy Margin',   desc:'Retail markup above acquisition',   val:userPrice*.22, color:colors[2] },
          { name:'PBM Spread',        desc:'Middleman processing & rebates',    val:userPrice*.20, color:colors[3] },
          { name:'Retail Extraction', desc:'Premium above TruePrice™',         val:userPrice*.28, color:colors[4] },
        ];

    const total = base.reduce((s,l)=>s+l.val,0) || 1;
    const maxH  = 200;

    sr.getElementById('wBars').innerHTML = [...base].reverse().map(l => {
      const h = Math.max(6, Math.round((l.val/total)*maxH));
      return `<div class="wbar" style="height:${h}px;background:${l.color};" title="${l.name}: $${l.val.toFixed(2)}"></div>`;
    }).join('');

    const extraction = Math.max(0, userPrice - tdi);

    // Build extraction explanation based on confidence
    let extractionDesc = 'Amount charged above TruePrice™ with no identifiable cost basis';
    let extractionColor = '#ff4444';
    if (extraction <= 0) {
      extractionColor = '#4CFC0F';
    } else if (extraction < tdi * 0.05) {
      extractionDesc = 'Minor markup above TruePrice™ — within normal pharmacy pricing variance';
      extractionColor = '#ffaa00';
    } else if (extraction < tdi * 0.15) {
      extractionDesc = 'Moderate unexplained markup — likely PBM spread or formulary tier pricing above acquisition cost';
      extractionColor = '#ff8c00';
    } else {
      extractionDesc = 'Significant markup above TruePrice™ — consistent with PBM rebate clawback, DIR fees, or retail price inflation above legitimate cost layers';
      extractionColor = '#ff4444';
    }

    const allLayers = extraction > 0
      ? [...base, { name:'Additional Margin', desc: extractionDesc, val: extraction, color: extractionColor }]
      : base;

    const grandTotal = userPrice > 0 ? userPrice : (allLayers.reduce((s,l)=>s+l.val,0) || 1);

    sr.getElementById('wLayers').innerHTML = allLayers.map(l => `
      <div class="wl">
        <div class="wsw" style="background:${l.color};"></div>
        <div class="wi"><div class="wn">${l.name}</div><div class="wd">${l.desc}</div></div>
        <div style="text-align:left;">
          <span class="wv" style="color:${l.color};">$${l.val.toFixed(2)}</span>
          <span class="wp">${Math.round((l.val/grandTotal)*100)}%</span>
        </div>
      </div>`).join('');

    if (extraction > 0) {
      sr.getElementById('fmvLine').style.display = 'block';
      sr.getElementById('ezBox').style.display   = 'flex';
      sr.getElementById('ezVal').textContent     = `$${extraction.toFixed(2)}`;
    }
  }

  // ─────────────────────────────────────────
  //  BREAK-EVEN
  // ─────────────────────────────────────────
  renderBreakEven(userPrice, tdi, daily) {
    const sr      = this.shadowRoot;
    const PLAN    = 12;
    const fpy     = 365 / this.duration;
    const annPaid = userPrice * fpy;
    const annFMV  = tdi * fpy;
    const annSave = Math.max(0, annPaid - annFMV);
    const monSave = annSave / 12;
    const netMon  = monSave - PLAN;
    const netAnn  = netMon * 12;
    const beDayNum = monSave > 0 ? Math.ceil((PLAN/monSave)*30) : null;
    const beDate  = beDayNum
      ? new Date(Date.now()+beDayNum*86400000).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})
      : null;

    sr.getElementById('beStats').innerHTML = `
      <div class="besc">
        <div class="besc-ico">📅</div>
        <div class="besc-lbl">Break-Even Day</div>
        <div class="besc-val wht">${beDayNum ? 'Day '+beDayNum : 'N/A'}</div>
        <div class="besc-sub">${beDate || 'Track more meds'}</div>
      </div>
      <div class="besc">
        <div class="besc-ico">📈</div>
        <div class="besc-lbl">Net Monthly Gain</div>
        <div class="besc-val ${netMon>0?'grn':''}">$${Math.abs(netMon).toFixed(2)}</div>
        <div class="besc-sub">${netMon>0?'after $12 plan':'savings < plan cost'}</div>
      </div>
      <div class="besc">
        <div class="besc-ico">🏆</div>
        <div class="besc-lbl">Net Annual Gain</div>
        <div class="besc-val ${netAnn>0?'grn':''}">$${Math.abs(netAnn).toFixed(2)}</div>
        <div class="besc-sub">${netAnn>0?'pure savings':'add more meds'}</div>
      </div>`;

    if (beDayNum && beDayNum <= 30) {
      const pct = Math.min(100, (beDayNum/30)*100);
      sr.getElementById('tFill').style.width    = `${pct}%`;
      sr.getElementById('beMarker').textContent = `Break-even Day ${beDayNum}`;
    }

    const nm = sr.getElementById('netMsg');
    if (netAnn > 0) {
      nm.textContent = `✨ You net $${netAnn.toFixed(2)}/year after the plan cost${beDayNum ? ` — break-even on Day ${beDayNum}` : ''}.`;
      nm.className = 'net-msg net-pos';
    } else {
      nm.textContent = '💡 Add your other household medications to reveal your full annual savings potential.';
      nm.className = 'net-msg net-neu';
    }
  }

  // ─────────────────────────────────────────
  //  HELPERS
  // ─────────────────────────────────────────
  showErr(msg) {
    const el = this.shadowRoot.getElementById('errMsg');
    if (!el) return;
    el.textContent = msg; el.style.display = 'block';
    setTimeout(() => el.style.display='none', 5000);
  }

  showLoading(v) {
    const el = this.shadowRoot.getElementById('overlay');
    if (el) el.style.display = v ? 'flex' : 'none';
  }

  setPremiumStatus(v) { this.isPremium = v; }
}

customElements.define('prescription-economics', PrescriptionEconomics);

// build 1773173986592464699
function updateConfidence(obs){

let label="Low Confidence"
let color="#ff4444"

if(obs > 20){
label="Medium Confidence"
color="#ffaa00"
}

if(obs > 100){
label="High Confidence"
color="#4CFC0F"
}

const badge=document.getElementById("confBadge")

if(badge){
badge.innerText="⬤ "+label+" • "+obs+" Observations"
badge.style.borderColor=color
badge.style.color=color
}

}
