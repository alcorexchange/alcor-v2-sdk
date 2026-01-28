import { Pool } from "../src/entities/pool";
import { Token } from "../src/entities/token";
import { Trade } from "../src/entities/trade";
import { Route } from "../src/entities/route";
import { CurrencyAmount } from "../src/entities/fractions/currencyAmount";
import { computeAllRoutes } from "../src/utils/computeAllRoutes";
import { FeeAmount, TICK_SPACINGS } from "../src/internalConstants";
import { encodeSqrtRatioX64 } from "../src/utils/encodeSqrtRatioX64";
import { TickMath } from "../src/utils/tickMath";
import { nearestUsableTick } from "../src/utils/nearestUsableTick";
import { sqrt } from "../src/utils/sqrt";

// Создаём токены (EOS контракты должны быть a-z, 1-5, .)
function createToken(id: number, decimals = 8): Token {
  // Используем валидные EOS имена
  const contracts = ['token.a', 'token.b', 'token.c', 'token.d', 'token.e',
                     'token.f', 'token.g', 'token.h', 'token.i', 'token.j'];
  const symbols = ['TKNA', 'TKNB', 'TKNC', 'TKND', 'TKNE',
                   'TKNF', 'TKNG', 'TKNH', 'TKNI', 'TKNJ'];
  return new Token(
    contracts[id],
    decimals,
    symbols[id]
  );
}

// Создаём пул в стиле V2 (полная ликвидность по всему диапазону)
function createPool(
  id: number,
  tokenA: Token,
  tokenB: Token,
  reserveA: number,
  reserveB: number,
  feeAmount: FeeAmount = FeeAmount.MEDIUM
): Pool {
  const reserve0 = CurrencyAmount.fromRawAmount(tokenA, reserveA);
  const reserve1 = CurrencyAmount.fromRawAmount(tokenB, reserveB);

  const sqrtRatioX64 = encodeSqrtRatioX64(reserve1.quotient, reserve0.quotient);
  const liquidity = sqrt((reserve0.quotient * reserve1.quotient));

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
        secondsOutside: 0,
      },
      {
        id: nearestUsableTick(TickMath.MAX_TICK, TICK_SPACINGS[feeAmount]),
        liquidityNet: (liquidity * BigInt(-1)),
        liquidityGross: liquidity,
        feeGrowthOutsideAX64: 0,
        feeGrowthOutsideBX64: 0,
        tickCumulativeOutside: 0,
        secondsPerLiquidityOutsideX64: 0,
        secondsOutside: 0,
      },
    ],
  });
}

// Бенчмарк функция
function benchmark(name: string, fn: () => void, iterations: number): { avg: number; total: number; perSec: number } {
  // Warmup
  for (let i = 0; i < Math.min(10, iterations); i++) fn();

  const start = performance.now();
  for (let i = 0; i < iterations; i++) fn();
  const total = performance.now() - start;

  return {
    avg: total / iterations,
    total,
    perSec: Math.round(iterations / (total / 1000))
  };
}

// Основной тест
async function runBenchmark() {
  console.log("=== Trade Calculation Benchmark ===\n");

  // Создаём 10 токенов
  const tokens = Array.from({ length: 10 }, (_, i) => createToken(i));

  // Создаём пулы (связываем токены)
  // Структура: 0-1, 0-2, 0-3, 1-2, 1-3, 1-4, 2-3, 2-4, 2-5, 3-4, 3-5, 4-5, 5-6, 6-7, 7-8, 8-9
  const pools: Pool[] = [
    createPool(0, tokens[0], tokens[1], 1000000, 1000000),
    createPool(1, tokens[0], tokens[2], 1000000, 1100000),
    createPool(2, tokens[0], tokens[3], 1000000, 900000),
    createPool(3, tokens[1], tokens[2], 1200000, 1000000),
    createPool(4, tokens[1], tokens[3], 1200000, 1300000),
    createPool(5, tokens[1], tokens[4], 1000000, 1000000),
    createPool(6, tokens[2], tokens[3], 1000000, 1000000),
    createPool(7, tokens[2], tokens[4], 1100000, 1000000),
    createPool(8, tokens[2], tokens[5], 1000000, 950000),
    createPool(9, tokens[3], tokens[4], 900000, 1000000),
    createPool(10, tokens[3], tokens[5], 1000000, 1000000),
    createPool(11, tokens[4], tokens[5], 1000000, 1100000),
    createPool(12, tokens[5], tokens[6], 1000000, 1000000),
    createPool(13, tokens[6], tokens[7], 1000000, 1000000),
    createPool(14, tokens[7], tokens[8], 1000000, 1000000),
    createPool(15, tokens[8], tokens[9], 1000000, 1000000),
  ];

  console.log(`Pools: ${pools.length}`);
  console.log(`Tokens: ${tokens.length}`);

  // Тест 1: computeAllRoutes
  console.log("\n--- Test 1: computeAllRoutes ---");

  const maxHops = 3;
  const inputToken = tokens[0];
  const outputToken = tokens[5];

  let routes: Route<Token, Token>[] = [];
  const routesBench = benchmark("computeAllRoutes", () => {
    routes = computeAllRoutes(inputToken, outputToken, pools, maxHops);
  }, 1000);

  console.log(`Routes found: ${routes.length}`);
  console.log(`Avg time: ${routesBench.avg.toFixed(3)} ms`);
  console.log(`Per second: ${routesBench.perSec}`);

  // Тест 2: Trade.fromRoute (один маршрут)
  console.log("\n--- Test 2: Trade.fromRoute (single route) ---");

  const inputAmount = CurrencyAmount.fromRawAmount(inputToken, 100000);
  const testRoute = routes[0];

  const singleTradeBench = benchmark("Trade.fromRoute", () => {
    Trade.fromRoute(testRoute, inputAmount, 0); // TradeType.EXACT_INPUT = 0
  }, 10000);

  console.log(`Avg time: ${singleTradeBench.avg.toFixed(4)} ms`);
  console.log(`Per second: ${singleTradeBench.perSec}`);

  // Тест 3: Trade.fromRoute для всех маршрутов
  console.log("\n--- Test 3: Trade.fromRoute (all routes) ---");

  const allRoutesBench = benchmark("All routes evaluation", () => {
    for (const route of routes) {
      try {
        Trade.fromRoute(route, inputAmount, 0);
      } catch (e) {
        // Ignore liquidity errors
      }
    }
  }, 1000);

  console.log(`Routes per iteration: ${routes.length}`);
  console.log(`Avg time per iteration: ${allRoutesBench.avg.toFixed(3)} ms`);
  console.log(`Avg time per route: ${(allRoutesBench.avg / routes.length).toFixed(4)} ms`);
  console.log(`Routes per second: ${Math.round(routes.length * allRoutesBench.perSec)}`);

  // Тест 4: bestTradeExactIn
  console.log("\n--- Test 4: bestTradeExactIn ---");

  const bestTradeBench = benchmark("bestTradeExactIn", () => {
    Trade.bestTradeExactIn(routes, inputAmount, 1);
  }, 1000);

  console.log(`Avg time: ${bestTradeBench.avg.toFixed(3)} ms`);
  console.log(`Per second: ${bestTradeBench.perSec}`);

  // Тест 5: Pool.getOutputAmount (изолированно)
  console.log("\n--- Test 5: Pool.getOutputAmount (isolated) ---");

  const testPool = pools[0];
  const poolInput = CurrencyAmount.fromRawAmount(tokens[0], 10000);

  const poolBench = benchmark("Pool.getOutputAmount", () => {
    testPool.getOutputAmount(poolInput);
  }, 50000);

  console.log(`Avg time: ${poolBench.avg.toFixed(5)} ms`);
  console.log(`Per second: ${poolBench.perSec}`);

  // Тест 6: 3-hop route
  console.log("\n--- Test 6: 3-hop route Trade.fromRoute ---");

  const threeHopRoutes = routes.filter(r => r.pools.length === 3);
  if (threeHopRoutes.length > 0) {
    const threeHopRoute = threeHopRoutes[0];
    console.log(`Route: ${threeHopRoute.tokenPath.map(t => t.symbol).join(" -> ")}`);

    const threeHopBench = benchmark("3-hop Trade.fromRoute", () => {
      Trade.fromRoute(threeHopRoute, inputAmount, 0);
    }, 10000);

    console.log(`Avg time: ${threeHopBench.avg.toFixed(4)} ms`);
    console.log(`Per second: ${threeHopBench.perSec}`);
  } else {
    console.log("No 3-hop routes found");
  }

  // Summary
  console.log("\n=== SUMMARY ===");
  console.log(`computeAllRoutes (${routes.length} routes, maxHops=${maxHops}): ${routesBench.avg.toFixed(3)} ms`);
  console.log(`Trade.fromRoute (single): ${singleTradeBench.avg.toFixed(4)} ms`);
  console.log(`Trade.fromRoute (3-hop): ${threeHopRoutes.length > 0 ? (benchmark("", () => Trade.fromRoute(threeHopRoutes[0], inputAmount, 0), 1000).avg.toFixed(4) + " ms") : "N/A"}`);
  console.log(`bestTradeExactIn: ${bestTradeBench.avg.toFixed(3)} ms`);
  console.log(`Pool.getOutputAmount: ${poolBench.avg.toFixed(5)} ms`);
}

runBenchmark().catch(console.error);
