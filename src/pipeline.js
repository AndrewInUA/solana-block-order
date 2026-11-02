/**
 * The orchestration: candidates -> selection -> plan -> batches -> (send) ->
 * collect -> analyze -> report. Each stage writes its output to data/ so stages
 * can run independently and a judge can inspect every intermediate artifact.
 */

const fs = require("fs");
const path = require("path");
const log = require("./logger");
const rpc = require("./rpc");
const { classify } = require("./classify");
const { selectValidators } = require("./select");
const { futureWindows } = require("./windows");
const { buildSigners } = require("./wallets");
const { buildBatches, sendBatchLive } = require("./sender");
const { Budget } = require("./budget");
const { fundSigners, sweepSigners, amountPerSigner } = require("./fund");
const { collect } = require("./collector");
const { analyze } = require("./analyze");
const { buildReport } = require("./report");

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function writeJson(dir, name, obj) {
  ensureDir(dir);
  const file = path.join(dir, name);
  fs.writeFileSync(file, JSON.stringify(obj, null, 2));
  log.info("wrote " + name, { bytes: fs.statSync(file).size });
  return file;
}

function readJson(dir, name) {
  return JSON.parse(fs.readFileSync(path.join(dir, name), "utf8"));
}

async function fetchValidatorsApp(cfg) {
  if (!cfg.validatorsAppToken) return {};
  try {
    const res = await fetch("https://www.validators.app/api/v1/validators/mainnet.json?limit=4000", {
      headers: { Token: cfg.validatorsAppToken }
    });
    if (!res.ok) throw new Error("http " + res.status);
    const rows = await res.json();
    const byIdentity = {};
    for (const row of rows) {
      if (row.account) byIdentity[row.account] = row;
    }
    return byIdentity;
  } catch (err) {
    log.warn("validators.app lookup failed; falling back", { error: String(err.message || err) });
    return {};
  }
}

async function buildCandidates(cfg, conn) {
  const info = await rpc.epochInfo(conn);
  log.step("epoch", { epoch: info.epoch, slot: info.absoluteSlot, slotIndex: info.slotIndex });

  const [schedule, nodes, validatorsApp] = await Promise.all([
    rpc.leaderSchedule(conn, info.epochStartSlot),
    rpc.clusterNodes(conn),
    fetchValidatorsApp(cfg)
  ]);

  const slotsPerWindow = (cfg.network && cfg.network.slotsPerLeaderWindow) || 4;
  const context = { overrides: cfg.overrides, validatorsApp };
  const candidates = [];
  for (const identity of Object.keys(schedule)) {
    const node = nodes[identity] || null;
    const client = classify(identity, node, context);
    const allSlots = schedule[identity];
    const windows = futureWindows(allSlots, info.absoluteSlot, slotsPerWindow, 8);
    candidates.push({
      identity,
      node: node
        ? {
            tpu: node.tpu || node.tpuQuic || null,
            tpuQuic: node.tpuQuic || null,
            gossip: node.gossip,
            version: node.version,
            clientId: node.clientId || null
          }
        : null,
      client,
      leaderSlots: allSlots,
      futureWindows: windows
    });
  }
  return { info, candidates, slotsPerWindow };
}

function makePlan(selection, cfg) {
  const targets = [];
  for (const v of selection.chosen) {
    const windows = v.futureWindows.slice(0, cfg.experiment.windowsPerValidator);
    for (const w of windows) {
      targets.push({
        identity: v.identity,
        client: v.client,
        windowSlots: w,
        tpu: v.node && v.node.tpu
      });
    }
  }
  // Hit windows in chain order. Leader slots do not overlap across validators,
  // so one process can walk the schedule without being in two places at once.
  targets.sort((a, b) => a.windowSlots[0] - b.windowSlots[0]);
  return {
    targets,
    chosen: selection.chosen.map(c => ({
      identity: c.identity,
      client: c.client,
      tpu: c.node && c.node.tpu,
      upcomingWindows: c.futureWindows.length
    }))
  };
}

async function runPlan(cfg) {
  const conn = rpc.connect(cfg.rpcUrl);
  const { info, candidates, slotsPerWindow } = await buildCandidates(cfg, conn);
  const selection = selectValidators(candidates, { minValidators: 6, minFamilies: 3 });

  const plan = makePlan(selection, cfg);
  const manifest = {
    live: cfg.live,
    cluster: (cfg.network && cfg.network.cluster) || "mainnet-beta",
    epoch: info.epoch,
    absoluteSlot: info.absoluteSlot,
    epochStartSlot: info.epochStartSlot,
    slotsPerWindow,
    alpenglowDateUtc: cfg.network && cfg.network.alpenglowDateUtc,
    alpenglowSlot: cfg.network && cfg.network.alpenglowSlot,
    alpenglowSide: cfg.network && cfg.network.alpenglowSide,
    selectionOk: selection.ok,
    selectionReason: selection.reason,
    families: selection.families,
    rpcUrl: cfg.rpcUrl,
    sendRpcUrl: cfg.sendRpcUrl,
    generatedAt: new Date().toISOString()
  };

  writeJson(cfg.dataDir, "manifest.json", manifest);
  writeJson(cfg.dataDir, "plan.json", plan);

  if (!selection.ok) {
    log.warn("selection did not meet the 6-validators / 3-families floor", { reason: selection.reason });
  } else {
    log.info("selection ok", { validators: selection.chosen.length, families: selection.families });
  }
  return { manifest, plan, selection };
}

async function runBuild(cfg) {
  const conn = rpc.connect(cfg.rpcUrl);
  const { plan } = await runPlan(cfg);
  const { funding, signers, funded } = buildSigners(cfg, cfg.experiment.signersPerWindow);
  const budget = new Budget(cfg.feeCapLamports);

  log.step("building probe batches", { targets: plan.targets.length, funded });
  const built = await buildBatches(cfg, conn, plan, signers, budget);

  if (!cfg.live) {
    writeJson(cfg.dataDir, "batches.json", {
      budget: budget.summary(),
      batches: built.batches,
      funded: false
    });
    log.warn("DRY RUN: probes built and accounted, nothing sent. Set LIVE=true with a funding key to send.");
    log.info("budget after build", budget.summary());
    return { batches: built.batches, budget: budget.summary(), sent: false };
  }

  if (!funded) {
    writeJson(cfg.dataDir, "batches.json", { budget: budget.summary(), batches: built.batches, funded: false });
    log.error("LIVE requested but no funding key present; refusing to send.");
    return { batches: built.batches, budget: budget.summary(), sent: false };
  }

  const lamportsEach = amountPerSigner(cfg, plan.targets.length);
  log.step("funding ephemeral signers", { count: signers.length, lamportsEach });
  const fundedAt = await fundSigners(conn, funding, signers, lamportsEach, budget, log);

  const sendConn = rpc.connect(cfg.sendRpcUrl, "confirmed");
  const signersByPubkey = {};
  for (const s of signers) signersByPubkey[s.publicKey.toBase58()] = s;

  for (const batch of built.batches) {
    await sendBatchLive({ conn, sendConn, batch, signersByPubkey, cfg, log });
  }

  writeJson(cfg.dataDir, "batches.json", {
    budget: budget.summary(),
    batches: built.batches,
    funded: true,
    fundedAt,
    fundingPubkey: funding.publicKey.toBase58()
  });
  log.info("budget after send", budget.summary());
  return { batches: built.batches, budget: budget.summary(), sent: true };
}

async function waitForFinalized(conn, targetSlot, maxWaitMs) {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    const slot = await conn.getSlot("finalized");
    if (slot >= targetSlot) return slot;
    log.info("waiting for finalization", { finalized: slot, need: targetSlot });
    await new Promise(r => setTimeout(r, 4000));
  }
  return null;
}

async function runCollect(cfg) {
  const conn = rpc.connect(cfg.rpcUrl, "finalized");
  const saved = readJson(cfg.dataDir, "batches.json");

  const anySent = saved.batches.some(b => b.sendResult && b.sendResult.sent);
  if (cfg.live && anySent) {
    const maxSlot = Math.max(...saved.batches.flatMap(b => b.windowSlots));
    log.step("waiting for last target window to finalize", { maxSlot });
    await waitForFinalized(conn, maxSlot, 180000);
  }

  const results = await collect(conn, saved.batches, log);
  writeJson(cfg.dataDir, "collected.json", { results });

  if (cfg.live && saved.funded && saved.fundingPubkey) {
    const { funding, signers } = buildSigners(cfg, cfg.experiment.signersPerWindow);
    if (funding) {
      const budget = new Budget(cfg.feeCapLamports);
      budget.spentLamports = (saved.budget && saved.budget.spentLamports) || 0;
      log.step("sweeping leftover SOL back to funding key");
      const swept = await sweepSigners(conn, funding, signers, budget, log);
      saved.budget = budget.summary();
      saved.swept = swept;
      writeJson(cfg.dataDir, "batches.json", saved);
    }
  }

  return results;
}

function runAnalyze(cfg) {
  const saved = readJson(cfg.dataDir, "collected.json");
  const analysis = analyze(saved.results);
  writeJson(cfg.dataDir, "analysis.json", analysis);
  return analysis;
}

function runReport(cfg) {
  const manifest = readJson(cfg.dataDir, "manifest.json");
  const analysis = readJson(cfg.dataDir, "analysis.json");
  const batches = readJson(cfg.dataDir, "batches.json");
  const plan = readJson(cfg.dataDir, "plan.json");
  const text = buildReport({ manifest, analysis, budget: batches.budget, plan });
  ensureDir(cfg.dataDir);
  fs.writeFileSync(path.join(cfg.dataDir, "report.md"), text);
  log.info("wrote report.md");
  return text;
}

module.exports = {
  buildCandidates,
  runPlan,
  runBuild,
  runCollect,
  runAnalyze,
  runReport,
  writeJson,
  readJson
};
