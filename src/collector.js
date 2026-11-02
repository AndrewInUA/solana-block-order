/**
 * Reads the blocks our probes aimed at and records where each probe landed.
 *
 * This is the evidence step. For every batch we fetch the finalized blocks of the
 * target window via getBlock, then for each probe we find its signature in the
 * block and record its position (index among all transactions, and rank among
 * only our probes in that block). Position in the block IS the ordering the
 * leader chose; that is the quantity the whole project is about.
 *
 * Everything written here is re-derivable by a judge: given a signature and slot,
 * getBlock returns the same index.
 */

const { getBlock } = require("./rpc");

function indexOfSignature(block, signature) {
  const txs = block.transactions || [];
  for (let i = 0; i < txs.length; i++) {
    const sigs = txs[i].transaction.signatures || [];
    if (sigs.includes(signature)) return i;
  }
  return -1;
}

async function collectBatch(conn, batch, log, finalizedSlot) {
  const landed = [];
  const slots = batch.windowSlots;
  const blocks = {};

  for (const slot of slots) {
    // Never fetch a slot that is not finalized yet. In a dry run the target
    // windows are in the future, so this skips them instead of hammering the RPC.
    if (finalizedSlot != null && slot > finalizedSlot) {
      blocks[slot] = null;
      continue;
    }
    try {
      blocks[slot] = await getBlock(conn, slot);
    } catch (err) {
      blocks[slot] = null;
      log.warn("getBlock failed", { slot, error: String(err && err.message ? err.message : err) });
    }
  }

  for (const probe of batch.probes) {
    if (probe.skipped) continue;
    const signature = probe.sentSignature || probe.signature;
    let found = null;
    for (const slot of slots) {
      const block = blocks[slot];
      if (!block) continue;
      const idx = indexOfSignature(block, signature);
      if (idx >= 0) {
        found = { slot, blockIndex: idx, totalTxInBlock: (block.transactions || []).length };
        break;
      }
    }
    landed.push({
      signature,
      computeUnitPrice: probe.computeUnitPrice,
      sentAtMs: probe.sentAtMs || null,
      sentAtSlot: probe.sentAtSlot || null,
      landed: Boolean(found),
      ...(found || {})
    });
  }

  // Rank among our own probes across the whole window (0 = earliest). Slot then
  // block index is the order the leader actually produced, including the case
  // where two probes landed in different slots of the same 4-slot window.
  const inWindow = landed.filter(l => l.landed);
  inWindow.sort((a, b) => a.slot - b.slot || a.blockIndex - b.blockIndex);
  inWindow.forEach((l, rank) => {
    l.rankAmongOurs = rank;
  });

  return {
    validator: batch.validator,
    client: batch.client,
    windowSlots: slots,
    landed,
    landedCount: landed.filter(l => l.landed).length,
    sentCount: batch.probes.filter(p => !p.skipped).length
  };
}

async function collect(conn, batches, log) {
  let finalizedSlot = null;
  try {
    finalizedSlot = await conn.getSlot("finalized");
  } catch (err) {
    log.warn("could not read finalized slot; will attempt all blocks", { error: String(err.message || err) });
  }
  const results = [];
  for (const batch of batches) {
    results.push(await collectBatch(conn, batch, log, finalizedSlot));
  }
  return results;
}

module.exports = { collect, collectBatch, indexOfSignature };
