/**
 * The spend cap. Nothing optional about it: the sender asks this module whether
 * a transaction is allowed before it goes out, and the module refuses once the
 * projected spend would cross the cap. Dry runs account the same way so you can
 * see what a live run would have cost before risking a lamport.
 */

const BASE_FEE_LAMPORTS = 5000; // per signature; all our txs are single-signer

class Budget {
  constructor(capLamports) {
    this.capLamports = capLamports;
    this.spentLamports = 0;
    this.reservedLamports = 0;
    this.records = [];
  }

  // Fee for one transaction: base fee plus the priority fee the tx asked for.
  // priority fee = computeUnitPrice (micro-lamports/CU) * cuLimit / 1e6 lamports.
  static feeFor(computeUnitPriceMicroLamports, cuLimit) {
    const priority = Math.ceil((computeUnitPriceMicroLamports * cuLimit) / 1e6);
    return BASE_FEE_LAMPORTS + priority;
  }

  remaining() {
    return this.capLamports - this.spentLamports - this.reservedLamports;
  }

  // Ask before sending. Returns true and reserves the fee, or false if it would
  // cross the cap. The caller must call settle() or release() afterwards.
  tryReserve(feeLamports, meta) {
    if (this.spentLamports + this.reservedLamports + feeLamports > this.capLamports) {
      return false;
    }
    this.reservedLamports += feeLamports;
    this.records.push({ state: "reserved", feeLamports, meta, at: Date.now() });
    return true;
  }

  settle(feeLamports) {
    this.reservedLamports = Math.max(0, this.reservedLamports - feeLamports);
    this.spentLamports += feeLamports;
  }

  release(feeLamports) {
    this.reservedLamports = Math.max(0, this.reservedLamports - feeLamports);
  }

  summary() {
    const projected = this.spentLamports + this.reservedLamports;
    return {
      capLamports: this.capLamports,
      capSol: this.capLamports / 1e9,
      spentLamports: this.spentLamports,
      spentSol: this.spentLamports / 1e9,
      // In a dry run nothing settles, so "projected" is what a live run would cost.
      projectedLamports: projected,
      projectedSol: projected / 1e9,
      remainingLamports: this.remaining(),
      remainingSol: this.remaining() / 1e9,
      transactionsAccounted: this.records.length
    };
  }
}

module.exports = { Budget, BASE_FEE_LAMPORTS };
