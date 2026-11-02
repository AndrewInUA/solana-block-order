# Inside the Block — Measurement Report

Generated: 2026-11-02T11:51:34.186Z
Mode: DRY RUN (nothing sent, nothing spent)
Cluster: mainnet-beta
Epoch at run: 1075 (slot 464485045)
Alpenglow side: after (boundary 2026-10-21, slot unset)
RPC: https://api.mainnet-beta.solana.com

## Budget

- Cap: 0.05 SOL
- Settled spend: 0 SOL (0 lamports)
- Projected spend (dry run = full live fee cost): 0.000740016 SOL
- Remaining under cap: 0.049259984 SOL
- Transactions accounted: 144

## Validators selected

| Identity | Client | Family | Source | Version | Upcoming windows |
|---|---|---|---|---|---|
| `7QQGNm3ptwinipDCyaCF7jY5katgmFUu1ieP2f7nwLpE` | Agave | Agave | gossip-clientId | 4.3.2 | 401 |
| `HEL1USMZKAL2odpNBj2oCjffnFGaYwmbGmyewGv1e2TU` | JitoLabs | JitoLabs | gossip-clientId | 4.4.0 | 3378 |
| `9eGrDohdNTAo61DRHyfMuqKWXqYnA3i254Wiszxe8FoY` | Firedancer | Firedancer | gossip-clientId | 26.10.5 | 1403 |
| `DRpbCBMxVnDK7maPM5tGv6MvB3v1sRMC86PZ8okm21hy` | AgaveBam | AgaveBam | gossip-clientId | 4.4.0 | 2677 |
| `9jxgosAfHgHzwnxsHw4RAZYaLVokMbnYtmiZBreynGFP` | FireBAM | FireBAM | gossip-clientId | 26.10.5 | 884 |
| `Fd7btgySsrjuo25CJCj7oE7VPMyezDhnx7pZkj2v69Nk` | HarmonicAgave | HarmonicAgave | gossip-clientId | 4.4.0 | 3420 |

## Validators measured

| Identity | Client | Sent | Landed | Land rate | Kendall τ (price) | p | Verdict | τ (send order) |
|---|---|---|---|---|---|---|---|---|
| `Fd7btgySsrjuo25CJCj7oE7VPMyezDhnx7pZkj2v69Nk` | HarmonicAgave | 24 | 0 | 0.0% | n/a | n/a | insufficient-data | n/a |
| `DRpbCBMxVnDK7maPM5tGv6MvB3v1sRMC86PZ8okm21hy` | AgaveBam | 24 | 0 | 0.0% | n/a | n/a | insufficient-data | n/a |
| `HEL1USMZKAL2odpNBj2oCjffnFGaYwmbGmyewGv1e2TU` | JitoLabs | 24 | 0 | 0.0% | n/a | n/a | insufficient-data | n/a |
| `9eGrDohdNTAo61DRHyfMuqKWXqYnA3i254Wiszxe8FoY` | Firedancer | 24 | 0 | 0.0% | n/a | n/a | insufficient-data | n/a |
| `9jxgosAfHgHzwnxsHw4RAZYaLVokMbnYtmiZBreynGFP` | FireBAM | 24 | 0 | 0.0% | n/a | n/a | insufficient-data | n/a |
| `7QQGNm3ptwinipDCyaCF7jY5katgmFUu1ieP2f7nwLpE` | Agave | 24 | 0 | 0.0% | n/a | n/a | insufficient-data | n/a |

## Per-family summary

- **HarmonicAgave** — 1 validators, 0 probes landed. Verdicts: insufficient-data: 1
- **AgaveBam** — 1 validators, 0 probes landed. Verdicts: insufficient-data: 1
- **JitoLabs** — 1 validators, 0 probes landed. Verdicts: insufficient-data: 1
- **Firedancer** — 1 validators, 0 probes landed. Verdicts: insufficient-data: 1
- **FireBAM** — 1 validators, 0 probes landed. Verdicts: insufficient-data: 1
- **Agave** — 1 validators, 0 probes landed. Verdicts: insufficient-data: 1

## Reading

- HarmonicAgave `Fd7btgySsrjuo25CJCj7oE7VPMyezDhnx7pZkj2v69Nk` did not land enough probes to judge (τ=n/a, n=0, windows=3).
- AgaveBam `DRpbCBMxVnDK7maPM5tGv6MvB3v1sRMC86PZ8okm21hy` did not land enough probes to judge (τ=n/a, n=0, windows=3).
- JitoLabs `HEL1USMZKAL2odpNBj2oCjffnFGaYwmbGmyewGv1e2TU` did not land enough probes to judge (τ=n/a, n=0, windows=3).
- Firedancer `9eGrDohdNTAo61DRHyfMuqKWXqYnA3i254Wiszxe8FoY` did not land enough probes to judge (τ=n/a, n=0, windows=3).
- FireBAM `9jxgosAfHgHzwnxsHw4RAZYaLVokMbnYtmiZBreynGFP` did not land enough probes to judge (τ=n/a, n=0, windows=3).
- Agave `7QQGNm3ptwinipDCyaCF7jY5katgmFUu1ieP2f7nwLpE` did not land enough probes to judge (τ=n/a, n=0, windows=3).

## What went wrong

- This was a dry run: no probes were sent, so land rates are empty by design.
- A dry run cannot distinguish a real ordering rule from noise; only a live run can.

## How to verify

Every landed probe in `data/collected.json` has a signature and a slot.
Call `getBlock(slot)` and find the signature; its index is the position we report.
Signers are derived deterministically (see `src/wallets.js`), so the fee-payer set re-derives from the same seed.
