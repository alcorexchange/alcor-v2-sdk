# Split Benchmark Baseline

Date: 2026-03-02

## Scenario
- Engine: `Trade.bestTradeWithSplit` (EXACT_INPUT)
- Dataset: synthetic fixed pools/tokens from `test/benchmark.split.js`
- Pools: 24
- Routes: 31
- Max hops: 4
- Input amount (raw): 250000
- Percents: `5,10,15,20,25,30,35,40,50,60,70,80,90,100`
- Iterations: 80
- Warmup: 8

## Baseline Results (DO)

| maxSplits | avg ms | p95 ms | totalOutputRaw | swaps |
|---|---:|---:|---:|---:|
| 2 | 8.9074 | 9.4409 | 193856 | 2 |
| 4 | 9.1970 | 9.8277 | 201258 | 3 |
| 6 | 9.0300 | 9.3176 | 201258 | 3 |

## Artifacts
- Baseline JSON: `benchmark-results/split-baseline.json`
- Current JSON: `benchmark-results/split-current.json`

## Re-run commands

Save new baseline:

```bash
node test/benchmark.split.js --save-baseline
```

Run current and compare vs baseline:

```bash
node test/benchmark.split.js
```

Optional custom run:

```bash
node test/benchmark.split.js --iterations 120 --warmup 10 --maxHops 4 --maxSplits 2,4,6
```
