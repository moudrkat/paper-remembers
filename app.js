// The paper that remembers itself — whole-page edition.
// Five pages of Hopfield 1982 are stored as memories in ONE network (pixels =
// neurons). Scribble anywhere on a page; let go; the network rolls downhill to
// the nearest stored memory and the whole page rebuilds — recalling the RIGHT
// page out of the five, which the correlated print only allows because of the
// projection (1985) rule. Toggle to Hopfield's own 1982 Hebbian rule and the
// pages blur into one ghost. The same "roll downhill to a memory" step was
// proven in 2020 to be transformer attention — hence the AI framing.

'use strict';

const PAGES = [
  { src: 'media/page-2.png', label: 'p. 2554' },
  { src: 'media/page-3.png', label: 'p. 2555' },
  { src: 'media/page-4.png', label: 'p. 2556' },
  { src: 'media/page-5.png', label: 'p. 2557' },
  { src: 'media/page-6.png', label: 'p. 2558' },
];

// a plain-English reading companion, shown under each page as you scroll
const PAGE_NOTES = [
  `<strong>The core idea (see the abstract, top).</strong> A normal computer
   looks up memory by <em>address</em> — "give me slot #4837." This looks it up
   by <em>content</em>: hand it a fragment or a damaged copy, and it gives back
   the whole thing. Two notes bring back a song; a glimpse brings back a face.
   That is exactly what you do when you scribble a page and it rebuilds.`,
  `<strong>Here are the two working equations.</strong> <b>[2]</b> is how you
   <em>store</em> a memory — Hopfield's original 1982 way: strengthen the link
   between every pair of switches that agree (both on, or both off). This is the
   one part the 1985 upgrade does more cleverly. <b>[1]</b> is how it
   <em>recalls</em> — each switch keeps flipping to match what its neighbours are
   telling it, until the whole pattern locks onto the nearest stored memory; that
   rule is pure 1982 and never changes. (Fig. 1 is just how one neuron turns its
   input into an on-or-off output.)`,
  `<strong>Equation [7] is the star — the network's energy.</strong> One number
   for how much all the switches disagree with their wiring. Hopfield proved
   (<b>[8]</b>) it can only go <em>down</em> as the network updates. So memories
   are <em>valleys</em> in an energy landscape, and recall is a damaged page
   rolling downhill into the nearest valley — the recovered page. The hill drawn
   in the instrument on the right is this equation.`,
  `<strong>Fig. 2 is an experiment you can re-run (below).</strong> Cram more
   memories into one network and count how many come back with errors. A few
   memories → perfect recall; too many → recall breaks down, at about
   <em>0.15 × the number of switches</em>. (That is about <em>too many</em>
   memories. A separate but related trouble is memories that are <em>too
   similar</em> — like these mostly-white pages — which blur together even
   though there are only five. That is what you see if you switch to Hopfield's
   1982 wiring.)`,
  `<strong>Closing discussion.</strong> Categories, forgetting old memories, and
   why this behaves like a real, fault-tolerant memory — one that degrades
   gracefully instead of failing all at once.`,
];
const WORK_W = 760;            // network resolution (pixels across a page)
const INK_THRESHOLD = 155;
const BRUSH_FRAC = 0.028;      // brush radius as a fraction of page width

const state = {
  W: 0, H: 0, N: 0,
  patterns: [],   // Uint8Array per page (the stored memories)
  net: null,      // projection net over all pages (the default engine)
  hebbNet: null,  // Hopfield's 1982 Hebbian net over all pages (the toggle)
  merged: false,  // is the 1982 rule switched on?
  paper: [236, 232, 223],
  works: [],      // per-page (possibly damaged) bitmap on the stage
  canvases: [],   // per-page canvas element
  touched: [],    // per-page: has it been scribbled?
  active: 0,      // last page the cursor touched (drives the instrument)
  healing: false,
  autoHeal: 0,
  raf: 0,
  demoDone: false,
  introTimers: [],
  introAborted: false,
};

const $ = sel => document.querySelector(sel);
const activeNet = () => state.merged ? state.hebbNet : state.net;

// ---------- boot ----------

window.addEventListener('load', () => {
  Promise.all(PAGES.map(p => new Promise((res, rej) => {
    const im = new Image();
    // Hugging Face serves these via a cross-origin CDN redirect; without CORS
    // mode the canvas taints and getImageData() throws. The CDN sends
    // Access-Control-Allow-Origin: *, so anonymous CORS is clean here and on
    // any same-origin host too.
    im.crossOrigin = 'anonymous';
    im.onload = () => res(im);
    im.onerror = () => rej(new Error('could not load ' + p.src));
    im.src = p.src;
  }))).then(init).catch(err => {
    console.error(err);
    setStatus('could not load the page images — try a hard refresh');
  });
});

function init(imgs) {
  const nat = imgs[0];
  state.W = WORK_W;
  state.H = Math.round(WORK_W * nat.naturalHeight / nat.naturalWidth);
  state.N = state.W * state.H;

  const off = document.createElement('canvas');
  off.width = state.W; off.height = state.H;
  const ctx = off.getContext('2d', { willReadFrequently: true });

  // sample paper colour from a top margin of the first page
  ctx.drawImage(imgs[0], 0, 0, state.W, state.H);
  const mg = ctx.getImageData(4, 4, state.W - 8, 12).data;
  let r = 0, g = 0, b = 0, c = 0;
  for (let i = 0; i < mg.length; i += 4) { r += mg[i]; g += mg[i+1]; b += mg[i+2]; c++; }
  state.paper = [r/c|0, g/c|0, b/c|0];

  // binarize every page to a stored pattern
  state.patterns = imgs.map(im => {
    ctx.clearRect(0, 0, state.W, state.H);
    ctx.drawImage(im, 0, 0, state.W, state.H);
    const d = ctx.getImageData(0, 0, state.W, state.H).data;
    const a = new Uint8Array(state.N);
    for (let i = 0; i < state.N; i++) {
      const lum = 0.299 * d[i*4] + 0.587 * d[i*4+1] + 0.114 * d[i*4+2];
      a[i] = lum < INK_THRESHOLD ? 1 : 0;
    }
    return a;
  });

  state.net = new Hopfield(state.patterns, 'spin', 'projection');
  state.hebbNet = new Hopfield(state.patterns, 'spin'); // the 1982 contrast

  buildStage();
  wireControls();
  setActive(0);
  setStatus('scroll the pages · scribble anywhere on any of them, then let go');
  state.introTimers.push(setTimeout(narrateIntro, 500));
  if (location.search.includes('debug')) document.body.classList.add('debug');
}

// ---------- stage: all five pages stacked, scrollable, each scribbleable ----------

function buildStage() {
  const host = $('#stage-scroll');
  PAGES.forEach((p, i) => {
    state.works[i] = Uint8Array.from(state.patterns[i]);
    state.touched[i] = false;
    const slot = document.createElement('div');
    slot.className = 'page-slot';
    const lab = document.createElement('div');
    lab.className = 'page-tab';
    lab.textContent = 'PNAS 1982 · ' + p.label;
    const cv = document.createElement('canvas');
    cv.width = state.W; cv.height = state.H;
    cv.className = 'page-canvas';
    cv.addEventListener('pointerdown', e => startDamage(e, i));
    const note = document.createElement('div');
    note.className = 'page-note';
    note.innerHTML = PAGE_NOTES[i];
    slot.appendChild(lab); slot.appendChild(cv); slot.appendChild(note);
    host.appendChild(slot);
    state.canvases[i] = cv;
    render(i);
  });
}

function render(i) {
  const cv = state.canvases[i], ctx = cv.getContext('2d');
  const im = ctx.createImageData(state.W, state.H);
  const d = im.data, v = state.works[i], [pr, pg, pb] = state.paper;
  for (let k = 0; k < state.N; k++) {
    const o = k * 4;
    if (v[k]) { d[o] = 24; d[o+1] = 22; d[o+2] = 20; }
    else { d[o] = pr; d[o+1] = pg; d[o+2] = pb; }
    d[o+3] = 255;
  }
  ctx.putImageData(im, 0, 0);
}

function setActive(i) {
  state.active = i;
  $('#sel-tag').textContent = PAGES[i].label.replace('p. ', '');
  drawTrace();
}

// ---------- damage (cursor, anywhere on any page) ----------

function brush(cx, cy, i) {
  const R = state.W * BRUSH_FRAC, r2 = R * R, W = state.W, v = state.works[i];
  const x0 = Math.max(0, cx - R | 0), x1 = Math.min(W - 1, cx + R | 0);
  const y0 = Math.max(0, cy - R | 0), y1 = Math.min(state.H - 1, cy + R | 0);
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) {
      const dx = x - cx, dy = y - cy;
      if (dx*dx + dy*dy <= r2 && Math.random() < 0.5) v[y*W + x] ^= 1;
    }
}

function canvasXY(ev, cv) {
  const rect = cv.getBoundingClientRect();
  return [(ev.clientX - rect.left) * state.W / rect.width,
          (ev.clientY - rect.top) * state.H / rect.height];
}

function startDamage(e, i) {
  const cv = state.canvases[i];
  e.preventDefault();
  if (state.healing) stopHeal();
  clearTimeout(state.autoHeal);
  setActive(i);
  state.touched[i] = true;
  cv.setPointerCapture(e.pointerId);
  setStatus('rubbing out the ink…');
  const [x, y] = canvasXY(e, cv); brush(x, y, i); render(i);
  const move = ev => { const [mx, my] = canvasXY(ev, cv); brush(mx, my, i); render(i); };
  cv.addEventListener('pointermove', move);
  cv.addEventListener('pointerup', () => {
    cv.removeEventListener('pointermove', move);
    setStatus('let go — now watch the page rebuild itself…');
    state.autoHeal = setTimeout(heal, 600);
  }, { once: true });
}

// ---------- rebuild (the network recalling the page) ----------

function heal() {
  const i = state.active;
  if (!state.touched[i] || state.healing) return;
  const net = activeNet();
  net.setState(state.works[i]);
  state.healing = true;
  setVerdict('');
  setStatus(state.merged
    ? "Hopfield's 1982 rule — watch the pages blur together…"
    : 'rebuilding — rolling downhill to the page it remembers…');
  const cv = state.canvases[i];
  cv.classList.add('healing');
  const chunk = Math.max(20000, state.N / 40 | 0);
  const tick = () => {
    if (!state.healing) return;
    net.step(chunk);
    state.works[i].set(net.V);
    render(i);
    $('#e-value').textContent = fmtE(net.energy());
    drawTrace();
    if (net.stable) {
      state.healing = false;
      cv.classList.remove('healing');
      verdict(i);
      return;
    }
    state.raf = setTimeout(tick, 16);
  };
  state.raf = setTimeout(tick, 16);
}

function stopHeal() {
  state.healing = false;
  clearTimeout(state.raf);
  document.querySelectorAll('.page-canvas.healing')
    .forEach(c => c.classList.remove('healing'));
}

function verdict(i) {
  const net = activeNet();
  const label = PAGES[i].label;
  const dists = state.patterns.map((_, s) => net.hammingTo(s));
  let best = 0; for (let s = 1; s < dists.length; s++) if (dists[s] < dists[best]) best = s;
  const own = dists[i];

  if (state.merged) {
    setVerdict(`with Hopfield's 1982 rule the five pages blur together — you ` +
      `get a ghost, not ${label}. This is the failure the projection rule was ` +
      `built to fix.`);
    setStatus('rebuilt — but into a blurred ghost of all five pages');
    return;
  }
  if (own === 0) {
    setVerdict(`it rebuilt ${label} exactly — every pixel — out of a network ` +
      `that also holds the other four pages. Nobody told it which page you ` +
      `wrecked; it found it.`);
    setStatus('rebuilt — the right page came back whole');
  } else if (own === state.N) {
    setVerdict(`you wiped out more than half, so it rolled into the ` +
      `photographic negative of ${label} — an equally deep valley.`);
    setStatus('rebuilt — into the negative');
  } else if (best !== i) {
    setVerdict(`you damaged it so far it landed on ${PAGES[best].label} ` +
      `instead of ${label} — past the edge of its own valley.`);
    setStatus('rebuilt — into a different page');
  } else {
    setVerdict(`came back ${(100*own/state.N).toFixed(1)}% off ${label} — ` +
      `close, but it settled in a nearby dip.`);
    setStatus('rebuilt — nearly, not exactly');
  }
}

function resetPage() {
  stopHeal();
  clearTimeout(state.autoHeal);
  const i = state.active;
  state.works[i] = Uint8Array.from(state.patterns[i]);
  state.touched[i] = false;
  $('#e-value').textContent = '—';
  setVerdict('');
  render(i);
  drawTrace();
  setStatus('page restored — scribble anywhere and let go');
}

// ---------- the 1982-rule toggle ----------

function toggleMerge(on) {
  stopHeal();
  clearTimeout(state.autoHeal);
  state.merged = on;
  const btn = $('#btn-merge');
  btn.classList.toggle('on', on);
  btn.textContent = on ? '1982 rule on — switch back' : "switch to Hopfield's 1982 rule";
  PAGES.forEach((_, i) => {
    state.works[i] = Uint8Array.from(state.patterns[i]);
    state.touched[i] = false;
    render(i);
  });
  $('#e-value').textContent = '—';
  setVerdict('');
  setStatus(on
    ? "Hopfield's 1982 rule on — scribble any page and watch it blur into a ghost"
    : '1985 rule back — scribble any page; the right one returns whole');
}

// ---------- guided intro (narrate while the real page heals) ----------

function wait(ms) { return new Promise(res => state.introTimers.push(setTimeout(res, ms))); }

function sayIntro(t) {
  const tx = $('#intro-text');
  tx.style.opacity = 0;
  return wait(280).then(() => {
    if (state.introAborted) return;
    tx.textContent = t; tx.style.opacity = 1;
    return wait(320);
  });
}

async function narrateIntro() {
  if (location.search.includes('debug')) return;
  if (state.demoDone) return;
  state.demoDone = true;
  setActive(0); // the top page, already in view

  const ov = $('#intro');
  ov.hidden = false;
  $('#intro-skip').onclick = () => endIntro();
  await wait(40);
  if (state.introAborted) return;
  ov.classList.add('show');

  await sayIntro('This whole page is a memory —\nevery speck of ink, one switch in a network.');
  await wait(2200);
  if (state.introAborted) return;

  await sayIntro('Watch. We rub a hole right through it.');
  await wait(400);
  state.touched[0] = true;
  const W = state.W, H = state.H;
  for (let t = 1; t <= 22; t++) {
    if (state.introAborted) return;
    brush(W * (0.1 + 0.8 * t / 22), H * (0.22 + 0.16 * Math.sin(t * 0.7)), 0);
    render(0);
    await wait(55);
  }
  if (state.introAborted) return;

  await sayIntro('Nobody tells it what was there.\nIt rolls downhill to the page it remembers…');
  await wait(1100);
  if (state.introAborted) return;
  await healAwait(0);
  if (state.introAborted) return;

  await sayIntro('The page rebuilt itself.\nThis exact idea is how today’s AI remembers ↓');
  await wait(2400);
  endIntro();
}

// heal page i and resolve when stable (used by the intro)
function healAwait(i) {
  return new Promise(res => {
    const net = activeNet();
    net.setState(state.works[i]);
    const cv = state.canvases[i];
    cv.classList.add('healing');
    const chunk = Math.max(20000, state.N / 40 | 0);
    const tick = () => {
      if (state.introAborted) { cv.classList.remove('healing'); return res(); }
      net.step(chunk);
      state.works[i].set(net.V);
      render(i);
      if (net.stable) { cv.classList.remove('healing'); return res(); }
      state.introTimers.push(setTimeout(tick, 16));
    };
    tick();
  });
}

function endIntro() {
  if (state.introAborted) return;
  state.introAborted = true;
  state.introTimers.forEach(clearTimeout);
  state.introTimers = [];
  const ov = $('#intro');
  ov.classList.remove('show');
  setTimeout(() => { ov.hidden = true; }, 450);
  state.works[0] = Uint8Array.from(state.patterns[0]);
  state.touched[0] = false;
  render(0);
  setStatus('your turn — scribble anywhere on any page and let go');
}

// ---------- energy landscape (look closer) ----------

function drawTrace() {
  const cv = $('#e-trace'); if (!cv) return;
  const ctx = cv.getContext('2d'), W = cv.width, H = cv.height;
  ctx.clearRect(0, 0, W, H);
  const css = getComputedStyle(document.documentElement);
  const accent = css.getPropertyValue('--accent').trim() || '#b3402e';
  const ink = css.getPropertyValue('--ink').trim() || '#1a1816';
  const pad = 8, top = 12, bot = H - 16;
  const xToPx = x => pad + (W - 2*pad) * (x + 1) / 2;
  const eToPx = e => top + (bot - top) * (-e);
  ctx.strokeStyle = ink; ctx.globalAlpha = 0.45; ctx.lineWidth = 1.5;
  ctx.beginPath();
  for (let k = 0; k <= 48; k++) {
    const x = -1 + 2*k/48, X = xToPx(x), Y = eToPx(-x*x);
    k ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y);
  }
  ctx.stroke();
  ctx.globalAlpha = 1;
  const net = activeNet();
  let x = ((net.m && net.m[state.active]) || 0) / state.N;
  x = Math.max(-1, Math.min(1, x));
  ctx.fillStyle = accent;
  ctx.beginPath(); ctx.arc(xToPx(x), eToPx(-x*x), 4.5, 0, 7); ctx.fill();
  ctx.fillStyle = ink; ctx.globalAlpha = 0.65;
  ctx.font = '9px ui-monospace, monospace';
  ctx.textAlign = 'left';   ctx.fillText('negative', pad, H - 3);
  ctx.textAlign = 'right';  ctx.fillText('the page', W - pad, H - 3);
  ctx.textAlign = 'center'; ctx.fillText('50%', W/2, top - 2);
  ctx.globalAlpha = 1;
}

// ---------- Fig. 2 (unchanged capacity replication) ----------

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
    const net = new Hopfield(pats);
    for (let s = 0; s < n; s++) {
      net.setState(pats[s]); net.relax(60);
      const d = net.hammingTo(s);
      trials++; if (d === 0) exact++;
      let b = bins.length - 1;
      for (let k = 0; k < bins.length - 1; k++)
        if (d >= bins[k] && d < bins[k+1]) { b = k; break; }
      counts[b]++;
    }
  }
  drawFig2(counts.map(c => c / trials), n);
  $('#fig2-out').textContent =
    `n = ${n}, N = 100: ${Math.round(100*exact/trials)}% of memories recalled ` +
    `with zero errors. The paper: about 0.15 N before recall fails.`;
}

function drawFig2(probs, n) {
  const cv = $('#fig2-chart'), ctx = cv.getContext('2d');
  const W = cv.width, H = cv.height, base = H - 26, left = 30;
  ctx.clearRect(0, 0, W, H);
  const ink = getComputedStyle(document.documentElement).getPropertyValue('--ink').trim() || '#1a1816';
  ctx.strokeStyle = ink; ctx.fillStyle = ink; ctx.lineWidth = 1;
  ctx.strokeRect(left, 6, W - left - 6, base - 6);
  const bw = (W - left - 6) / probs.length;
  probs.forEach((p, i) => {
    const h = (base - 10) * p, x = left + i*bw + 3, y = base - h;
    ctx.save(); ctx.beginPath(); ctx.rect(x, y, bw - 6, h); ctx.clip();
    ctx.beginPath();
    for (let s = -H; s < bw + H; s += 5) { ctx.moveTo(x + s, y); ctx.lineTo(x + s - H, y + H); }
    ctx.stroke(); ctx.restore();
    ctx.strokeRect(x, y, bw - 6, h);
  });
  ctx.font = '10px ui-monospace, monospace'; ctx.textAlign = 'center';
  ['0','1-2','3-5','6-9','10-','20-','30-','40-','>49'].forEach((l, i) =>
    ctx.fillText(l, left + i*bw + bw/2, H - 14));
  ctx.fillText('errors in the rebuilt memory', (W + left) / 2, H - 2);
  ctx.textAlign = 'left'; ctx.fillText(`n = ${n} memories, N = 100`, left + 8, 20);
}

// ---------- helpers + wiring ----------

function fmtE(e) { return e.toLocaleString('en-US', { maximumFractionDigits: 0 }); }
function setStatus(s) { $('#status').textContent = s; }
function setVerdict(s) { $('#verdict').textContent = s; }

function wireControls() {
  $('#btn-heal').onclick = heal;
  $('#btn-reset').onclick = resetPage;
  $('#btn-merge').onclick = () => toggleMerge(!state.merged);
  $('#btn-fig2').onclick = () => runFig2(+$('#fig2-n').value);
}
