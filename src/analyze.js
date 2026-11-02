/**
 * Turns landed probes into a per-validator verdict about the ordering rule.
 *
 * For the priority experiment the hypothesis is: a higher compute-unit price
 * lands earlier in the block. We test the relationship between price and
 * within-window rank using Kendall's tau and a permutation p-value. We then read
 * out one of three honest verdicts:
 *   - "priority-ordered"  : strong negative tau (higher price -> earlier), low p
 *   - "weak/partial"      : a signal, but not clean
 *   - "no-rule/noise"     : tau near zero or not significant, or too few samples
 * Too few landed probes means we say so, not that we guess.
 *
 * Collector results arrive one-per-window. We fold them by validator identity
 * before scoring, otherwise a 3-window run would look like three validators.
 */

const { kendallTau, permutationPValue } = require("./stats");

function verdictFor(tau, p, n) {
  if (n < 6) return "insufficient-data";
  if (p == null) return "insufficient-data";
  // price up, rank down (earlier) => negative tau is the "priority wins" sign.
  const strong = tau <= -0.5 && p < 0.05;
  const weak = tau <= -0.2 && p < 0.1;
  if (strong) return "priority-ordered";
  if (weak) return "weak/partial";
  if (p >= 0.1 || Math.abs(tau) < 0.2) return "no-rule/noise";
  return "weak/partial";
}

function scorePairs(pairs) {
  const { tau, n } = kendallTau(pairs);
  const { p } = permutationPValue(pairs, 3000);
  return { tau, n, p, verdict: verdictFor(tau, p, n) };
}

function analyzeValidator(result) {
  const landed = result.landed.filter(l => l.landed && typeof l.rankAmongOurs === "number");

  const pricePairs = landed.map(l => [l.computeUnitPrice, l.rankAmongOurs]);
  const priceScore = scorePairs(pricePairs);

  // Confound check: if send order explains landing better than price, we say so.
  const sendPairs = landed
    .filter(l => typeof l.sendIndex === "number" || typeof l.sentAtMs === "number")
    .map(l => [typeof l.sendIndex === "number" ? l.sendIndex : l.sentAtMs, l.rankAmongOurs]);
  const sendScore = sendPairs.length ? scorePairs(sendPairs) : { tau: null, n: 0, p: null, verdict: "insufficient-data" };

  return {
    validator: result.validator,
    client: result.client,
    windows: result.windows || result.windowSlots,
    windowCount: (result.windows || [result.windowSlots]).length,
    sent: result.sentCount,
    landed: result.landedCount,
    landRate: result.sentCount ? result.landedCount / result.sentCount : 0,
    samplesUsed: priceScore.n,
    kendallTau: priceScore.tau,
    pValue: priceScore.p,
    verdict: priceScore.verdict,
    sendOrderTau: sendScore.tau,
    sendOrderP: sendScore.p,
    sendOrderVerdict: sendScore.verdict
  };
}

function groupByValidator(results) {
  const byVal = {};
  for (const r of results) {
    const id = r.validator;
    if (!byVal[id]) {
      byVal[id] = {
        validator: id,
        client: r.client,
        windows: [],
        landed: [],
        sentCount: 0,
        landedCount: 0
      };
    }
    byVal[id].windows.push(r.windowSlots);
    byVal[id].landed.push(...(r.landed || []));
    byVal[id].sentCount += r.sentCount;
    byVal[id].landedCount += r.landedCount;
  }
  return Object.values(byVal);
}

function analyze(results) {
  const grouped = groupByValidator(results);
  const perValidator = grouped.map(analyzeValidator);

  const byFamily = {};
  for (const v of perValidator) {
    const fam = (v.client && v.client.family) || "unknown";
    (byFamily[fam] ||= []).push(v);
  }
  const perFamily = Object.keys(byFamily).map(fam => {
    const members = byFamily[fam];
    const verdicts = {};
    for (const m of members) verdicts[m.verdict] = (verdicts[m.verdict] || 0) + 1;
    return {
      family: fam,
      validators: members.length,
      totalLanded: members.reduce((s, m) => s + m.landed, 0),
      verdicts
    };
  });

  return { perValidator, perFamily };
}

module.exports = { analyze, analyzeValidator, verdictFor, groupByValidator };
