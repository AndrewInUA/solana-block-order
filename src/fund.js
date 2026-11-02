/**
 * Live-only: move SOL from the funding key onto the ephemeral signers before
 * probes go out, and sweep whatever is left back afterwards.
 *
 * The spend cap counts *fees*, not the float. The lamports sitting on a signer
 * during the run come back on sweep. If we counted the float against the cap,
 * a 0.05 SOL cap would be eaten by rent-exempt deposits before a single probe
 * went out, which is not what the listing asked for.
 */

const { SystemProgram, Transaction, sendAndConfirmTransaction } = require("@solana/web3.js");
const { Budget, BASE_FEE_LAMPORTS } = require("./budget");

const RENT_EXEMPT_MIN = 890880;

function amountPerSigner(cfg, windowCount) {
  const ladder = cfg.experiment.priorityLadder;
  const maxPrice = Math.max(0, ...ladder);
  const fee = Budget.feeFor(maxPrice, cfg.experiment.cuLimit);
  return RENT_EXEMPT_MIN + windowCount * fee + 50_000;
}

async function fundSigners(conn, funding, signers, lamportsEach, budget, log) {
  const results = [];
  for (const signer of signers) {
    if (!budget.tryReserve(BASE_FEE_LAMPORTS, { kind: "fund", to: signer.publicKey.toBase58() })) {
      throw new Error("fee cap reached before funding signers");
    }
    const tx = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: funding.publicKey,
        toPubkey: signer.publicKey,
        lamports: lamportsEach
      })
    );
    const sig = await sendAndConfirmTransaction(conn, tx, [funding], { commitment: "confirmed" });
    budget.settle(BASE_FEE_LAMPORTS);
    results.push({ to: signer.publicKey.toBase58(), lamports: lamportsEach, signature: sig });
    log.info("funded signer", { to: signer.publicKey.toBase58(), lamports: lamportsEach, signature: sig });
  }
  return results;
}

async function sweepSigners(conn, funding, signers, budget, log) {
  const results = [];
  for (const signer of signers) {
    const balance = await conn.getBalance(signer.publicKey, "confirmed");
    const sendable = balance - BASE_FEE_LAMPORTS;
    if (sendable <= 0) {
      results.push({ from: signer.publicKey.toBase58(), swept: 0, reason: "empty" });
      continue;
    }
    if (!budget.tryReserve(BASE_FEE_LAMPORTS, { kind: "sweep", from: signer.publicKey.toBase58() })) {
      log.warn("fee cap reached; leaving dust on signer", { from: signer.publicKey.toBase58(), balance });
      results.push({ from: signer.publicKey.toBase58(), swept: 0, reason: "cap" });
      continue;
    }
    const tx = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: signer.publicKey,
        toPubkey: funding.publicKey,
        lamports: sendable
      })
    );
    const sig = await sendAndConfirmTransaction(conn, tx, [signer], { commitment: "confirmed" });
    budget.settle(BASE_FEE_LAMPORTS);
    results.push({ from: signer.publicKey.toBase58(), swept: sendable, signature: sig });
    log.info("swept signer", { from: signer.publicKey.toBase58(), swept: sendable, signature: sig });
  }
  return results;
}

module.exports = { fundSigners, sweepSigners, amountPerSigner, RENT_EXEMPT_MIN };
