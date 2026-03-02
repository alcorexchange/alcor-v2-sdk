require('dotenv').config();

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { performance } = require('perf_hooks');
const mongoose = require('mongoose');
const { createClient } = require('redis');

const { Token, Pool, Trade, CurrencyAmount, TradeType } = require('../build');
const { computeAllRoutes } = require('../build/utils/computeAllRoutes');

function getArg(name, fallback) {
  const idx = process.argv.indexOf(name);
  if (idx === -1 || idx + 1 >= process.argv.length) return fallback;
  return process.argv[idx + 1];
}

function hasArg(name) {
  return process.argv.includes(name);
}

function round(num, digits = 4) {
  const m = 10 ** digits;
  return Math.round(num * m) / m;
}

function percentile(sorted, p) {
  if (!sorted.length) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
}

function fingerprint(obj) {
  return crypto.createHash('sha256').update(JSON.stringify(obj)).digest('hex');
}

const PERCENT_PROFILES = {
  coarse4: [25, 50, 75, 100],
  balanced7: [5, 10, 15, 25, 50, 75, 100],
  dense14: [5, 10, 15, 20, 25, 30, 35, 40, 50, 60, 70, 80, 90, 100]
};

const redis = createClient();

const SwapPoolSchema = new mongoose.Schema({
  chain: { type: String, index: true },
  id: { type: Number, index: true },
  fee: { type: Number, index: true },
  active: { type: Boolean, index: true },
  tokenA: {
    contract: { type: String, index: true },
    symbol: { type: String, index: true },
    id: { type: String, index: true },
    decimals: { type: Number }
  },
  tokenB: {
    contract: { type: String, index: true },
    symbol: { type: String, index: true },
    id: { type: String, index: true },
    decimals: { type: Number }
  },
  sqrtPriceX64: { type: String },
  tick: { type: Number },
  feeGrowthGlobalAX64: { type: String },
  feeGrowthGlobalBX64: { type: String },
  liquidity: { type: String }
});
SwapPoolSchema.index({ chain: 1, id: 1 }, { unique: true });
const SwapPool = mongoose.models.SwapPool || mongoose.model('SwapPool', SwapPoolSchema);

async function connectAll() {
  const uri = `mongodb://${process.env.MONGO_HOST}:${process.env.MONGO_PORT}/${process.env.MONGO_DB}`;
  await mongoose.connect(uri, {
    useUnifiedTopology: true,
    useNewUrlParser: true,
    useCreateIndex: true
  });
  if (!redis.isOpen) await redis.connect();
}

async function disconnectAll() {
  await mongoose.disconnect();
  if (redis.isOpen) await redis.disconnect();
}

async function getPools(chain) {
  const mongoPools = await SwapPool.find({ chain, active: true }).lean();
  const keys = mongoPools.map((p) => `ticks_${chain}_${p.id}`);
  const tickEntries = keys.length ? await redis.mGet(keys) : [];

  const pools = [];

  for (let i = 0; i < mongoPools.length; i++) {
    const p = mongoPools[i];
    const raw = tickEntries[i];
    if (!raw) continue;

    let ticks;
    try {
      const plain = JSON.parse(raw) || [];
      const ticksMap = raw ? new Map([...plain].sort((a, b) => a.id - b.id)) : new Map();
      ticks = Array.from(ticksMap.values()).sort((a, b) => a.id - b.id);
    } catch {
      continue;
    }

    if (!Array.isArray(ticks) || ticks.length === 0) continue;

    pools.push(new Pool({
      ...p,
      tokenA: new Token(p.tokenA.contract, p.tokenA.decimals, p.tokenA.symbol, p.tokenA.id),
      tokenB: new Token(p.tokenB.contract, p.tokenB.decimals, p.tokenB.symbol, p.tokenB.id),
      ticks,
      tickCurrent: p.tick
    }));
  }

  return pools;
}

function serializeTrade(trade) {
  return {
    totalInputRaw: trade.inputAmount.quotient.toString(),
    totalOutputRaw: trade.outputAmount.quotient.toString(),
    swapCount: trade.swaps.length,
    swaps: trade.swaps.map((s) => ({
      percent: s.percent,
      inputRaw: s.inputAmount.quotient.toString(),
      outputRaw: s.outputAmount.quotient.toString(),
      path: s.route.tokenPath.map((t) => t.id),
      poolIds: s.route.pools.map((p) => p.id)
    }))
  };
}

function runOneCase({ routes, amount, percents, tradeType, maxSplits, warmup, iterations }) {
  const cfg = { minSplits: 1, maxSplits };

  for (let i = 0; i < warmup; i++) {
    Trade.bestTradeWithSplit(routes, amount, percents, tradeType, cfg);
  }

  const times = [];
  let first = null;
  let firstFp = null;
  let mismatches = 0;

  for (let i = 0; i < iterations; i++) {
    const t0 = performance.now();
    const trade = Trade.bestTradeWithSplit(routes, amount, percents, tradeType, cfg);
    const dt = performance.now() - t0;
    times.push(dt);

    if (!trade) throw new Error(`No trade found for maxSplits=${maxSplits}`);

    const serialized = serializeTrade(trade);
    const fp = fingerprint(serialized);

    if (i === 0) {
      first = serialized;
      firstFp = fp;
    } else if (fp !== firstFp) {
      mismatches++;
    }
  }

  const sorted = [...times].sort((a, b) => a - b);
  const sum = times.reduce((a, b) => a + b, 0);

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
      stable: mismatches === 0,
      mismatches
    },
    result: {
      fingerprint: firstFp,
      ...first
    }
  };
}

function keyFor(row) {
  return `${row.profile}|${row.maxSplits}`;
}

function buildScenarioKey(meta) {
  return [
    meta.chain,
    meta.tokenInId,
    meta.tokenOutId,
    meta.amountRaw,
    meta.maxHops,
    meta.tradeType,
    (meta.maxSplitsList || []).join(','),
    (meta.profiles || []).join(',')
  ].join('|');
}

function compareWithBaseline(current, baseline) {
  const currentScenario = buildScenarioKey(current.meta);
  const baselineScenario = buildScenarioKey((baseline && baseline.meta) || {});
  if (currentScenario !== baselineScenario) {
    return { scenarioMismatch: true, rows: [] };
  }

  const map = new Map();
  for (const c of current.cases) map.set(keyFor(c), { current: c, baseline: null });
  for (const b of baseline.cases || []) {
    const k = keyFor(b);
    if (!map.has(k)) map.set(k, { current: null, baseline: b });
    else map.get(k).baseline = b;
  }

  const rows = [];
  for (const [k, pair] of map.entries()) {
    const [profile, maxSplitsRaw] = k.split('|');
    const maxSplits = Number(maxSplitsRaw);

    if (!pair.current || !pair.baseline) {
      rows.push({ profile, maxSplits, missing: true });
      continue;
    }

    const curr = pair.current;
    const base = pair.baseline;
    const deltaMs = round(curr.metrics.avgMs - base.metrics.avgMs);
    const deltaPct = base.metrics.avgMs === 0 ? null : round((deltaMs / base.metrics.avgMs) * 100, 2);

    rows.push({
      profile,
      maxSplits,
      avgBefore: base.metrics.avgMs,
      avgNow: curr.metrics.avgMs,
      avgDeltaMs: deltaMs,
      avgDeltaPct: deltaPct,
      p95Before: base.metrics.p95Ms,
      p95Now: curr.metrics.p95Ms,
      outputBefore: base.result.totalOutputRaw,
      outputNow: curr.result.totalOutputRaw,
      sameOutput: base.result.totalOutputRaw === curr.result.totalOutputRaw,
      sameFingerprint: base.result.fingerprint === curr.result.fingerprint
    });
  }

  rows.sort((a, b) => {
    if (a.profile !== b.profile) return a.profile.localeCompare(b.profile);
    return a.maxSplits - b.maxSplits;
  });

  return { scenarioMismatch: false, rows };
}

function printSummary(result, compareRows, scenarioMismatch) {
  console.log('\n=== All-Pools Split Benchmark ===');
  console.log(`Chain=${result.meta.chain} pools=${result.meta.poolCount} routes=${result.meta.routeCount} maxHops=${result.meta.maxHops}`);
  console.log(`TradeType=${result.meta.tradeType} amountRaw=${result.meta.amountRaw}`);
  console.log(`MaxSplits=${result.meta.maxSplitsList.join(', ')} iterations=${result.meta.iterations} warmup=${result.meta.warmup}`);

  console.log('\n-- Current --');
  for (const c of result.cases) {
    console.log(
      `profile=${c.profile} maxSplits=${c.maxSplits} | avg=${c.metrics.avgMs}ms p95=${c.metrics.p95Ms}ms ` +
      `output=${c.result.totalOutputRaw} swaps=${c.result.swapCount} stable=${c.determinism.stable}`
    );
  }

  if (scenarioMismatch) {
    console.log('\n-- Compare vs baseline --');
    console.log('Skipped: baseline scenario does not match current run (token/amount/maxHops/tradeType/profiles).');
  } else if (compareRows.length > 0) {
    console.log('\n-- Compare vs baseline --');
    for (const row of compareRows) {
      if (row.missing) {
        console.log(`profile=${row.profile} maxSplits=${row.maxSplits} | missing case in baseline/current`);
        continue;
      }
      const sign = row.avgDeltaMs > 0 ? '+' : '';
      console.log(
        `profile=${row.profile} maxSplits=${row.maxSplits} | avg ${row.avgBefore} -> ${row.avgNow}ms ` +
        `(${sign}${row.avgDeltaMs}ms, ${sign}${row.avgDeltaPct}%) | ` +
        `sameOutput=${row.sameOutput} sameFingerprint=${row.sameFingerprint}`
      );
    }
  }
}

async function main() {
  const chain = getArg('--chain', 'wax');
  const maxHops = Number(getArg('--maxHops', '3'));
  const iterations = Number(getArg('--iterations', '8'));
  const warmup = Number(getArg('--warmup', '2'));
  const maxSplitsList = getArg('--maxSplits', '2,4,6,8,10').split(',').map((v) => Number(v.trim())).filter(Boolean);
  const profileNames = getArg('--profiles', 'coarse4,balanced7').split(',').map((s) => s.trim()).filter(Boolean);
  const tradeType = getArg('--tradeType', 'in') === 'out' ? TradeType.EXACT_OUTPUT : TradeType.EXACT_INPUT;
  const saveBaseline = hasArg('--save-baseline');

  const outPath = path.resolve(getArg('--out', 'benchmark-results/split-allpools-current.json'));
  const baselinePath = path.resolve(getArg('--baseline', 'benchmark-results/split-allpools-baseline.json'));

  const tokenIn = new Token(getArg('--tokenInContract', 'alien.worlds'), Number(getArg('--tokenInDecimals', '4')), getArg('--tokenInSymbol', 'TLM'));
  const tokenOut = new Token(getArg('--tokenOutContract', 'eosio.token'), Number(getArg('--tokenOutDecimals', '8')), getArg('--tokenOutSymbol', 'WAX'));
  const amount = CurrencyAmount.fromRawAmount(tokenIn, BigInt(getArg('--amountRaw', '9000000')));

  await connectAll();
  try {
    const pools = await getPools(chain);
    const routes = computeAllRoutes(amount.currency, tokenOut, pools, maxHops);

    if (!routes.length) {
      throw new Error('No routes found for selected tokens');
    }

    const cases = [];

    for (const profileName of profileNames) {
      const percents = PERCENT_PROFILES[profileName];
      if (!percents) {
        throw new Error(`Unknown profile: ${profileName}`);
      }

      for (const maxSplits of maxSplitsList) {
        const row = runOneCase({
          routes,
          amount,
          percents,
          tradeType,
          maxSplits,
          warmup,
          iterations
        });
        cases.push({ profile: profileName, percents, ...row });
      }
    }

    const result = {
      meta: {
        timestamp: new Date().toISOString(),
        nodeVersion: process.version,
        chain,
        poolCount: pools.length,
        routeCount: routes.length,
        maxHops,
        tradeType: tradeType === TradeType.EXACT_INPUT ? 'EXACT_INPUT' : 'EXACT_OUTPUT',
        tokenInId: tokenIn.id,
        tokenOutId: tokenOut.id,
        amountRaw: amount.quotient.toString(),
        maxSplitsList,
        iterations,
        warmup,
        profiles: profileNames
      },
      cases
    };

    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, JSON.stringify(result, null, 2));

    let compareRows = [];
    let scenarioMismatch = false;
    if (saveBaseline) {
      fs.mkdirSync(path.dirname(baselinePath), { recursive: true });
      fs.writeFileSync(baselinePath, JSON.stringify(result, null, 2));
    } else if (fs.existsSync(baselinePath)) {
      const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
      const compare = compareWithBaseline(result, baseline);
      compareRows = compare.rows;
      scenarioMismatch = compare.scenarioMismatch;
    }

    printSummary(result, compareRows, scenarioMismatch);

    console.log(`\nSaved current result: ${outPath}`);
    if (saveBaseline) {
      console.log(`Saved baseline result: ${baselinePath}`);
    } else if (fs.existsSync(baselinePath)) {
      console.log(`Compared with baseline: ${baselinePath}`);
    } else {
      console.log(`Baseline file not found: ${baselinePath}`);
    }
  } finally {
    await disconnectAll();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
