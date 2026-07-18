// Hopfield 1982 — "Neural networks and physical systems with emergent
// collective computational abilities", PNAS 79:2554-2558.
//
// Faithful to the paper's math:
//   Eq [1]  V_i -> 1 if sum_{j!=i} T_ij V_j > U_i, -> 0 if below —
//           asynchronous, random order.
//   Eq [2]  T_ij = sum_s (2V_i^s - 1)(2V_j^s - 1), T_ii = 0.
//   Eq [7]  E = -1/2 sum_{i!=j} T_ij V_i V_j — monotonically decreasing
//           under rule [1] (Eq [8]).
//
// Two variable choices, both from the paper:
//   mode 'binary' — V in {0,1}, U_i = 0 (the paper's default; used for the
//           Fig. 2 replication, which is the paper's own simulation).
//   mode 'spin'   — the p. 2557 refinement: "a judicious choice of individual
//           neuron thresholds ... is equivalent to using variables
//           mu_i = +-1 ... and a threshold level of 0." Used for the print
//           healing, where patterns are sparse ink on white.
//
// T is never materialized: with the Hebbian T of Eq [2] the field on neuron i
// is computed from the overlaps m_s = xi^s . state, maintained incrementally —
// algebraically identical to the dense T, update by update.

class Hopfield {
  // patterns: array of equal-length 0/1 arrays (the V^s of Eq [2])
  constructor(patterns, mode = 'binary') {
    this.N = patterns[0].length;
    this.n = patterns.length;
    this.spin = mode === 'spin';
    this.xi = patterns.map(p => Int8Array.from(p, v => 2 * v - 1));
    this.V = new Uint8Array(this.N); // external state is always 0/1 (ink bits)
    this.m = new Float64Array(this.n);
    this.S = 0; // sum_i V_i
    this.order = new Uint32Array(this.N);
    for (let i = 0; i < this.N; i++) this.order[i] = i;
    this.cursor = 0;
    this.flipsInPass = 0;
    this.stable = false;
  }

  setState(v) {
    this.V.set(v);
    this.S = 0;
    this.m.fill(0);
    for (let i = 0; i < this.N; i++) {
      if (this.V[i]) this.S++;
      const u = this.spin ? 2 * this.V[i] - 1 : this.V[i];
      if (u) for (let s = 0; s < this.n; s++) this.m[s] += this.xi[s][i] * u;
    }
    this._newPass();
    this.stable = false;
  }

  _newPass() {
    // fresh random order each pass — "each neuron readjusts its state
    // randomly in time" with mean attempt rate W
    for (let i = this.N - 1; i > 0; i--) {
      const j = (Math.random() * (i + 1)) | 0;
      const t = this.order[i]; this.order[i] = this.order[j]; this.order[j] = t;
    }
    this.cursor = 0;
    this.flipsInPass = 0;
  }

  // one neuron readjustment, Eq [1]; returns 1 if it flipped
  updateOne(i) {
    let h = 0;
    for (let s = 0; s < this.n; s++) h += this.xi[s][i] * this.m[s];
    // remove the j = i diagonal term (T_ii = 0)
    h -= this.n * (this.spin ? 2 * this.V[i] - 1 : this.V[i]);
    const nv = h > 0 ? 1 : h < 0 ? 0 : this.V[i];
    if (nv === this.V[i]) return 0;
    const d = (nv ? 1 : -1) * (this.spin ? 2 : 1);
    this.V[i] = nv;
    this.S += nv ? 1 : -1;
    for (let s = 0; s < this.n; s++) this.m[s] += this.xi[s][i] * d;
    return 1;
  }

  // visit k neurons in the async schedule.
  // Sets this.stable when a whole pass completes with zero flips.
  step(k) {
    if (this.stable) return;
    for (let t = 0; t < k; t++) {
      const i = this.order[this.cursor++];
      if (this.updateOne(i)) this.flipsInPass++;
      if (this.cursor >= this.N) {
        if (this.flipsInPass === 0) { this.stable = true; return; }
        this._newPass();
      }
    }
  }

  relax(maxPasses = 100) {
    for (let p = 0; p < maxPasses; p++) {
      if (this.stable) return p;
      this.step(this.N);
    }
    return maxPasses;
  }

  // Eq [7] via the factorization.
  // binary: E = -1/2 (sum_s m_s^2 - n S);  spin: E = -1/2 (sum_s m_s^2 - n N)
  energy() {
    let e = 0;
    for (let s = 0; s < this.n; s++) e += this.m[s] * this.m[s];
    return -0.5 * (e - this.n * (this.spin ? this.N : this.S));
  }

  hammingTo(s) {
    let d = 0;
    const xi = this.xi[s];
    for (let i = 0; i < this.N; i++) d += (this.V[i] !== (xi[i] > 0 ? 1 : 0));
    return d;
  }
}

if (typeof module !== 'undefined') module.exports = { Hopfield };
