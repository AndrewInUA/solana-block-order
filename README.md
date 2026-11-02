# Inside the Block: how Solana leaders order transactions

A measurement project. It sends transactions we build ourselves into the leader
windows of specific mainnet validators, then reads the resulting blocks to show,
per validator, **what rule decided which transaction landed earlier and which
later** — and whether there is a rule at all.

The honest answer for some clients may be "no rule we can distinguish from
noise." This tool is built so that answer, when it is the right one, is
defensible rather than a shrug.

---

## TL;DR — run it

Dry run (sends nothing, spends nothing, needs no key):

```bash
docker compose run --rm block-order        # full pipeline, dry run
# or without Docker:
npm install && node src/index.js all
```

Live run (sends real transactions on mainnet, behind an explicit flag and a cap):

```bash
cp .env.example .env
# set LIVE=true, set RPC_URL to your own endpoint, mount a funding key at ./keys/funding.json
docker compose run --rm block-order run       # send into upcoming windows
docker compose run --rm block-order collect   # after windows finalize, read blocks
docker compose run --rm block-order analyze
docker compose run --rm block-order report
```

Everything a run produces lands in `data/`: `manifest.json`, `plan.json`,
`batches.json` (every signature), `collected.json` (every slot + block index),
`analysis.json`, and `report.md`.

---

## The design, and why

### The probe

Each probe transaction is a no-op: a compute-budget limit, a compute-budget
price, and a memo tag. It touches **no shared account**. That is deliberate — two
probes from two different fee payers do not conflict, so the leader's scheduler
is free to order them purely by whatever rule it uses. If probes shared a writable
account, the scheduler would be forced to serialise them and we would be measuring
lock contention, not ordering.

### One knob at a time

- **Priority experiment (primary):** within one leader window we send a batch of
  probes that are identical except for the compute-unit price, which steps along
  a ladder (`PRIORITY_LADDER`). Each probe has **its own fee payer**, so the fee
  payer accounts do not collide either. If the leader orders by priority, higher
  price lands earlier. We measure that with Kendall's tau between price and the
  probe's position in the block.
- **Arrival experiment (secondary, same machinery):** hold price equal, vary only
  send time. Separates "orders by fee" from "orders by arrival / FIFO."

### Distinct fee payers, derived deterministically

Signers are derived from a seed (`src/wallets.js`). Same seed → same addresses,
so a judge can re-derive the exact fee-payer set. In a live run the seed comes
from the funding key; in a dry run it is a fixed, clearly-unfunded seed.

### Evidence is the block, not our logs

Analysis uses each probe's **position inside the finalized block**, obtained from
`getBlock`. Our own send logs are recorded too, but the claim rests on data a
judge can reproduce: given a signature and a slot, `getBlock` returns the same
index every time. Three windows of the same leader are folded into **one**
verdict for that validator. A 3-window run is more samples, not three extra
validators.

### Live run internals (still off until you flip `LIVE=true`)

- Ephemeral signers start empty. The funding key tops them up, then sweeps
  whatever is left after collection. The 0.05 SOL cap counts **fees**, not the
  float sitting on a signer during the run.
- Probes are rebuilt against a **fresh blockhash** at send time. A hash from
  plan-time is already dead by the time a window several minutes away opens.
- The process waits for each window (up to 30 minutes), in chain order. Leader
  slots do not overlap, so one process can walk the schedule.
- Send order is shuffled so it is not the same as the price ladder. Analysis
  also scores send-order vs rank as a confound check.

---

## How this handles each point the listing asks about

| Point | How this design handles it |
|---|---|
| **Leader schedule & leader types** | We read `getLeaderSchedule` and convert to absolute slots, group them into 4-slot windows, and aim only at future windows. Leader *type* is the gossip `clientId` (JitoLabs, Agave, Firedancer, HarmonicFiredancer, ...), recorded on every row. |
| **Path from backend to executing node** | We send via an RPC that forwards to the current leader's TPU/QUIC. We record the advertised `tpuQuic` address. We do **not** pretend this is a zero-hop path. The report records send time and send slot so the gap between "we sent" and "it landed" is visible. |
| **Interaction of our own transactions** | Probes touch no shared account and each has its own fee payer, so they do not write-lock each other. The only intended interaction is competition for block space within one window. |
| **Competition inside the block** | Our probes compete with each other (known priorities) and with everyone else's traffic (unknown). We report land rate and only rank probes *relative to each other within the same block*, so third-party load does not distort the within-block ranking. |
| **Send order** | Recorded per probe (`sentAtMs`, `sentAtSlot`). The arrival experiment varies it on purpose; the priority experiment randomises/controls it so send order does not confound price. |
| **Noise vs rule** | Kendall's tau + a deterministic permutation p-value (`src/stats.js`). Verdicts are `priority-ordered`, `weak/partial`, `no-rule/noise`, or `insufficient-data`. A null is reported as a result. |
| **Alpenglow upgrade** | `config/network.json` pins the boundary (2026-10-21) and which side we measure. `alpenglowSlot` can be set to hard-enforce that a run does not straddle the boundary. All measurements here are taken **after** Alpenglow. |

---

## What this does NOT separate (stated plainly)

- **The network path in fine detail.** We send via RPC, which forwards to the
  leader's TPU/QUIC. We record the advertised `tpuQuic` address so the path is
  named, but we do not instrument the hops in between.
- **Jito bundles / tips.** Out of scope by the listing. Our probes carry no tip
  and send no bundles; we measure only the leader's own scheduler.
- **A version-string-only world.** `getClusterNodes` now returns `clientId`
  (JitoLabs, Agave, AgaveBam, Firedancer, HarmonicFiredancer, ...). That is what
  we classify on. The version string is a last resort: it cannot tell Jito from
  Agave, and some Firedancer nodes still advertise `0.1.1`. We do not pretend
  `0.1.1` is Frankendancer.

---

## Safety and reproducibility

- **Dry run is the default.** Live sending requires `LIVE=true` *and* a funding
  key; absent either, the tool builds and accounts probes but sends nothing.
- **Hard spend cap.** `src/budget.js` refuses any probe that would push projected
  fees past `FEE_CAP_SOL` (default 0.05). The dry run reports the projected cost
  of the equivalent live run (typically well under 0.001 SOL for a full pass).
- **Keys never in the repo.** They arrive via a read-only volume (`./keys`) or an
  env var, both gitignored. See `.env.example`.
- **One command.** `docker compose run --rm block-order` runs the whole pipeline.

---

## Layout

```
src/
  index.js      CLI (plan | nodes | run | collect | analyze | report | all)
  pipeline.js   orchestration + data/ artifacts
  rpc.js        epoch, leader schedule, cluster nodes, getBlock
  classify.js   client/fork identification (override > validators.app > gossip clientId > version)
  select.js     pick >=6 validators across >=3 forks, fail closed otherwise
  windows.js    group leader slots into windows, keep future ones
  wallets.js    deterministic fee payers, funding key loading
  txBuilder.js  build + sign one probe (compute budget + memo)
  sender.js     build batches (dry) / send batches (live) + window timing
  budget.js     the spend cap
  collector.js  read target blocks, record landed position
  stats.js      Kendall's tau + permutation p-value
  analyze.js    per-validator verdict, per-family rollup
  report.js     the human report
  core.test.js  unit tests for the pure logic
```

See `REPORT.md` for the measurement log template (dates + "what went wrong").
