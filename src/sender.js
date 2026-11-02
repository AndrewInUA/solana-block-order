/**
 * Builds and (optionally) sends the probe batches.
 *
 * Default is dry-run: every probe is built and signed, the budget is accounted,
 * and the intended batch is written to disk — but nothing touches the network.
 * Live sending happens only when cfg.live is true AND a funding key is present.
 *
 * One batch targets one leader window. Within a batch each probe has its own fee
 * payer and a distinct priority price from the ladder, so inside a single block
 * the only thing that differs between our probes is the one knob we are testing.
 *
 * Live sends rebuild each probe with a fresh blockhash at send time. A blockhash
 * from plan-time is already dead by the time a window several minutes away opens.
 */

const bs58 = require("./base58");
const { buildProbe } = require("./txBuilder");
const { Budget } = require("./budget");

function assignPrices(ladder, count) {
  const prices = [];
  for (let i = 0; i < count; i++) prices.push(ladder[i % ladder.length]);
  return prices;
}

function shuffleInPlace(arr, rng) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function mulberry32(seed) {
  let t = seed >>> 0;
  return function () {
    t += 0x6d2b79f5;
    let x = Math.imul(t ^ (t >>> 15), 1 | t);
    x ^= x + Math.imul(x ^ (x >>> 7), 61 | x);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

async function buildBatches(cfg, conn, plan, signers, budget) {
  const cap = budget || new Budget(cfg.feeCapLamports);
  const { cuLimit, priorityLadder, signersPerWindow } = cfg.experiment;
  const batches = [];
  let blockhashCache = null;
  let blockhashAt = 0;

  for (const target of plan.targets) {
    const count = Math.min(signersPerWindow, signers.length);
    const prices = assignPrices(priorityLadder, count);

    const now = Date.now();
    if (!blockhashCache || now - blockhashAt > 20000) {
      try {
        const bh = await conn.getLatestBlockhash("finalized");
        blockhashCache = bh.blockhash;
        blockhashAt = now;
      } catch (err) {
        blockhashCache = blockhashCache || "11111111111111111111111111111111";
      }
    }

    const probes = [];
    for (let i = 0; i < count; i++) {
      const price = prices[i];
      const fee = Budget.feeFor(price, cuLimit);
      const tag = `sbo:${target.identity.slice(0, 6)}:w${target.windowSlots[0]}:p${price}`;
      const reserved = cap.tryReserve(fee, { target: target.identity, price });
      if (!reserved) {
        probes.push({ skipped: true, reason: "fee cap reached", price, fee });
        continue;
      }
      const probe = buildProbe({
        payer: signers[i],
        recentBlockhash: blockhashCache,
        computeUnitPrice: price,
        cuLimit,
        tag
      });
      probes.push({
        skipped: false,
        signatureB64: probe.signatureB64,
        signature: bs58.encode(Buffer.from(probe.signatureB64, "base64")),
        raw: Buffer.from(probe.tx.serialize()).toString("base64"),
        ...probe.meta,
        feeLamports: fee
      });
    }

    batches.push({
      validator: target.identity,
      client: target.client,
      windowSlots: target.windowSlots,
      tpu: target.tpu || null,
      probes
    });
  }

  return { batches, budget: cap };
}

async function waitForSlot(conn, targetSlot, windowEnd, maxWaitMs, onNear) {
  const start = Date.now();
  let notified = false;
  while (Date.now() - start < maxWaitMs) {
    const slot = await conn.getSlot("processed");
    if (slot > windowEnd) return { missed: true, slot, reason: "window already passed" };
    const slotsLeft = targetSlot - slot;
    // Fetch the blockhash a few seconds out, then send about two slots before
    // the window so the RPC hop still lands inside it.
    if (!notified && onNear && slotsLeft < 40) {
      notified = true;
      Promise.resolve(onNear()).catch(() => {});
    }
    if (slot >= targetSlot - 2) return { missed: false, slot };
    // A leader window is only a few slots. A slow getSlot can step over it,
    // so once we are close we poll as fast as the RPC answers.
    const sleep = slotsLeft > 150 ? 2000 : slotsLeft > 40 ? 200 : 40;
    await new Promise(r => setTimeout(r, sleep));
  }
  return { missed: true, slot: null, reason: "timed out waiting for window" };
}

/**
 * Live send. Waits until the window is about to open, rebuilds every probe
 * against a fresh blockhash, shuffles send order so it is not the same as the
 * price ladder, then fires them together via sendRawTransaction.
 */
async function sendBatchLive(opts) {
  const { conn, sendConn, batch, signersByPubkey, cfg, log } = opts;
  const windowEnd = batch.windowSlots[batch.windowSlots.length - 1];
  const nowSlot = await conn.getSlot("processed");
  const slotsLeft = Math.max(0, batch.windowSlots[0] - nowSlot);
  // Slots are about 200ms. Wait for the real gap, plus three minutes, and no
  // longer than the rest of a long epoch. A fixed 30 minutes misses later windows.
  const maxWait = Math.min(12 * 60 * 60 * 1000, slotsLeft * 250 + 3 * 60 * 1000);
  let bhPromise = null;
  const waited = await waitForSlot(conn, batch.windowSlots[0], windowEnd, maxWait, () => {
    bhPromise = sendConn.getLatestBlockhash("confirmed");
    return bhPromise;
  });
  if (waited.missed) {
    log.warn("window missed before send", {
      validator: batch.validator,
      window: batch.windowSlots[0],
      reason: waited.reason
    });
    batch.sendResult = { sent: false, reason: waited.reason };
    return batch;
  }

  const bh = bhPromise ? await bhPromise : await sendConn.getLatestBlockhash("confirmed");
  const ready = batch.probes.filter(p => !p.skipped);
  const rng = mulberry32(batch.windowSlots[0] >>> 0);
  shuffleInPlace(ready, rng);

  const sendAtSlot = waited.slot;
  const sendAtMs = Date.now();
  let sent = 0;

  await Promise.all(
    ready.map(async (p, sendIndex) => {
      const payer = signersByPubkey[p.payer];
      if (!payer) {
        p.sendError = "missing payer keypair";
        return;
      }
      const rebuilt = buildProbe({
        payer,
        recentBlockhash: bh.blockhash,
        computeUnitPrice: p.computeUnitPrice,
        cuLimit: p.cuLimit,
        tag: p.tag
      });
      p.signatureB64 = rebuilt.signatureB64;
      p.signature = bs58.encode(Buffer.from(rebuilt.signatureB64, "base64"));
      p.raw = Buffer.from(rebuilt.tx.serialize()).toString("base64");
      p.sendIndex = sendIndex;
      try {
        const sig = await sendConn.sendRawTransaction(Buffer.from(p.raw, "base64"), {
          skipPreflight: true,
          maxRetries: 0
        });
        p.sentSignature = sig;
        p.sentAtMs = Date.now();
        p.sentAtSlot = sendAtSlot;
        sent += 1;
      } catch (err) {
        p.sendError = String(err && err.message ? err.message : err);
      }
    })
  );

  // One resend of the same signed bytes while the window is still open.
  // A 4-slot window is under a second. The first forward often arrives late.
  await new Promise(r => setTimeout(r, 180));
  const again = ready.filter(p => p.raw && !p.sendError);
  await Promise.all(again.map(async p => {
    try {
      await sendConn.sendRawTransaction(Buffer.from(p.raw, "base64"), {
        skipPreflight: true,
        maxRetries: 0
      });
    } catch (err) {
      // The first send already recorded the signature. A retry failure is noise.
    }
  }));

  batch.sendResult = { sent: true, sendAtSlot, sendAtMs, count: sent };
  return batch;
}

module.exports = { buildBatches, sendBatchLive, assignPrices, waitForSlot, shuffleInPlace };
