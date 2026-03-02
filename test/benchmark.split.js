const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { performance } = require('perf_hooks');

const { Pool, Token, Trade, CurrencyAmount } = require('../build');
const { computeAllRoutes } = require('../build/utils/computeAllRoutes');
const { FeeAmount, TICK_SPACINGS, TradeType } = require('../build/internalConstants');
const { encodeSqrtRatioX64 } = require('../build/utils/encodeSqrtRatioX64');
const { TickMath } = require('../build/utils/tickMath');
const { nearestUsableTick } = require('../build/utils/nearestUsableTick');
const { sqrt } = require('../build/utils/sqrt');

function getArg(name, fallback) {
  const idx = process.argv.indexOf(name);
  if (idx === -1 || idx + 1 >= process.argv.length) return fallback;
  return process.argv[idx + 1];
}

function hasArg(name) {
  return process.argv.includes(name);
}

function percentile(sorted, p) {
  if (!sorted.length) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
}

function round(num, digits = 4) {
  const m = 10 ** digits;
  return Math.round(num * m) / m;
}

function createToken(id, decimals = 8) {
  const contracts = [
    'token.a', 'token.b', 'token.c', 'token.d', 'token.e',
    'token.f', 'token.g', 'token.h', 'token.i', 'token.j'
  ];
  const symbols = ['TKNA', 'TKNB', 'TKNC', 'TKND', 'TKNE', 'TKNF', 'TKNG', 'TKNH', 'TKNI', 'TKNJ'];

  return new Token(contracts[id], decimals, symbols[id]);
}

function createPool(id, tokenA, tokenB, reserveA, reserveB, feeAmount = FeeAmount.MEDIUM) {
  const reserve0 = CurrencyAmount.fromRawAmount(tokenA, reserveA);
  const reserve1 = CurrencyAmount.fromRawAmount(tokenB, reserveB);
  const sqrtRatioX64 = encodeSqrtRatioX64(reserve1.quotient, reserve0.quotient);
  const liquidity = sqrt(reserve0.quotient * reserve1.quotient);

  return new Pool({
    id,
    active: true,
    tokenA,
    tokenB,
    fee: feeAmount,
    sqrtPriceX64: sqrtRatioX64,
    liquidity,
    tickCurrent: TickMath.getTickAtSqrtRatio(sqrtRatioX64),
    feeGrowthGlobalAX64: 0,
    feeGrowthGlobalBX64: 0,
    ticks: [
      {
        id: nearestUsableTick(TickMath.MIN_TICK, TICK_SPACINGS[feeAmount]),
        liquidityNet: liquidity,
        liquidityGross: liquidity,
        feeGrowthOutsideAX64: 0,
        feeGrowthOutsideBX64: 0,
        tickCumulativeOutside: 0,
        secondsPerLiquidityOutsideX64: 0,
        secondsOutside: 0
      },
      {
        id: nearestUsableTick(TickMath.MAX_TICK, TICK_SPACINGS[feeAmount]),
        liquidityNet: liquidity * BigInt(-1),
        liquidityGross: liquidity,
        feeGrowthOutsideAX64: 0,
        feeGrowthOutsideBX64: 0,
        tickCumulativeOutside: 0,
        secondsPerLiquidityOutsideX64: 0,
        secondsOutside: 0
      }
    ]
  });
}

function buildDataset() {
  const tokens = Array.from({ length: 10 }, (_, i) => createToken(i));

  const pools = [
    createPool(0, tokens[0], tokens[1], 1_000_000, 1_030_000),
    createPool(1, tokens[0], tokens[2], 1_000_000, 980_000),
    createPool(2, tokens[0], tokens[3], 1_000_000, 1_015_000),
    createPool(3, tokens[0], tokens[4], 1_000_000, 990_000),
    createPool(4, tokens[1], tokens[2], 1_100_000, 1_000_000),
    createPool(5, tokens[1], tokens[3], 1_060_000, 970_000),
    createPool(6, tokens[1], tokens[5], 1_000_000, 1_020_000),
    createPool(7, tokens[2], tokens[3], 960_000, 1_050_000),
    createPool(8, tokens[2], tokens[4], 1_090_000, 1_000_000),
    createPool(9, tokens[2], tokens[5], 1_000_000, 1_040_000),
    createPool(10, tokens[2], tokens[6], 1_050_000, 980_000),
    createPool(11, tokens[3], tokens[4], 1_000_000, 1_020_000),
    createPool(12, tokens[3], tokens[5], 1_000_000, 1_000_000),
    createPool(13, tokens[3], tokens[7], 1_070_000, 960_000),
    createPool(14, tokens[4], tokens[5], 990_000, 1_060_000),
    createPool(15, tokens[4], tokens[6], 1_020_000, 1_010_000),
    createPool(16, tokens[5], tokens[6], 1_000_000, 1_020_000),
    createPool(17, tokens[5], tokens[7], 1_000_000, 1_030_000),
    createPool(18, tokens[6], tokens[7], 1_000_000, 1_010_000),
    createPool(19, tokens[6], tokens[8], 1_010_000, 995_000),
    createPool(20, tokens[7], tokens[8], 1_000_000, 1_015_000),
    createPool(21, tokens[8], tokens[9], 1_000_000, 1_000_000),
    createPool(22, tokens[5], tokens[9], 1_000_000, 1_050_000),
    createPool(23, tokens[4], tokens[9], 1_030_000, 990_000)
  ];

  return { tokens, pools };
}

function serializeTrade(trade) {
  const swaps = trade.swaps.map((s) => ({
    percent: s.percent,
    inputRaw: s.inputAmount.quotient.toString(),
    outputRaw: s.outputAmount.quotient.toString(),
    path: s.route.tokenPath.map((t) => t.symbol),
    poolIds: s.route.pools.map((p) => p.id)
  }));

  return {
    totalInputRaw: trade.inputAmount.quotient.toString(),
    totalOutputRaw: trade.outputAmount.quotient.toString(),
    swapCount: swaps.length,
    swaps
  };
}

function fingerprint(obj) {
  return crypto.createHash('sha256').update(JSON.stringify(obj)).digest('hex');
}

function runCase({ routes, inputAmount, percents, maxSplits, warmup, iterations }) {
  const config = { minSplits: 1, maxSplits };
  for (let i = 0; i < warmup; i++) {
    Trade.bestTradeWithSplit(routes, inputAmount, percents, TradeType.EXACT_INPUT, config);
  }

  const times = [];
  let firstSerialized = null;
  let firstFingerprint = null;
  let mismatches = 0;

  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    const trade = Trade.bestTradeWithSplit(routes, inputAmount, percents, TradeType.EXACT_INPUT, config);
    const elapsed = performance.now() - start;
    times.push(elapsed);

    if (!trade) {
      throw new Error(`No trade found for maxSplits=${maxSplits}`);
    }

    const serialized = serializeTrade(trade);
    const fp = fingerprint(serialized);

    if (i === 0) {
      firstSerialized = serialized;
      firstFingerprint = fp;
    } else if (fp !== firstFingerprint) {
      mismatches++;
    }
  }

  const sorted = [...times].sort((a, b) => a - b);
  const sum = times.reduce((acc, val) => acc + val, 0);

  return {
    maxSplits,
    metrics: {
      iterations,
      warmup,
      avgMs: round(sum / times.length),
      minMs: round(sorted[0]),
      p50Ms: round(percentile(sorted, 50)),
      p95Ms: round(percentile(sorted, 95)),
      maxMs: round(sorted[sorted.length - 1])
    },
    determinism: {
      mismatches,
      stable: mismatches === 0
    },
    result: {
      fingerprint: firstFingerprint,
      ...firstSerialized
    }
  };
}

function compareWithBaseline(current, baseline) {
  const bySplit = new Map();
  for (const c of current.cases) bySplit.set(c.maxSplits, { current: c, baseline: null });
  for (const b of baseline.cases || []) {
    if (!bySplit.has(b.maxSplits)) bySplit.set(b.maxSplits, { current: null, baseline: b });
    else bySplit.get(b.maxSplits).baseline = b;
  }

  const compare = [];
  for (const [maxSplits, pair] of [...bySplit.entries()].sort((a, b) => a[0] - b[0])) {
    if (!pair.current || !pair.baseline) {
      compare.push({ maxSplits, missing: true });
      continue;
    }

    const currAvg = pair.current.metrics.avgMs;
    const baseAvg = pair.baseline.metrics.avgMs;
    const deltaMs = round(currAvg - baseAvg);
    const deltaPct = baseAvg === 0 ? null : round((deltaMs / baseAvg) * 100, 2);

    compare.push({
      maxSplits,
      avgMsBefore: baseAvg,
      avgMsNow: currAvg,
      avgDeltaMs: deltaMs,
      avgDeltaPct: deltaPct,
      p95Before: pair.baseline.metrics.p95Ms,
      p95Now: pair.current.metrics.p95Ms,
      outputBefore: pair.baseline.result.totalOutputRaw,
      outputNow: pair.current.result.totalOutputRaw,
      sameOutput: pair.baseline.result.totalOutputRaw === pair.current.result.totalOutputRaw,
      sameFingerprint: pair.baseline.result.fingerprint === pair.current.result.fingerprint
    });
  }

  return compare;
}

function printSummary(result, compareRows) {
  console.log('\n=== Split Benchmark ===');
  console.log(`Dataset: pools=${result.meta.poolCount}, routes=${result.meta.routeCount}, maxHops=${result.meta.maxHops}`);
  console.log(`AmountIn raw: ${result.meta.inputAmountRaw}`);
  console.log(`Percents: ${result.meta.percents.join(', ')}`);
  console.log(`Iterations: ${result.meta.iterations}, warmup=${result.meta.warmup}`);

  console.log('\n-- Current --');
  for (const c of result.cases) {
    console.log(
      `maxSplits=${c.maxSplits} | avg=${c.metrics.avgMs}ms p95=${c.metrics.p95Ms}ms ` +
      `output=${c.result.totalOutputRaw} swaps=${c.result.swapCount} stable=${c.determinism.stable}`
    );
  }

  if (compareRows && compareRows.length > 0) {
    console.log('\n-- Compare vs baseline --');
    for (const row of compareRows) {
      if (row.missing) {
        console.log(`maxSplits=${row.maxSplits} | missing case in baseline/current`);
        continue;
      }
      const sign = row.avgDeltaMs > 0 ? '+' : '';
      console.log(
        `maxSplits=${row.maxSplits} | avg ${row.avgMsBefore} -> ${row.avgMsNow}ms ` +
        `(${sign}${row.avgDeltaMs}ms, ${sign}${row.avgDeltaPct}%) | ` +
        `sameOutput=${row.sameOutput} sameFingerprint=${row.sameFingerprint}`
      );
    }
  }
}

function main() {
  const outPath = path.resolve(getArg('--out', 'benchmark-results/split-current.json'));
  const baselinePath = path.resolve(getArg('--baseline', 'benchmark-results/split-baseline.json'));
  const iterations = Number(getArg('--iterations', '80'));
  const warmup = Number(getArg('--warmup', '8'));
  const maxHops = Number(getArg('--maxHops', '4'));
  const maxSplitsList = getArg('--maxSplits', '2,4,6').split(',').map((v) => Number(v.trim())).filter(Boolean);
  const saveBaseline = hasArg('--save-baseline');

  const percents = [5, 10, 15, 20, 25, 30, 35, 40, 50, 60, 70, 80, 90, 100];
  const { tokens, pools } = buildDataset();
  const inputToken = tokens[0];
  const outputToken = tokens[9];
  const inputAmount = CurrencyAmount.fromRawAmount(inputToken, 250_000);

  const routes = computeAllRoutes(inputToken, outputToken, pools, maxHops);
  if (!routes.length) {
    throw new Error('No routes found for benchmark dataset');
  }

  const cases = maxSplitsList.map((maxSplits) => runCase({
    routes,
    inputAmount,
    percents,
    maxSplits,
    warmup,
    iterations
  }));

  const result = {
    meta: {
      timestamp: new Date().toISOString(),
      nodeVersion: process.version,
      poolCount: pools.length,
      routeCount: routes.length,
      maxHops,
      inputAmountRaw: inputAmount.quotient.toString(),
      percents,
      iterations,
      warmup
    },
    cases
  };

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(result, null, 2));

  let compareRows = [];
  if (saveBaseline) {
    fs.mkdirSync(path.dirname(baselinePath), { recursive: true });
    fs.writeFileSync(baselinePath, JSON.stringify(result, null, 2));
  } else if (fs.existsSync(baselinePath)) {
    const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
    compareRows = compareWithBaseline(result, baseline);
  }

  printSummary(result, compareRows);
  console.log(`\nSaved current result: ${outPath}`);
  if (saveBaseline) {
    console.log(`Saved baseline result: ${baselinePath}`);
  } else if (!fs.existsSync(baselinePath)) {
    console.log(`Baseline file not found: ${baselinePath}`);
  } else {
    console.log(`Compared with baseline: ${baselinePath}`);
  }
}

main();
