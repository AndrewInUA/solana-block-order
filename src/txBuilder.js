/**
 * Builds the probe transactions.
 *
 * Each probe is deliberately minimal: a compute-budget price, a compute-budget
 * limit, and a memo. The memo carries a tag so a human can see which probe is
 * which inside a block explorer, but identification for analysis is by signature,
 * which is exact. We vary exactly one knob per experiment:
 *   - priority: computeUnitPrice changes, everything else is held equal;
 *   - arrival:  price is held equal, only the send time changes (handled by the sender).
 */

const {
  ComputeBudgetProgram,
  TransactionMessage,
  VersionedTransaction,
  TransactionInstruction,
  PublicKey
} = require("@solana/web3.js");

const MEMO_PROGRAM_ID = new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");

function memoIx(tag) {
  return new TransactionInstruction({
    keys: [],
    programId: MEMO_PROGRAM_ID,
    data: Buffer.from(tag, "utf8")
  });
}

/**
 * Build one signed probe. Returns { tx, signature, meta }. The transaction is a
 * self-contained no-op: it touches no shared account, so two probes from two
 * different fee payers do not conflict and the scheduler is free to order them
 * however its rule dictates.
 */
function buildProbe(params) {
  const { payer, recentBlockhash, computeUnitPrice, cuLimit, tag } = params;

  const instructions = [
    ComputeBudgetProgram.setComputeUnitLimit({ units: cuLimit }),
    ComputeBudgetProgram.setComputeUnitPrice({ microLamports: computeUnitPrice }),
    memoIx(tag)
  ];

  const message = new TransactionMessage({
    payerKey: payer.publicKey,
    recentBlockhash,
    instructions
  }).compileToV0Message();

  const tx = new VersionedTransaction(message);
  tx.sign([payer]);
  const signature = Buffer.from(tx.signatures[0]).toString("base64");

  return {
    tx,
    signatureB64: signature,
    meta: {
      payer: payer.publicKey.toBase58(),
      computeUnitPrice,
      cuLimit,
      tag
    }
  };
}

module.exports = { buildProbe, MEMO_PROGRAM_ID };
