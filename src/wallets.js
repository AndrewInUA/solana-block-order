/**
 * Fee payers for the experiment.
 *
 * The priority test needs each competing transaction to have its own fee payer.
 * If they shared one, the fee payer account is writable and every tx would
 * write-lock it, forcing the scheduler to serialise them — we would be measuring
 * a write-lock conflict, not priority. So we derive a set of distinct signers.
 *
 * Signers are derived deterministically from a seed so a run is reproducible:
 * the same seed yields the same addresses, which a judge can re-derive. In a
 * live run the seed comes from the funding key; in a dry run it is a fixed,
 * clearly-unfunded seed.
 */

const crypto = require("crypto");
const fs = require("fs");
const { Keypair } = require("@solana/web3.js");
const bs58 = require("./base58");

const DRY_SEED = "solana-block-order:dry-run:v1";

function loadFundingKeypair(cfg) {
  if (cfg.fundingKeypairPath && fs.existsSync(cfg.fundingKeypairPath)) {
    const raw = JSON.parse(fs.readFileSync(cfg.fundingKeypairPath, "utf8"));
    return Keypair.fromSecretKey(Uint8Array.from(raw));
  }
  if (cfg.fundingKeypairB58) {
    return Keypair.fromSecretKey(bs58.decode(cfg.fundingKeypairB58));
  }
  return null;
}

function seedFor(cfg, funding) {
  if (funding) {
    // Derive from the funding secret so signers are reproducible per funding key.
    return crypto.createHash("sha256").update(Buffer.from(funding.secretKey)).digest();
  }
  return crypto.createHash("sha256").update(DRY_SEED).digest();
}

function deriveSigner(baseSeed, index) {
  const seed = crypto
    .createHash("sha256")
    .update(baseSeed)
    .update(Buffer.from(String(index)))
    .digest()
    .subarray(0, 32);
  return Keypair.fromSeed(Uint8Array.from(seed));
}

/**
 * Returns { funding, signers: Keypair[], funded: bool }. In a dry run funding is
 * null and funded is false; the signers still exist so the pipeline is identical.
 */
function buildSigners(cfg, count) {
  const funding = loadFundingKeypair(cfg);
  const baseSeed = seedFor(cfg, funding);
  const signers = [];
  for (let i = 0; i < count; i++) {
    signers.push(deriveSigner(baseSeed, i));
  }
  return { funding, signers, funded: Boolean(funding) };
}

module.exports = { buildSigners, loadFundingKeypair, DRY_SEED };
