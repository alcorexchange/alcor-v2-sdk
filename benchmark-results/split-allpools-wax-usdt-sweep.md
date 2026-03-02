# All-Pools Sweep: WAX -> USDT

Date: 2026-03-02

## Scenario
- Pair: `WAX (eosio.token, 8) -> USDT (usdt.alcor, 4)`
- Amount raw: `1122300000000`
- Pools: `6342`
- Routes: `6707`
- `maxHops=3`
- `tradeType=EXACT_INPUT`
- `maxSplits=2,4,6,10`
- Iterations: `2`
- Warmup: `0`

## Results

| profile | maxSplits | avg ms | p95 ms | totalOutputRaw | swaps |
|---|---:|---:|---:|---:|---:|
| coarse4 (`25,50,75,100`) | 2 | 1312.7384 | 1358.4288 | 758313 | 2 |
| coarse4 | 4 | 1276.2159 | 1284.1669 | 758313 | 2 |
| coarse4 | 6 | 1268.2588 | 1269.5406 | 758313 | 2 |
| coarse4 | 10 | 1271.5824 | 1276.8463 | 758313 | 2 |
| balanced7 (`5,10,15,25,50,75,100`) | 2 | 2074.0489 | 2078.0559 | 758313 | 2 |
| balanced7 | 4 | 2695.1181 | 3304.4692 | 767643 | 4 |
| balanced7 | 6 | 3938.1769 | 4311.1559 | 773012 | 6 |
| balanced7 | 10 | 3634.2610 | 4564.3407 | 774533 | 7 |

Observation: here split granularity gives better output, but CPU cost grows sharply.

## Artifact
- JSON: `benchmark-results/split-allpools-wax-usdt-sweep.json`
