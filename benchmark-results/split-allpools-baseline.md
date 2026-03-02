# All-Pools Split Baseline

Date: 2026-03-02

## Scenario
- Engine: `Trade.bestTradeWithSplit` (`EXACT_INPUT`)
- Source pools: Mongo + Redis (`chain=wax`) as in `test23`
- Pair: `TLM (alien.worlds, 4) -> WAX (eosio.token, 8)`
- Amount raw: `9000000`
- `maxHops=3`
- `maxSplits=2,4,6,8,10`
- Profiles:
  - `coarse4`: `25,50,75,100`
  - `balanced7`: `5,10,15,25,50,75,100`
- Iterations: `6`
- Warmup: `1`

## Baseline Results (DO)

| profile | maxSplits | avg ms | p95 ms | totalOutputRaw | swaps |
|---|---:|---:|---:|---:|---:|
| coarse4 | 2 | 826.2663 | 836.1473 | 23946608759 | 1 |
| coarse4 | 4 | 838.0116 | 857.6407 | 23946608759 | 1 |
| coarse4 | 6 | 823.1871 | 828.1580 | 23946608759 | 1 |
| coarse4 | 8 | 825.1585 | 835.1372 | 23946608759 | 1 |
| coarse4 | 10 | 823.6340 | 830.8339 | 23946608759 | 1 |
| balanced7 | 2 | 1336.6628 | 1346.7302 | 23946608759 | 1 |
| balanced7 | 4 | 1341.6936 | 1361.1765 | 23946608759 | 1 |
| balanced7 | 6 | 1369.6106 | 1431.7332 | 23946608759 | 1 |
| balanced7 | 8 | 1355.4553 | 1403.4063 | 23946608759 | 1 |
| balanced7 | 10 | 1576.6523 | 1716.2398 | 23946608759 | 1 |

## Extra Check (same scenario, `maxSplits=10`)

| profile | avg ms | totalOutputRaw |
|---|---:|---:|
| coarse4 | 833.9457 | 23946608759 |
| balanced7 | 1342.6491 | 23946608759 |
| dense14 (`5..100`) | 2762.2240 | 23946608759 |

Observation: for this pair/amount output is identical, so more granular percent sets only increase CPU cost.

## Artifacts
- Baseline: `benchmark-results/split-allpools-baseline.json`
- Current: `benchmark-results/split-allpools-current.json`
- Runner: `test/benchmark.split.allpools.js`

## Commands

Save baseline:

```bash
node test/benchmark.split.allpools.js --save-baseline --iterations 6 --warmup 1
```

Run and compare vs baseline:

```bash
node test/benchmark.split.allpools.js --iterations 6 --warmup 1
```

Strategy check (single `maxSplits=10`):

```bash
node test/benchmark.split.allpools.js --iterations 3 --warmup 1 --profiles coarse4,balanced7,dense14 --maxSplits 10
```
