/**
 * Just enough statistics to be honest, dependency-free.
 *
 * Kendall's tau-b measures rank agreement between two series: here, the priority
 * price we set and the position the probe landed at. A permutation test gives a
 * p-value without assuming a distribution, which suits small samples. The point
 * is not to dress a weak result up as strong: a null is a valid answer.
 */

function kendallTau(pairs) {
  const n = pairs.length;
  if (n < 2) return { tau: null, n, concordant: 0, discordant: 0 };
  let concordant = 0;
  let discordant = 0;
  let tiesX = 0;
  let tiesY = 0;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const dx = Math.sign(pairs[i][0] - pairs[j][0]);
      const dy = Math.sign(pairs[i][1] - pairs[j][1]);
      if (dx === 0 && dy === 0) continue;
      if (dx === 0) { tiesX++; continue; }
      if (dy === 0) { tiesY++; continue; }
      if (dx === dy) concordant++;
      else discordant++;
    }
  }
  const n0 = (n * (n - 1)) / 2;
  const denom = Math.sqrt((n0 - tiesX) * (n0 - tiesY));
  const tau = denom === 0 ? 0 : (concordant - discordant) / denom;
  return { tau, n, concordant, discordant };
}

function shuffle(arr, rng) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Deterministic RNG so a judge re-running analysis gets the same p-value.
function mulberry32(seed) {
  let t = seed >>> 0;
  return function () {
    t += 0x6d2b79f5;
    let x = Math.imul(t ^ (t >>> 15), 1 | t);
    x ^= x + Math.imul(x ^ (x >>> 7), 61 | x);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

function permutationPValue(pairs, iterations) {
  const n = pairs.length;
  if (n < 3) return { p: null, iterations: 0 };
  const observed = Math.abs(kendallTau(pairs).tau);
  const xs = pairs.map(p => p[0]);
  const ys = pairs.map(p => p[1]);
  const rng = mulberry32(1337);
  let atLeast = 0;
  const iters = iterations || 2000;
  for (let k = 0; k < iters; k++) {
    const shuffled = shuffle(ys, rng);
    const t = Math.abs(kendallTau(xs.map((x, i) => [x, shuffled[i]])).tau);
    if (t >= observed - 1e-12) atLeast++;
  }
  return { p: (atLeast + 1) / (iters + 1), iterations: iters };
}

module.exports = { kendallTau, permutationPValue };
