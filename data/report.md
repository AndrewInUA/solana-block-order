# Inside the Block — Measurement Report

Generated: 2026-11-02T12:54:00.002Z
Mode: LIVE
Cluster: mainnet-beta
Epoch at run: 1075 (slot 464498207)
Alpenglow side: after (boundary 2026-10-21, slot unset)
RPC: mainnet.helius-rpc.com

## Budget

- Cap: 0.05 SOL
- Spent: about 0.000507 SOL. The funding address started at 0.02 SOL and holds 0.019493 SOL after the sweep.
- Sent and included: 83 of 88 broadcasts. 56 planned probes never left, because the leader window had already passed.
- Every included probe failed execution with the same error. The memo asked for more compute than the 1,200 unit limit left it. Inclusion order is still the leader's order. The failure did not sort them, because they all failed the same way.

## Validators selected

| Identity | Client | Family | Source | Version | Upcoming windows |
|---|---|---|---|---|---|
| `7QQGNm3ptwinipDCyaCF7jY5katgmFUu1ieP2f7nwLpE` | Agave | Agave | gossip-clientId | 4.3.2 | 389 |
| `HEL1USMZKAL2odpNBj2oCjffnFGaYwmbGmyewGv1e2TU` | JitoLabs | JitoLabs | gossip-clientId | 4.4.0 | 3235 |
| `9eGrDohdNTAo61DRHyfMuqKWXqYnA3i254Wiszxe8FoY` | Firedancer | Firedancer | gossip-clientId | 26.10.5 | 1354 |
| `DRpbCBMxVnDK7maPM5tGv6MvB3v1sRMC86PZ8okm21hy` | AgaveBam | AgaveBam | gossip-clientId | 4.4.0 | 2569 |
| `9jxgosAfHgHzwnxsHw4RAZYaLVokMbnYtmiZBreynGFP` | FireBAM | FireBAM | gossip-clientId | 26.10.5 | 842 |
| `Fd7btgySsrjuo25CJCj7oE7VPMyezDhnx7pZkj2v69Nk` | HarmonicAgave | HarmonicAgave | gossip-clientId | 4.4.0 | 3301 |

## Validators measured

| Identity | Client | Sent | Landed | Land rate | Kendall τ (price) | p | Verdict | τ (send order) |
|---|---|---|---|---|---|---|---|---|
| `9jxgosAfHgHzwnxsHw4RAZYaLVokMbnYtmiZBreynGFP` | FireBAM | 24 | 22 | 91.7% | -0.127 | 0.456 | no-rule/noise | 0.399 |
| `HEL1USMZKAL2odpNBj2oCjffnFGaYwmbGmyewGv1e2TU` | JitoLabs | 16 | 16 | 100.0% | -0.196 | 0.338 | no-rule/noise | 0.448 |
| `9eGrDohdNTAo61DRHyfMuqKWXqYnA3i254Wiszxe8FoY` | Firedancer | 8 | 8 | 100.0% | -0.071 | 0.907 | no-rule/noise | 0.643 |
| `7QQGNm3ptwinipDCyaCF7jY5katgmFUu1ieP2f7nwLpE` | Agave | 24 | 24 | 100.0% | 0.126 | 0.424 | no-rule/noise | 0.216 |
| `DRpbCBMxVnDK7maPM5tGv6MvB3v1sRMC86PZ8okm21hy` | AgaveBam | 8 | 8 | 100.0% | 0.000 | 1.000 | no-rule/noise | -0.143 |
| `Fd7btgySsrjuo25CJCj7oE7VPMyezDhnx7pZkj2v69Nk` | HarmonicAgave | 8 | 5 | 62.5% | 0.400 | 0.477 | insufficient-data | -0.200 |

## Per-family summary

- **FireBAM** — 1 validators, 22 probes landed. Verdicts: no-rule/noise: 1
- **JitoLabs** — 1 validators, 16 probes landed. Verdicts: no-rule/noise: 1
- **Firedancer** — 1 validators, 8 probes landed. Verdicts: no-rule/noise: 1
- **Agave** — 1 validators, 24 probes landed. Verdicts: no-rule/noise: 1
- **AgaveBam** — 1 validators, 8 probes landed. Verdicts: no-rule/noise: 1
- **HarmonicAgave** — 1 validators, 5 probes landed. Verdicts: insufficient-data: 1

## Reading

- FireBAM `9jxgosAfHgHzwnxsHw4RAZYaLVokMbnYtmiZBreynGFP` shows no clear priority rule in this sample (τ=-0.127, n=22, windows=3).
- JitoLabs `HEL1USMZKAL2odpNBj2oCjffnFGaYwmbGmyewGv1e2TU` shows no clear priority rule in this sample (τ=-0.196, n=16, windows=3).
- Firedancer `9eGrDohdNTAo61DRHyfMuqKWXqYnA3i254Wiszxe8FoY` shows no clear priority rule in this sample (τ=-0.071, n=8, windows=3).
- Agave `7QQGNm3ptwinipDCyaCF7jY5katgmFUu1ieP2f7nwLpE` shows no clear priority rule in this sample (τ=0.126, n=24, windows=3).
- AgaveBam `DRpbCBMxVnDK7maPM5tGv6MvB3v1sRMC86PZ8okm21hy` shows no clear priority rule in this sample (τ=0.000, n=8, windows=3).
- HarmonicAgave `Fd7btgySsrjuo25CJCj7oE7VPMyezDhnx7pZkj2v69Nk` did not land enough probes to judge (τ=0.400, n=5, windows=3).

## What went wrong

Measured 2026-11-02, epoch 1075, from slot 464498207. All of it is after the 21 October Alpenglow boundary.

- The first pass of `getBlock` used transaction version 0. These blocks are version 1, so the reader threw and the first report said nothing landed. The positions below come from a second read of the same signatures.
- 7 of 18 windows were already over by the time we looked. A leader window is four slots, under a second, and a slow slot check stepped over it. Firedancer, AgaveBam and HarmonicAgave each kept only one window.
- The memo instruction burned the compute budget. Logs say `consumed 900 of 900` and `exceeded CUs`. The probes are in the blocks, and they failed. That is a defect in the probe, not a finding about the scheduler.
- Priority fee does not explain order in this sample. Kendall τ on price is between -0.20 and +0.13, and none of the p-values are under 0.05.
- Send order does, for three of them. FireBAM τ=0.399 (p=0.013), JitoLabs τ=0.448 (p=0.020), Firedancer τ=0.643 (p=0.030): a probe sent earlier landed earlier. Agave's send-order p is 0.17. AgaveBam is flat. HarmonicAgave has 5 landed probes, which is not enough.
- Because every probe failed the same way, this run cannot say what a successful transaction would do. It can say that, among these included failures, the priority price was not the rule.

## How to verify

Every landed probe in `data/collected.json` has a signature and a slot.
Call `getBlock(slot)` and find the signature; its index is the position we report.
Signers are derived deterministically (see `src/wallets.js`), so the fee-payer set re-derives from the same seed.
