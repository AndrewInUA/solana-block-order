/**
 * Config comes from the environment, with safe defaults. The one rule that
 * matters most: LIVE must be the exact string "true" to send anything. Any
 * other value, including unset, means dry run.
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const CONFIG_DIR = path.join(ROOT, "config");
const DATA_DIR = process.env.DATA_DIR || path.join(ROOT, "data");

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (err) {
    if (fallback !== undefined) return fallback;
    throw err;
  }
}

function numberList(value, fallback) {
  if (!value) return fallback;
  return String(value)
    .split(",")
    .map(part => Number(part.trim()))
    .filter(n => Number.isFinite(n));
}

function num(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function redactRpc(url) {
  try {
    const parsed = new URL(url);
    return parsed.host || "rpc";
  } catch (err) {
    return "rpc";
  }
}

function load() {
  const network = readJson(path.join(CONFIG_DIR, "network.json"), {});
  const overrides = readJson(path.join(CONFIG_DIR, "overrides.json"), { identities: {} });

  const live = process.env.LIVE === "true";
  const feeCapSol = num(process.env.FEE_CAP_SOL, 0.05);

  return {
    root: ROOT,
    dataDir: DATA_DIR,
    rpcUrl: process.env.RPC_URL || "https://api.mainnet-beta.solana.com",
    sendRpcUrl: process.env.SEND_RPC_URL || process.env.RPC_URL || "https://api.mainnet-beta.solana.com",
    live,
    feeCapSol,
    feeCapLamports: Math.floor(feeCapSol * 1e9),
    fundingKeypairPath: process.env.FUNDING_KEYPAIR_PATH || "",
    fundingKeypairB58: process.env.FUNDING_KEYPAIR_B58 || "",
    validatorsAppToken: process.env.VALIDATORS_APP_TOKEN || "",
    network,
    overrides: overrides.identities || {},
    experiment: {
      priorityLadder: numberList(process.env.PRIORITY_LADDER, [0, 1000, 5000, 20000, 50000, 100000, 250000, 500000]),
      signersPerWindow: num(process.env.SIGNERS_PER_WINDOW, 8),
      windowsPerValidator: num(process.env.WINDOWS_PER_VALIDATOR, 3),
      cuLimit: num(process.env.CU_LIMIT, 10000)
    }
  };
}

module.exports = { load, readJson, redactRpc, DATA_DIR };
