// The paper that remembers itself.
// Four printed equations of Hopfield 1982 are each stored as a memory
// (Eq [2]) in their own Hopfield net whose neurons are the pixels of the
// print (one net per equation — the four strips share their paper-white
// background, and p. 2557 warns that memories too close together are
// confused and tend to merge; we measured it, they do). Smudge an equation;
// rule [1] runs asynchronously in the p. 2557 variables (mu = +-1); the
// energy goes downhill and the print heals — or, past 50% corruption, falls
// into the complement minimum and heals into its own photographic negative.

'use strict';

// native pixel geometry of the 150-dpi page scans
const PAGE_W = 1275, PAGE_H = 1732;

// equation strips on page 2556 (media/page-4.png), native pixels
const PATCHES = [
  { id: 'eq6', tag: '[6]', x: 85,  y: 438,  w: 540, h: 72 },
  { id: 'eq9', tag: '[9]', x: 660, y: 360,  w: 540, h: 72 },
  { id: 'eq7', tag: '[7]', x: 85,  y: 924,  w: 540, h: 72 },
  { id: 'eq8', tag: '[8]', x: 85,  y: 1030, w: 540, h: 72 },
];
const PW = 540, PH = 72, N = PW * PH;
const INK_THRESHOLD = 160; // luminance below this = ink
const BRUSH_R = 16;        // smudge brush radius, native px

const state = {
  nets: [],      // one single-memory net per patch, spin mode (p. 2557)
  patterns: [],  // Uint8Array per patch (the stored V^s)
  works: [],     // per-patch working state (what the canvas shows)
  toucheds: [],  // per-patch: has the visitor (or the demo) damaged it?
  paper: [235, 232, 224], // sampled paper color, refined at load
  canvases: {},  // patch id -> overlay canvas
  active: 2,     // patch index being played; default Eq [7]
  healing: false,
  raf: 0,
  eTrace: [],
  demoDone: false,
};

const $ = sel => document.querySelector(sel);
const work = () => state.works[state.active];
const activeCanvas = () => state.canvases[PATCHES[state.active].id];
const activeNet = () => state.nets[state.active];

// ---------- boot ----------

window.addEventListener('load', () => {
  const img = $('#hero-img');
  if (img.complete) init(img); else img.addEventListener('load', () => init(img));
});

function init(img) {
  const off = document.createElement('canvas');
  off.width = PAGE_W; off.height = PAGE_H;
  const ctx = off.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, PAGE_W, PAGE_H);

  // sample paper white from a margin strip
  const margin = ctx.getImageData(20, 600, 40, 200).data;
  let r = 0, g = 0, b = 0, c = 0;
  for (let i = 0; i < margin.length; i += 4) { r += margin[i]; g += margin[i+1]; b += margin[i+2]; c++; }
  state.paper = [r / c | 0, g / c | 0, b / c | 0];

  // binarize each equation strip -> stored patterns; one net per strip
  for (const p of PATCHES) {
    const d = ctx.getImageData(p.x, p.y, PW, PH).data;
    const pat = new Uint8Array(N);
    for (let i = 0; i < N; i++) {
      const lum = 0.299 * d[i*4] + 0.587 * d[i*4+1] + 0.114 * d[i*4+2];
      pat[i] = lum < INK_THRESHOLD ? 1 : 0;
    }
    state.patterns.push(pat);
    state.works.push(Uint8Array.from(pat));
    state.toucheds.push(false);
    state.nets.push(new Hopfield([pat], 'spin'));
  }

  buildOverlays();
  wireControls();
  setActive(2); // Eq [7], the star
  setStatus('ready — smudge an equation');
  watchForFirstView();
  if (location.search.includes('debug')) $('#page-hero').classList.add('debug');
}

function buildOverlays() {
  const host = $('#page-hero');
  PATCHES.forEach((p, idx) => {
    const cv = document.createElement('canvas');
    cv.width = PW; cv.height = PH;
    cv.className = 'patch';
    cv.style.left   = (100 * p.x / PAGE_W) + '%';
    cv.style.top    = (100 * p.y / PAGE_H) + '%';
    cv.style.width  = (100 * PW / PAGE_W) + '%';
    cv.style.height = (100 * PH / PAGE_H) + '%';
    host.appendChild(cv);
    cv.addEventListener('pointerdown', e => { setActive(idx); startSmudge(e, cv); });
    state.canvases[p.id] = cv;
  });
}

// ---------- interaction ----------

function setActive(idx) {
  if (state.healing) stopHeal();
  state.active = idx;
  PATCHES.forEach((p, i) =>
    state.canvases[p.id].classList.toggle('selected', i === idx));
  $('#sel-tag').textContent = PATCHES[idx].tag;
  state.eTrace = [];
  drawTrace();
}

function startSmudge(e, cv) {
  e.preventDefault();
  if (state.healing) stopHeal();
  state.toucheds[state.active] = true;
  cv.setPointerCapture(e.pointerId);
  const move = ev => smudgeAt(ev, cv);
  smudgeAt(e, cv);
  cv.addEventListener('pointermove', move);
  cv.addEventListener('pointerup', () => {
    cv.removeEventListener('pointermove', move);
    refreshEnergy();
    setStatus('corrupted — press heal, or keep smudging');
  }, { once: true });
}

function brush(cx, cy) {
  const w = work();
  const r2 = BRUSH_R * BRUSH_R;
  const x0 = Math.max(0, cx - BRUSH_R | 0), x1 = Math.min(PW - 1, cx + BRUSH_R | 0);
  const y0 = Math.max(0, cy - BRUSH_R | 0), y1 = Math.min(PH - 1, cy + BRUSH_R | 0);
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) {
      const dx = x - cx, dy = y - cy;
      if (dx * dx + dy * dy <= r2 && Math.random() < 0.35)
        w[y * PW + x] ^= 1; // Hamming corruption: bit flip
    }
}

function smudgeAt(ev, cv) {
  const rect = cv.getBoundingClientRect();
  brush((ev.clientX - rect.left) * PW / rect.width,
        (ev.clientY - rect.top) * PH / rect.height);
  drawState(cv, work());
  throttledEnergy();
}

let eTimer = 0;
function throttledEnergy() {
  if (eTimer) return;
  eTimer = setTimeout(() => { eTimer = 0; refreshEnergy(); }, 120);
}

function refreshEnergy() {
  const net = activeNet();
  net.setState(work());
  const e = net.energy();
  $('#e-value').textContent = fmtE(e);
  state.eTrace.push(e);
  drawTrace();
}

function corrupt(frac) {
  if (state.healing) stopHeal();
  state.toucheds[state.active] = true;
  const w = work();
  for (let i = 0; i < N; i++) if (Math.random() < frac) w[i] ^= 1;
  drawState(activeCanvas(), w);
  state.eTrace = [];
  refreshEnergy();
  const pct = Math.round(frac * 100);
  setStatus(pct === 50
    ? `corrupted 50% — dead center between print and negative; heal is a coin toss`
    : `corrupted ${pct}% of ${N.toLocaleString()} bits — press heal`);
}

function blank() {
  if (state.healing) stopHeal();
  state.toucheds[state.active] = true;
  work().fill(0);
  drawState(activeCanvas(), work());
  state.eTrace = [];
  refreshEnergy();
  setStatus('erased to blank paper — press heal: the background still agrees ' +
    'with the print, so blank sits inside its basin');
}

function resetPrint() {
  stopHeal();
  state.works[state.active] = Uint8Array.from(state.patterns[state.active]);
  state.toucheds[state.active] = false;
  state.eTrace = [];
  const cv = activeCanvas();
  cv.getContext('2d').clearRect(0, 0, PW, PH);
  $('#e-value').textContent = '—';
  $('#verdict').textContent = '';
  drawTrace();
  setStatus('print restored from file (not from memory — that would be cheating)');
}

// ---------- healing (the actual paper, live) ----------

function heal() {
  if (!state.toucheds[state.active] || state.healing) return;
  const net = activeNet();
  net.setState(work());
  state.eTrace = [net.energy()];
  state.healing = true;
  $('#verdict').textContent = '';
  setStatus('relaxing — asynchronous updates, rule [1], random order');
  const cv = activeCanvas();
  cv.classList.add('healing');
  const tick = () => {
    if (!state.healing) return;
    net.step(1800); // neuron visits per frame — watchable, not instant
    work().set(net.V);
    drawState(cv, work());
    const e = net.energy();
    state.eTrace.push(e);
    $('#e-value').textContent = fmtE(e);
    drawTrace();
    if (net.stable) {
      state.healing = false;
      cv.classList.remove('healing');
      verdict();
      return;
    }
    state.raf = requestAnimationFrame(tick);
  };
  state.raf = requestAnimationFrame(tick);
}

function stopHeal() {
  state.healing = false;
  cancelAnimationFrame(state.raf);
  document.querySelectorAll('.patch.healing')
    .forEach(c => c.classList.remove('healing'));
}

function verdict() {
  const net = activeNet();
  const tag = PATCHES[state.active].tag;
  const d = net.hammingTo(0);
  if (d === 0)
    setVerdict(`recovered ${tag} exactly — 0 of ${N.toLocaleString()} bits ` +
      `wrong, energy strictly downhill the whole way`);
  else if (d === N)
    setVerdict(`healed into its own photographic negative — the complement ` +
      `is an equally deep minimum; past 50% corruption its basin wins`);
  else
    setVerdict(`stable with ${d.toLocaleString()} bit errors — a nearby ` +
      `local minimum (${(100 * d / N).toFixed(1)}% off ${tag})`);
  setStatus('stable — a full pass with zero flips');
}

// ---------- the unprompted first miracle ----------
// When page 2556 first scrolls into view, an invisible hand smudges Eq [7]
// and the paper heals itself. Awe first, instructions later.

function watchForFirstView() {
  const hero = $('#page-hero');
  const obs = new IntersectionObserver(entries => {
    for (const e of entries)
      if (e.isIntersecting) { obs.disconnect(); setTimeout(autoDemo, 600); }
  }, { threshold: 0.45 });
  obs.observe(hero);
}

function autoDemo() {
  if (location.search.includes('debug')) return; // calibration mode stays pristine
  if (state.demoDone || state.healing) return;
  if (state.toucheds.some(Boolean)) return; // visitor beat us to it
  state.demoDone = true;
  setActive(2); // Eq [7]
  state.toucheds[2] = true;
  const cv = activeCanvas();
  let t = 0;
  setStatus('watch — smudging Eq [7]…');
  const sweep = setInterval(() => {
    t++;
    const cx = 40 + (PW - 80) * t / 16;
    const cy = PH / 2 + Math.sin(t * 0.85) * 16;
    brush(cx, cy);
    drawState(cv, work());
    if (t >= 16) {
      clearInterval(sweep);
      refreshEnergy();
      setTimeout(() => { heal(); }, 800);
      setTimeout(() => {
        if (!state.healing) setStatus('your turn — smudge any equation');
      }, 7000);
    }
  }, 80);
}

// ---------- drawing ----------

function drawState(cv, v) {
  const ctx = cv.getContext('2d');
  const im = ctx.createImageData(PW, PH);
  const d = im.data, [pr, pg, pb] = state.paper;
  for (let i = 0; i < N; i++) {
    const o = i * 4;
    if (v[i]) { d[o] = 26; d[o+1] = 24; d[o+2] = 22; }
    else      { d[o] = pr; d[o+1] = pg; d[o+2] = pb; }
    d[o+3] = 255;
  }
  ctx.putImageData(im, 0, 0);
}

function drawTrace() {
  const cv = $('#e-trace'), ctx = cv.getContext('2d');
  ctx.clearRect(0, 0, cv.width, cv.height);
  const t = state.eTrace;
  if (t.length < 2) return;
  let lo = Infinity, hi = -Infinity;
  for (const e of t) { if (e < lo) lo = e; if (e > hi) hi = e; }
  if (hi === lo) hi = lo + 1;
  ctx.strokeStyle = getComputedStyle(document.documentElement)
    .getPropertyValue('--accent').trim() || '#b3402e';
  ctx.lineWidth = 2;
  ctx.beginPath();
  t.forEach((e, i) => {
    const x = 4 + (cv.width - 8) * i / (t.length - 1);
    const y = 6 + (cv.height - 12) * (e - lo) / (hi - lo);
    i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
  });
  ctx.stroke();
}

function fmtE(e) { return e.toLocaleString('en-US', { maximumFractionDigits: 0 }); }
function setStatus(s) { $('#status').textContent = s; }
function setVerdict(s) { $('#verdict').textContent = s; }

function wireControls() {
  $('#btn-30').onclick = () => corrupt(0.30);
  $('#btn-50').onclick = () => corrupt(0.50);
  $('#btn-90').onclick = () => corrupt(0.90);
  $('#btn-blank').onclick = blank;
  $('#btn-heal').onclick = heal;
  $('#btn-reset').onclick = resetPrint;
  $('#btn-fig2').onclick = () => runFig2(+$('#fig2-n').value);
}

// ---------- Fig. 2, re-run live (N = 100, exactly the paper's experiment,
// in the paper's own V in {0,1}, U_i = 0 variables) ----------

function runFig2(n) {
  const NN = 100, MATRICES = 10, bins = [0, 1, 3, 6, 10, 20, 30, 40, 50];
  const counts = new Array(bins.length).fill(0);
  let trials = 0, exact = 0;
  for (let m = 0; m < MATRICES; m++) {
    const pats = [];
    for (let s = 0; s < n; s++) {
      const p = new Uint8Array(NN);
      for (let i = 0; i < NN; i++) p[i] = Math.random() < 0.5 ? 1 : 0;
      pats.push(p);
    }
    const net = new Hopfield(pats); // binary mode — the paper's simulation
    for (let s = 0; s < n; s++) {
      net.setState(pats[s]);
      net.relax(60);
      const d = net.hammingTo(s);
      trials++;
      if (d === 0) exact++;
      let b = bins.length - 1;
      for (let k = 0; k < bins.length - 1; k++)
        if (d >= bins[k] && d < bins[k + 1]) { b = k; break; }
      counts[b]++;
    }
  }
  drawFig2(counts.map(c => c / trials), bins, n);
  $('#fig2-out').textContent =
    `n = ${n}, N = 100, ${trials} nominally assigned memories across ` +
    `${MATRICES} random matrices: ${Math.round(100 * exact / trials)}% recalled ` +
    `with zero errors. Paper: about 0.15 N states can be simultaneously ` +
    `remembered before error in recall is severe.`;
}

function drawFig2(probs, bins, n) {
  const cv = $('#fig2-chart'), ctx = cv.getContext('2d');
  const W = cv.width, H = cv.height, base = H - 26, left = 30;
  ctx.clearRect(0, 0, W, H);
  const css = getComputedStyle(document.documentElement);
  const ink = css.getPropertyValue('--ink').trim() || '#1a1816';
  ctx.strokeStyle = ink; ctx.fillStyle = ink;
  ctx.lineWidth = 1;
  ctx.strokeRect(left, 6, W - left - 6, base - 6);
  const bw = (W - left - 6) / probs.length;
  // hatched bars, like the print
  probs.forEach((p, i) => {
    const h = (base - 10) * p, x = left + i * bw + 3, y = base - h;
    ctx.save();
    ctx.beginPath(); ctx.rect(x, y, bw - 6, h); ctx.clip();
    ctx.beginPath();
    for (let s = -H; s < bw + H; s += 5) {
      ctx.moveTo(x + s, y); ctx.lineTo(x + s - H, y + H);
    }
    ctx.stroke();
    ctx.restore();
    ctx.strokeRect(x, y, bw - 6, h);
  });
  ctx.font = '10px ui-monospace, monospace';
  ctx.textAlign = 'center';
  const labels = ['0', '1-2', '3-5', '6-9', '10-', '20-', '30-', '40-', '>49'];
  labels.forEach((l, i) => ctx.fillText(l, left + i * bw + bw / 2, H - 14));
  ctx.fillText('Nerr = number of errors in state', (W + left) / 2, H - 2);
  ctx.save();
  ctx.translate(10, (base + 6) / 2); ctx.rotate(-Math.PI / 2);
  ctx.fillText('probability', 0, 0);
  ctx.restore();
  ctx.textAlign = 'left';
  ctx.fillText(`n = ${n}`, left + 8, 20);
  ctx.fillText('N = 100', left + 8, 32);
}
