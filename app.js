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
  // p. 2554 — the abstract
  `<strong>Memory looked up by content, not address.</strong> A computer fetches
   “slot #4837.” This is handed a fragment, or a damaged copy, and gives back
   the whole — the way a glimpse of a face brings back the face. Hopfield's
   name for it is in the abstract's first line: <em>content-addressable
   memory</em>.`,

  // p. 2555 — equations [1] and [2]
  `<strong>The two working rules.</strong> <b>[1]</b> is recall: each switch
   flips to match what the others are telling it. That is what rebuilds your
   scribbles, and the panel on the right runs this exact line, pixel by pixel.
   <b>[2]</b> is storage: link two pixels that agree in a stored page.
   <span class="note-eq">T<sub>ij</sub> = ∑<sub>s,r</sub> ξ<sub>i</sub><sup>s</sup> <b>(G<sup>−1</sup>)<sub>sr</sub></b> ξ<sub>j</sub><sup>r</sup></span>
   One change here is not from 1982: storage uses the 1985 projection rule
   above. <b>G</b> is how much the pages overlap; set <b>G</b> to the identity
   and it collapses back into <b>[2]</b>. Five pages of one journal overlap far
   too much for <b>[2]</b> — the toggle on the right shows them merging.`,

  // p. 2556 — equations [7] and [8]
  `<strong>[7] is the energy — the whole theory.</strong> One number for how
   much the switches disagree with their wiring; <b>[8]</b> proves recall can
   only lower it. So memories are valleys, and a scribbled page is a ball
   rolling to the nearest floor. Hopfield, four lines down: <em>“This case is
   isomorphic with an Ising model… when T<sub>ij</sub> is symmetric but has a
   random character (the spin glass) there are known to be many (locally)
   stable states.”</em> An Ising model is a magnet. That is why a paper about
   neurons is physics.`,

  // p. 2557 — Fig. 2, the attractor sentence, the merge warning
  `<strong>He names the valleys here.</strong> In italics, right column:
   <em>“The phase space flow is apparently dominated by attractors which are
   the nominally assigned memories.”</em> An attractor: many different starts,
   one shared ending. Scribble this page two completely different ways and
   watch both land on the identical print. Also here, the warning that forced
   the 1985 rule: <em>“memories too close to each other are confused and tend
   to merge.”</em> And Fig. 2 — the capacity experiment, re-runnable just
   below.`,

  // p. 2558 — discussion
  `<strong>It fails softly.</strong> Overload it and recall degrades instead of
   collapsing — the closing pages are about categories, forgetting, and why
   this behaves like real memory. Forty-two years later it won the Nobel Prize
   in Physics, and the continuous version of rule <b>[1]</b> turned out to be
   the “attention” inside every chatbot you use.`,
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
  heals: [],      // per-page: how many scribbles have healed back exactly
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
  setStatus('five pages loaded and stored — ready');
  state.introTimers.push(setTimeout(narrateIntro, 150));
  if (location.search.includes('debug')) document.body.classList.add('debug');
}

// ---------- stage: all five pages stacked, scrollable, each scribbleable ----------

function buildStage() {
  const host = $('#stage-scroll');
  PAGES.forEach((p, i) => {
    state.works[i] = Uint8Array.from(state.patterns[i]);
    state.touched[i] = false;
    state.heals[i] = 0;
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
    // Fig. 2 is printed on p. 2557 — put its live re-run right under that page,
    // so you meet the experiment where the paper shows it.
    if (p.label === 'p. 2557') {
      const bench = $('#fig2-block');
      if (bench) host.appendChild(bench);
    }
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
  if (state.healing) stopHeal();
  clearTimeout(state.autoHeal);
  setActive(i);

  // On a phone (touch-action: pan-y) a vertical swipe must scroll, not draw.
  // Mouse/pen draw immediately; touch only starts drawing once the finger
  // moves sideways — so a scroll gesture never leaves a stray mark.
  const isTouch = e.pointerType === 'touch';
  if (!isTouch) e.preventDefault();
  const start = canvasXY(e, cv);
  let drawing = !isTouch;
  const begin = () => {
    drawing = true;
    state.touched[i] = true;
    try { cv.setPointerCapture(e.pointerId); } catch (_) {}
    setStatus('rubbing out the ink…');
  };
  if (drawing) { begin(); brush(start[0], start[1], i); render(i); }

  const move = ev => {
    const [mx, my] = canvasXY(ev, cv);
    if (!drawing) {
      if (Math.abs(mx - start[0]) > 6) begin(); else return;
    }
    brush(mx, my, i); render(i);
  };
  const cleanup = () => {
    cv.removeEventListener('pointermove', move);
    cv.removeEventListener('pointerup', up);
    cv.removeEventListener('pointercancel', cleanup);
  };
  const up = () => {
    cleanup();
    if (state.touched[i]) {
      setStatus('let go — now watch the page rebuild itself…');
      state.autoHeal = setTimeout(heal, 600);
    }
  };
  cv.addEventListener('pointermove', move);
  cv.addEventListener('pointerup', up, { once: true });
  cv.addEventListener('pointercancel', cleanup, { once: true });
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
    showLive(net, true);
    drawTrace();
    if (net.stable) {
      state.healing = false;
      cv.classList.remove('healing');
      showLive(net, false);
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
  const N = state.N.toLocaleString('en-US');

  // The verdict is a measurement, not a lecture — what "attractor" means is
  // explained once, in the physics section. Here it is just the number.
  if (state.merged) {
    setVerdict(`ghost — all five pages merged`);
    setStatus("Hopfield's 1982 rule: the pages blur together");
    return;
  }
  if (own === 0) {
    state.heals[i]++;
    setVerdict(state.heals[i] === 1
      ? `${label} · exact · 0 of ${N} pixels wrong`
      : `${label} · exact · ${state.heals[i]} scribbles → 1 identical ending`);
    setStatus(state.heals[i] === 1
      ? 'rebuilt — now wreck it again, somewhere else'
      : 'rebuilt');
  } else if (own === state.N) {
    setVerdict(`negative of ${label} · ${N} of ${N} pixels inverted`);
    setStatus('settled in the opposite valley');
  } else if (best !== i) {
    setVerdict(`${PAGES[best].label} · wrong page · ` +
      `${own.toLocaleString('en-US')} pixels off ${label}`);
    setStatus('settled in a neighbouring valley');
  } else {
    setVerdict(`${label} · ${(100*own/state.N).toFixed(2)}% off · ` +
      `${own.toLocaleString('en-US')} pixels`);
    setStatus('settled just short of the floor');
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
  net_clearLive();
  render(i);
  drawTrace();
  setStatus('page restored');
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

  await sayIntro('Watch — we rub a hole straight through the print.');
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

  await sayIntro('It found the page it remembers.\nYour turn ↓');
  await wait(2000);
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
      showLive(net, true);
      $('#e-value').textContent = fmtE(net.energy());
      drawTrace();
      if (net.stable) {
        cv.classList.remove('healing');
        showLive(net, false);
        return res();
      }
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
  setStatus('your turn');
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
  ctx.fillStyle = accent; ctx.textAlign = 'left';
  ctx.fillText('E — equation [7]', pad, top + 8);
  ctx.globalAlpha = 1;
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

// Show the real values the recall rule just ran on. `h` and the branch taken
// come straight out of updateOne — this is a readout, not a re-enactment.
function net_clearLive() {
  const n = activeNet();
  if (n) n.lastFlip = null;
  showLive(n, false);
}

function showLive(net, running) {
  const f = net.lastFlip;
  $('#lc-state').textContent = running ? 'running' : (f ? 'settled' : 'idle');
  ['#lc-b1', '#lc-b2', '#lc-b3'].forEach(s => $(s).classList.remove('on'));
  $('#lc-flips').textContent = net.flips.toLocaleString('en-US');
  if (!f) { $('#lc-h').textContent = '—'; $('#lc-i').textContent = '—'; return; }
  $('#lc-i').textContent = f.i.toLocaleString('en-US');
  $('#lc-h').textContent = (f.h >= 0 ? '+' : '') + f.h.toLocaleString('en-US',
    { minimumFractionDigits: 3, maximumFractionDigits: 3 });
  $('#lc-b' + (f.h > 0 ? 1 : f.h < 0 ? 2 : 3)).classList.add('on');
}
function setStatus(s) { $('#status').textContent = s; }
function setVerdict(s) { $('#verdict').textContent = s; }

function wireControls() {
  $('#btn-heal').onclick = heal;
  $('#btn-reset').onclick = resetPage;
  $('#btn-merge').onclick = () => toggleMerge(!state.merged);
  $('#btn-fig2').onclick = () => runFig2(+$('#fig2-n').value);
}
