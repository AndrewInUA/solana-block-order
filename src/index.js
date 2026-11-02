#!/usr/bin/env node
/**
 * CLI entry. Subcommands:
 *   plan     - fetch leader schedule, classify clients, pick validators, write plan
 *   nodes    - print client breakdown of current leaders (sanity check)
 *   run      - build probe batches (and send them when LIVE=true)
 *   collect  - read target blocks, record where our probes landed
 *   analyze  - compute per-validator ordering verdicts
 *   report   - write the human report
 *   all      - run the whole pipeline in order (default)
 *
 * Dry run is the default everywhere. Sending requires LIVE=true and a funding key.
 */

const { load, redactRpc } = require("./config");
const log = require("./logger");
const pipeline = require("./pipeline");
const rpc = require("./rpc");
const { classify } = require("./classify");

async function cmdNodes(cfg) {
  const conn = rpc.connect(cfg.rpcUrl);
  const info = await rpc.epochInfo(conn);
  const [schedule, nodes] = await Promise.all([
    rpc.leaderSchedule(conn, info.epochStartSlot),
    rpc.clusterNodes(conn)
  ]);
  const families = {};
  for (const identity of Object.keys(schedule)) {
    const c = classify(identity, nodes[identity] || null, { overrides: cfg.overrides });
    families[c.family] = (families[c.family] || 0) + 1;
  }
  log.info("leader client families this epoch", families);
  process.stdout.write(JSON.stringify({ epoch: info.epoch, families }, null, 2) + "\n");
}

async function main() {
  const cmd = process.argv[2] || "all";
  const cfg = load();
  log.step("start", { cmd, live: cfg.live, feeCapSol: cfg.feeCapSol, rpc: redactRpc(cfg.rpcUrl) });

  switch (cmd) {
    case "plan":
      await pipeline.runPlan(cfg);
      break;
    case "nodes":
      await cmdNodes(cfg);
      break;
    case "run":
      await pipeline.runBuild(cfg);
      break;
    case "collect":
      await pipeline.runCollect(cfg);
      break;
    case "analyze":
      pipeline.runAnalyze(cfg);
      break;
    case "report":
      process.stdout.write(pipeline.runReport(cfg) + "\n");
      break;
    case "all":
      await pipeline.runBuild(cfg);
      await pipeline.runCollect(cfg);
      pipeline.runAnalyze(cfg);
      process.stdout.write(pipeline.runReport(cfg) + "\n");
      break;
    default:
      log.error("unknown command", { cmd });
      process.exitCode = 1;
  }
}

main().catch(err => {
  log.error("fatal", { error: String(err && err.stack ? err.stack : err) });
  process.exitCode = 1;
});
