# Split Optimization Report

Date: 2026-03-02

## What changed
- `bestTradeWithSplit` no longer creates a full `Trade` object for every `(route, percent)` pair.
- Split search now works with lightweight quote candidates (`SplitRouteQuote`).
- `getBestSwapRoute` was rewritten to reduce allocations and keep configurable search knobs (`branchFactor`, `candidateLimit`).
- WASM split path fixed to preserve route/percent mapping in batch mode and to use the same lightweight quote shape.

## Baseline scenario (TLM -> WAX, all pools)
Scenario: `amountRaw=9000000`, `maxHops=3`, `coarse4 + balanced7`, `maxSplits=2,4,6,8,10`.

### Before
From `benchmark-results/split-allpools-baseline.json`.

### After
From `node test/benchmark.split.allpools.js --iterations 3 --warmup 1`.

### Delta (avg ms)
- `coarse4 maxSplits=2`: `826.2663 -> 765.9207` (`-7.30%`)
- `coarse4 maxSplits=4`: `838.0116 -> 767.6227` (`-8.40%`)
- `coarse4 maxSplits=6`: `823.1871 -> 766.4070` (`-6.90%`)
- `coarse4 maxSplits=8`: `825.1585 -> 759.0052` (`-8.02%`)
- `coarse4 maxSplits=10`: `823.6340 -> 765.2204` (`-7.09%`)
- `balanced7 maxSplits=2`: `1336.6628 -> 1242.5903` (`-7.04%`)
- `balanced7 maxSplits=4`: `1341.6936 -> 1244.1071` (`-7.27%`)
- `balanced7 maxSplits=6`: `1369.6106 -> 1232.3473` (`-10.02%`)
- `balanced7 maxSplits=8`: `1355.4553 -> 1232.1628` (`-9.10%`)
- `balanced7 maxSplits=10`: `1576.6523 -> 1225.7303` (`-22.26%`)

Result consistency on this scenario:
- `sameOutput=true`
- `sameFingerprint=true`

## Quality-sensitive scenario (WAX -> USDT, all pools)
Scenario: `amountRaw=1122300000000`, `maxHops=3`, `maxSplits=2,4,6,10`, profiles `coarse4 + balanced7`.

### Before
From `benchmark-results/split-allpools-wax-usdt-sweep.md`.

### After (latest run)
- `coarse4 maxSplits=10`: `1267.5103ms`, output `758313`
- `balanced7 maxSplits=10`: `2019.2241ms`, output `774533`

Output stayed identical vs previous runs for each profile/split point.
Latency dropped significantly (especially on `balanced7`).

## Strategy guidance
- Fast default: `coarse4` + `maxSplits=2..4`.
- Quality mode: `balanced7` + `maxSplits=6`.
- Very high cost mode: `balanced7` + `maxSplits=10` only for large/high-value swaps.

## Repro commands

```bash
npm run build
node test/benchmark.split.allpools.js --iterations 6 --warmup 1
node test/benchmark.split.allpools.js --iterations 2 --warmup 0 --profiles coarse4,balanced7 --maxSplits 2,4,6,10 --tokenInContract eosio.token --tokenInDecimals 8 --tokenInSymbol WAX --tokenOutContract usdt.alcor --tokenOutDecimals 4 --tokenOutSymbol USDT --amountRaw 1122300000000
```
