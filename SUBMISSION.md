# Inside the Block: how Solana leaders order transactions

Submission for the Superteam Ukraine bounty. The code, the raw signatures, and this write-up are in one public repository:

https://github.com/AndrewInUA/solana-block-order

The measurement was taken on **2 November 2026**, mainnet epoch **1075**, starting at slot **464498207**. That is after the Alpenglow upgrade of 21 October 2026. Nothing in this run is from before that date.

## The result

I sent my own transactions into the leader windows of six mainnet validators, then read the blocks to see what decided which of my transactions landed earlier.

**Priority fee did not decide the order.** A higher compute-unit price did not reliably land earlier. For every client the rank correlation with price is weak, and none of those tests clear a 5% significance line.

**Send order did, for three of the six.** On FireBAM, JitoLabs, and Firedancer, a probe I sent earlier tended to land earlier. Agave does not show that cleanly. AgaveBam is flat. HarmonicAgave did not land enough probes to judge.

This is a real measurement, and it is a limited one. All 83 included probes failed execution for the same reason, explained below. The order in the block is still the leader's order. It is the order of failed probes, not of successful ones.

## Who was measured

Six validators, six different clients, taken from the gossip `clientId` at the time of the run. Version strings alone cannot tell Jito from Agave, so the client name is the gossip field, not a guess from the version.

| Validator | Client | Version | Sent | Included | Price τ | Price p | Send-order τ | Send-order p | Reading |
|---|---|---|---|---|---|---|---|---|---|
| `7QQGNm3ptwinipDCyaCF7jY5katgmFUu1ieP2f7nwLpE` | Agave | 4.3.2 | 24 | 24 | 0.126 | 0.424 | 0.216 | 0.171 | no priority rule |
| `HEL1USMZKAL2odpNBj2oCjffnFGaYwmbGmyewGv1e2TU` | JitoLabs | 4.4.0 | 16 | 16 | -0.196 | 0.338 | 0.448 | 0.020 | send order, not price |
| `9eGrDohdNTAo61DRHyfMuqKWXqYnA3i254Wiszxe8FoY` | Firedancer | 26.10.5 | 8 | 8 | -0.071 | 0.907 | 0.643 | 0.030 | send order, not price |
| `DRpbCBMxVnDK7maPM5tGv6MvB3v1sRMC86PZ8okm21hy` | AgaveBam | 4.4.0 | 8 | 8 | 0.000 | 1.000 | -0.143 | 0.710 | no rule in this sample |
| `9jxgosAfHgHzwnxsHw4RAZYaLVokMbnYtmiZBreynGFP` | FireBAM | 26.10.5 | 24 | 22 | -0.127 | 0.456 | 0.399 | 0.013 | send order, not price |
| `Fd7btgySsrjuo25CJCj7oE7VPMyezDhnx7pZkj2v69Nk` | HarmonicAgave | 4.4.0 | 8 | 5 | 0.400 | 0.477 | -0.200 | 0.827 | not enough probes |

τ is Kendall's tau between that knob and the probe's position. A negative price τ would mean a higher fee landed earlier. That is the sign a priority rule would have. It is not what showed up.

Jito bundles and tips were not used. The probes are ordinary transactions. The thing being measured is the leader's own scheduler.

## How the probes were built

Each probe is a small transaction: a compute-unit limit, a compute-unit price, and a memo. Each probe in a batch has its own fee payer, so the probes do not write-lock each other. The only intended difference inside one batch is the compute-unit price, which steps along a ladder from 0 to 500,000 micro-lamports per compute unit.

They were sent through an RPC (Helius), which forwards to the leader. That path is not a direct hop to the leader's TPU. Send time and send slot are recorded so the gap is visible. The advertised `tpuQuic` address of each leader is in `data/plan.json`.

The spend cap is 0.05 SOL and the code enforces it. This run started with 0.02 SOL on a dedicated funding address and finished with **0.019493 SOL** still there. About **0.000507 SOL** was spent. The address is `AczknV1SzaQvvyYkL4RmkduU7Whz7P6XDkQTJkxvYaqi`. The key is not in the repository.

Dry run is the default. Live sending happens only with `LIVE=true` and a funding key mounted from outside the repo.

## What went wrong

These are part of the result, not a footnote.

1. **Every included probe failed execution.** The compute limit was 1,200 units. The compute-budget instructions used about 300 of them. The memo then logged `consumed 900 of 900` and `exceeded CUs`. The transaction stayed in the block, in a position, and failed. All 83 failed the same way, so the failure did not sort them relative to each other. It does mean this run cannot say whether a successful transaction would be ordered the same way.

2. **Seven of the eighteen leader windows were missed.** A leader window is four slots, under a second, and the slot check stepped over some of them. Firedancer, AgaveBam, and HarmonicAgave each kept a thin sample. HarmonicAgave landed 5 probes. That is not enough, and the report says so.

3. **The first block read used the wrong transaction version.** These blocks are version 1. A `getBlock` call limited to version 0 throws. The numbers in this document come from reading the same signatures again with version 1. One check: signature `2Ejw4ch6P9AWVrCsNbc6k85bK228dBLsp2LqjjjW3xCkzbxHUqe6g8eRipamNEbzG8eRT7zdsKufzgVrx358QkLi` is in slot `464498529`, and the chain returns the same compute-limit error.

88 probes were broadcast. 83 were included. 56 planned probes never left, because their window had already passed.

## What this does not separate

- The hops between my process and the leader. I measured landing through an RPC, not each hop on the way.
- Jito bundles and tips. They are a different mechanism, and this bounty sets them aside.
- Successful transactions versus these failed memos. The limit in the code is now 10,000 units so a later run would not repeat the memo failure. This submission is the run that already happened, with the failure included.

## How to check a claim

Every included probe is in `data/collected.json` with its signature and its slot. Call `getBlock` on that slot with `maxSupportedTransactionVersion` set to 1, find the signature, and the index is the position reported here.

| File | What it is |
|---|---|
| [README](https://github.com/AndrewInUA/solana-block-order/blob/main/README.md) | Why the experiment is built this way, and what it refuses to pretend it separated |
| [data/report.md](https://github.com/AndrewInUA/solana-block-order/blob/main/data/report.md) | The generated report: table, date, what went wrong |
| [REPORT.md](https://github.com/AndrewInUA/solana-block-order/blob/main/REPORT.md) | The session log |
| [data/collected.json](https://github.com/AndrewInUA/solana-block-order/blob/main/data/collected.json) | Signature, slot, and block index for every probe |
| [data/batches.json](https://github.com/AndrewInUA/solana-block-order/blob/main/data/batches.json) | What was built and what was sent |
| [data/plan.json](https://github.com/AndrewInUA/solana-block-order/blob/main/data/plan.json) | The six validators, their clients, and the slots aimed at |

A dry run, which sends nothing, is:

```bash
docker compose run --rm block-order
```
