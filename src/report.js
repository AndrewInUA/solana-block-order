/**
 * Writes the human report from the analysis. The report is deliberately plain:
 * what we did, when, what landed, what the numbers say, and what went wrong.
 * It names every date and leaves room for the "what went wrong" notes the
 * listing asks for. A null result is reported as a result, not hidden.
 */

function fmtPct(x) {
  return (x * 100).toFixed(1) + "%";
}

function fmtTau(x) {
  return x == null ? "n/a" : x.toFixed(3);
}

function fmtP(x) {
  return x == null ? "n/a" : x.toFixed(3);
}

function verdictPhrase(v) {
  switch (v) {
    case "priority-ordered": return "orders by priority (higher fee lands earlier)";
    case "weak/partial": return "shows a partial priority signal";
    case "no-rule/noise": return "shows no clear priority rule in this sample";
    case "insufficient-data": return "did not land enough probes to judge";
    default: return v;
  }
}

function buildReport(context) {
  const { manifest, analysis, budget, plan } = context;
  const lines = [];
  const now = new Date().toISOString();

  lines.push("# Inside the Block — Measurement Report");
  lines.push("");
  lines.push(`Generated: ${now}`);
  lines.push(`Mode: ${manifest.live ? "LIVE" : "DRY RUN (nothing sent, nothing spent)"}`);
  lines.push(`Cluster: ${manifest.cluster}`);
  lines.push(`Epoch at run: ${manifest.epoch} (slot ${manifest.absoluteSlot})`);
  lines.push(`Alpenglow side: ${manifest.alpenglowSide} (boundary ${manifest.alpenglowDateUtc}, slot ${manifest.alpenglowSlot ?? "unset"})`);
  lines.push(`RPC: ${manifest.rpcUrl || "(not recorded)"}`);
  lines.push("");

  lines.push("## Budget");
  lines.push("");
  lines.push(`- Cap: ${budget.capSol} SOL`);
  lines.push(`- Settled spend: ${budget.spentSol} SOL (${budget.spentLamports} lamports)`);
  lines.push(`- Projected spend (dry run = full live fee cost): ${budget.projectedSol ?? budget.spentSol} SOL`);
  lines.push(`- Remaining under cap: ${budget.remainingSol} SOL`);
  lines.push(`- Transactions accounted: ${budget.transactionsAccounted}`);
  lines.push("");

  if (plan && plan.chosen) {
    lines.push("## Validators selected");
    lines.push("");
    lines.push("| Identity | Client | Family | Source | Version | Upcoming windows |");
    lines.push("|---|---|---|---|---|---|");
    for (const v of plan.chosen) {
      lines.push(
        `| \`${v.identity}\` | ${v.client.client} | ${v.client.family} | ${v.client.source} | ${v.client.version || "?"} | ${v.upcomingWindows} |`
      );
    }
    lines.push("");
  }

  lines.push("## Validators measured");
  lines.push("");
  lines.push("| Identity | Client | Sent | Landed | Land rate | Kendall τ (price) | p | Verdict | τ (send order) |");
  lines.push("|---|---|---|---|---|---|---|---|---|");
  for (const v of analysis.perValidator) {
    lines.push(
      `| \`${v.validator}\` | ${v.client.client} | ${v.sent} | ${v.landed} | ${fmtPct(v.landRate)} | ${fmtTau(v.kendallTau)} | ${fmtP(v.pValue)} | ${v.verdict} | ${fmtTau(v.sendOrderTau)} |`
    );
  }
  lines.push("");

  lines.push("## Per-family summary");
  lines.push("");
  for (const f of analysis.perFamily) {
    const verdicts = Object.entries(f.verdicts).map(([k, n]) => `${k}: ${n}`).join(", ");
    lines.push(`- **${f.family}** — ${f.validators} validators, ${f.totalLanded} probes landed. Verdicts: ${verdicts || "none"}`);
  }
  lines.push("");

  lines.push("## Reading");
  lines.push("");
  for (const v of analysis.perValidator) {
    lines.push(`- ${v.client.client} \`${v.validator}\` ${verdictPhrase(v.verdict)} (τ=${fmtTau(v.kendallTau)}, n=${v.samplesUsed}, windows=${v.windowCount}).`);
  }
  lines.push("");

  lines.push("## What went wrong");
  lines.push("");
  if (manifest.live) {
    lines.push("- (fill in per run: missed windows, dropped probes, RPC rate limits, land-rate surprises)");
  } else {
    lines.push("- This was a dry run: no probes were sent, so land rates are empty by design.");
    lines.push("- A dry run cannot distinguish a real ordering rule from noise; only a live run can.");
  }
  if (!manifest.selectionOk) {
    lines.push(`- Selection did not meet the floor: ${manifest.selectionReason}`);
  }
  lines.push("");

  lines.push("## How to verify");
  lines.push("");
  lines.push("Every landed probe in `data/collected.json` has a signature and a slot.");
  lines.push("Call `getBlock(slot)` and find the signature; its index is the position we report.");
  lines.push("Signers are derived deterministically (see `src/wallets.js`), so the fee-payer set re-derives from the same seed.");
  lines.push("");

  return lines.join("\n");
}

module.exports = { buildReport };
