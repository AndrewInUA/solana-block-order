/**
 * RPC helpers. Thin wrappers over @solana/web3.js so the rest of the code reads
 * in terms of leaders, windows, and blocks instead of raw RPC calls.
 */

const { Connection } = require("@solana/web3.js");

function connect(url, commitment) {
  return new Connection(url, commitment || "confirmed");
}

async function epochInfo(conn) {
  const info = await conn.getEpochInfo();
  const epochStartSlot = info.absoluteSlot - info.slotIndex;
  return { ...info, epochStartSlot };
}

/**
 * Leader schedule keyed by identity, values are absolute slots for this epoch.
 * The RPC returns slot indices relative to the epoch start; we add the start.
 */
async function leaderSchedule(conn, epochStartSlot) {
  const raw = await conn.getLeaderSchedule();
  const byIdentity = {};
  for (const identity of Object.keys(raw || {})) {
    byIdentity[identity] = (raw[identity] || []).map(i => epochStartSlot + i);
  }
  return byIdentity;
}

/**
 * Cluster nodes give us each identity's gossip version and TPU address. The
 * version string is the first, cheapest signal for which client a node runs.
 */
async function clusterNodes(conn) {
  const nodes = await conn.getClusterNodes();
  const byIdentity = {};
  for (const node of nodes) {
    byIdentity[node.pubkey] = node;
  }
  return byIdentity;
}

/**
 * A finalized block with signatures in order. maxSupportedTransactionVersion
 * is required or versioned transactions make getBlock throw.
 */
async function getBlock(conn, slot) {
  return conn.getBlock(slot, {
    maxSupportedTransactionVersion: 0,
    transactionDetails: "full",
    rewards: false,
    commitment: "finalized"
  });
}

module.exports = {
  connect,
  epochInfo,
  leaderSchedule,
  clusterNodes,
  getBlock
};
