# Measurement log

The machine-generated report for each run is written to `data/report.md`. This
file is the human log: one entry per measurement session, with the date, what was
measured, and what went wrong. The listing asks for both the dates and an honest
"what went wrong" section, so neither is optional.

---

## Session template (copy per run)

### Session: YYYY-MM-DD (UTC)

- **Mode:** dry run / LIVE
- **Epoch / slot range:**
- **Alpenglow side:** after (boundary 2026-10-21)
- **RPC used (send path):**
- **Validators targeted:** (identity — client/fork — windows)
- **Priority ladder:**
- **Probes sent / landed:**
- **Projected / actual fee spend:** (cap 0.05 SOL)

**Findings**

- (per validator: tau, p, verdict, one sentence)

**What went wrong**

- (missed windows, dropped probes, RPC rate limits, land-rate surprises,
  anything that would change how a reader trusts the numbers)

---

## Log

### Session: 2026-11-02 (dry run, pipeline validation)

- **Mode:** dry run (nothing sent, nothing spent)
- **Epoch / slot range:** epoch 1075, around slot 464,484,777
- **Alpenglow side:** after
- **RPC:** `https://api.mainnet-beta.solana.com` (read-only)
- **Classification:** gossip `clientId` from `getClusterNodes`, not the version
  string. Version strings cannot tell Jito from Agave, and they mislabel some
  Firedancer nodes that still advertise `0.1.1`.
- **Validators targeted (6 forks, gossip clientId, 3 windows each, 144 probes):**
  - Agave `7QQGNm3ptwinipDCyaCF7jY5katgmFUu1ieP2f7nwLpE` 4.3.2
  - JitoLabs `HEL1USMZKAL2odpNBj2oCjffnFGaYwmbGmyewGv1e2TU` 4.4.0
  - Firedancer `9eGrDohdNTAo61DRHyfMuqKWXqYnA3i254Wiszxe8FoY` 26.10.5
  - AgaveBam `DRpbCBMxVnDK7maPM5tGv6MvB3v1sRMC86PZ8okm21hy` 4.4.0
  - FireBAM `9jxgosAfHgHzwnxsHw4RAZYaLVokMbnYtmiZBreynGFP` 26.10.5
  - HarmonicAgave `Fd7btgySsrjuo25CJCj7oE7VPMyezDhnx7pZkj2v69Nk` 4.4.0
- **Projected fee spend:** 0.000740 SOL for the equivalent live pass (cap 0.05).

**Findings**

- None yet — a dry run sends nothing, so every verdict is `insufficient-data` by
  design. This session validated selection, window planning, probe construction,
  budget accounting, the future-slot guard in the collector, and report output.

**What went wrong**

- First pipeline pass hung: the collector tried to `getBlock` on future target
  slots (they do not exist yet in a dry run) and retried against the public RPC.
  Fixed by skipping any slot past the finalized tip. Live runs wait for the last
  target window to finalize before collecting.
- First classification used version strings only and called `0.1.1` nodes
  Frankendancer. Gossip `clientId` says those nodes are Firedancer. Relabelled.
  Jito vs Agave is also only visible via `clientId`.
- Analysis first treated each window as a separate validator, so six leaders
  looked like eighteen. Folded by identity before scoring.
- `tpu` is null on post-Alpenglow gossip; the real address is `tpuQuic`. Recorded.
- Live send path (not exercised today) rebuilt: wait for the actual window,
  sign against a fresh blockhash, fund/sweep ephemeral signers. A hash from
  plan-time would be dead by the time a window several minutes away opened.
