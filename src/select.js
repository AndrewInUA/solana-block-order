/**
 * Picks the validators to probe.
 *
 * The listing requires at least 6 validators spanning at least 3 distinct
 * clients/forks. We select from validators that have future leader windows this
 * epoch (so there is something to aim at). We spread the picks across client
 * families so the 3-family floor is met by construction, and refuse to proceed
 * if it cannot be.
 *
 * We sort by upcoming window count, not by stake. Stake-weighted QoS helps *our*
 * packets when *we* have stake; the leader's stake does not change how they
 * order what they already have. More upcoming windows means more chances to land.
 */

// Open-source baselines first: Agave is the documented scheduler, Firedancer is
// the other public client, Jito is the undocumented fork that holds a lot of
// stake. Other gossip clientIds fill the rest so the set stays diverse.
const BASELINE_FAMILIES = ["Agave", "JitoLabs", "Firedancer"];

function orderedFamilies(families) {
  const preferred = BASELINE_FAMILIES.filter(f => families.includes(f));
  const rest = families.filter(f => !preferred.includes(f)).sort();
  return [...preferred, ...rest];
}

function groupByFamily(candidates) {
  const byFamily = {};
  for (const c of candidates) {
    (byFamily[c.client.family] ||= []).push(c);
  }
  return byFamily;
}

function windowCount(c) {
  if (c.futureWindows) return c.futureWindows.length;
  return (c.leaderSlots || []).length;
}

/**
 * candidates: [{ identity, node, client, leaderSlots, futureWindows }]
 * Returns { chosen, families, ok, reason }.
 */
function selectValidators(candidates, opts) {
  const minValidators = (opts && opts.minValidators) || 6;
  const minFamilies = (opts && opts.minFamilies) || 3;

  const upcoming = candidates.filter(c => windowCount(c) > 0);
  const wellClassified = upcoming.filter(c => {
    const src = c.client && c.client.source;
    return src === "gossip-clientId" || src === "override" || src === "validators.app";
  });
  const usable = wellClassified.length >= minValidators ? wellClassified : upcoming;
  const byFamily = groupByFamily(usable);
  const families = Object.keys(byFamily).filter(f => f !== "unknown");

  if (families.length < minFamilies) {
    return {
      chosen: [],
      families,
      ok: false,
      reason: `only ${families.length} client families found among upcoming leaders; need ${minFamilies}`
    };
  }

  const order = orderedFamilies(families);
  for (const f of order) {
    byFamily[f].sort((a, b) => windowCount(b) - windowCount(a));
  }

  const chosen = [];
  let i = 0;
  while (chosen.length < Math.max(minValidators, minFamilies) && order.some(f => byFamily[f].length)) {
    const family = order[i % order.length];
    if (byFamily[family].length) chosen.push(byFamily[family].shift());
    i++;
    if (i > 10000) break;
  }

  const chosenFamilies = new Set(chosen.map(c => c.client.family));
  const ok = chosen.length >= minValidators && chosenFamilies.size >= minFamilies;

  return {
    chosen,
    families: [...chosenFamilies],
    ok,
    reason: ok ? "" : `selected ${chosen.length} validators across ${chosenFamilies.size} families`
  };
}

module.exports = { selectValidators, groupByFamily, orderedFamilies, BASELINE_FAMILIES };
