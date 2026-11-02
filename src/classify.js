/**
 * Which client / fork does a validator run?
 *
 * getClusterNodes on current mainnet returns a `clientId` string (JitoLabs,
 * Agave, AgaveBam, Firedancer, HarmonicFiredancer, ...). That is the honest
 * signal. Version strings cannot tell Jito from Agave — both report 4.x — and
 * they mislabel some Firedancer nodes that still advertise 0.1.1.
 *
 * Sources, best first:
 *   1. a manual override by identity (config/overrides.json),
 *   2. validators.app software_client (when a token is set),
 *   3. gossip clientId from getClusterNodes,
 *   4. the version-string heuristic, as a last resort.
 *
 * Each gossip clientId is its own family. Lumping HarmonicFiredancer with
 * Firedancer would hide the thing this bounty is trying to measure.
 */

function familyFromLabel(label) {
  const raw = String(label || "").trim();
  if (!raw || raw === "unknown") return "unknown";
  if (/^Unknown\(/i.test(raw)) return "unknown";
  return raw;
}

function fromVersionString(version) {
  const v = String(version || "").trim();
  if (!v) return { client: "unknown", family: "unknown" };
  const major = Number(v.split(".")[0]);
  if (Number.isFinite(major) && major >= 20) {
    return { client: "Firedancer", family: "Firedancer" };
  }
  if (/^0\./.test(v)) {
    // Last resort only. Some Firedancer nodes still advertise 0.1.1; gossip
    // clientId is preferred and will override this when present.
    return { client: "Firedancer-0.x", family: "Firedancer-0.x" };
  }
  return { client: "Agave-family", family: "Agave-family" };
}

function fromValidatorsApp(record) {
  if (!record) return null;
  const c = String(record.software_client || "").trim();
  if (!c) return null;
  return { client: c, family: familyFromLabel(c) };
}

function fromGossip(node) {
  if (!node) return null;
  const id = node.clientId;
  if (!id || /^Unknown/i.test(String(id))) return null;
  return { client: String(id), family: familyFromLabel(id) };
}

/**
 * Returns { client, family, version, source }.
 */
function classify(identity, node, context) {
  const overrides = (context && context.overrides) || {};
  const vapp = (context && context.validatorsApp) || {};
  const version = node && node.version ? node.version : null;

  if (overrides[identity]) {
    const label = overrides[identity];
    return { client: label, family: familyFromLabel(label), version, source: "override" };
  }

  const fromApp = fromValidatorsApp(vapp[identity]);
  if (fromApp) {
    return {
      ...fromApp,
      version: version || (vapp[identity] && vapp[identity].software_version) || null,
      source: "validators.app"
    };
  }

  const gossip = fromGossip(node);
  if (gossip) {
    return { ...gossip, version, source: "gossip-clientId" };
  }

  const guess = fromVersionString(version);
  return { ...guess, version, source: "version-string" };
}

module.exports = { classify, fromVersionString, familyFromLabel, fromGossip };
