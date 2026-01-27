import { Token, Pool, Route, Trade } from '../entities';
import { CurrencyAmount } from '../entities/fractions';
import { TradeType } from '../internalConstants';
import JSBI from 'jsbi';

// WASM module - lazy loaded
let wasmModule: any = null;

function loadWasmModule() {
  if (!wasmModule) {
    try {
      wasmModule = require('./wasm_route_finder.js');
    } catch (error) {
      console.error('Failed to load WASM module:', error);
      throw new Error('WASM module not available');
    }
  }
  return wasmModule;
}

/**
 * WASM-accelerated trade calculator
 */
export class WASMTradeCalculator {
  private initialized = false;
  private poolsMap: Map<number, Pool> = new Map();

  /**
   * Initialize with pools including full swap data
   */
  async initializeWithPools(pools: Pool[]): Promise<void> {
    loadWasmModule();
    
    // Build pool map for fast lookup
    this.poolsMap.clear();
    for (const pool of pools) {
      this.poolsMap.set(pool.id, pool);
    }
    
    // Convert pools to format needed by WASM (including swap data)
    const wasmPools = pools.map(pool => {
      // Extract ticks from tickDataProvider if available
      let ticks: any[] = [];
      const tickProvider = pool.tickDataProvider as any;
      
      if (tickProvider && tickProvider.ticks) {
        ticks = tickProvider.ticks.map((tick: any) => ({
          id: tick.id || tick.index,
          index: tick.id || tick.index,
          liquidityNet: (tick.liquidityNet || '0').toString(),
          liquidityGross: (tick.liquidityGross || '0').toString(),
        }));
      }
      
      return {
        id: String(pool.id),
        token_a: { id: pool.tokenA.id },
        token_b: { id: pool.tokenB.id },
        fee: pool.fee,
        sqrtPriceX64: pool.sqrtPriceX64.toString(),
        liquidity: pool.liquidity.toString(),
        tickCurrent: pool.tickCurrent,
        ticks
      };
    });
    
    // Initialize pools with full data in WASM
    wasmModule.init_pools_with_data(wasmPools);
    this.initialized = true;
  }

  /**
   * Calculate trade output for a single route (WASM-accelerated)
   */
  calculateTradeOutput(
    route: Route<Token, Token>,
    amountIn: CurrencyAmount<Token>
  ): { amountOut: CurrencyAmount<Token>, priceImpact: number } {
    if (!this.initialized) {
      throw new Error('WASMTradeCalculator not initialized');
    }
    
    const poolIds = new Uint32Array(route.pools.map(p => p.id));
    const result = wasmModule.calculate_trade_output(
      poolIds,
      amountIn.quotient.toString(),
      route.input.id
    );
    
    // Check if result is valid
    // The result might be a Map or an object depending on wasm-bindgen
    let amountOutValue;
    let priceImpactValue = 0;
    
    if (result instanceof Map) {
      amountOutValue = result.get('amountOut');
      priceImpactValue = result.get('priceImpact') || 0;
    } else if (result && typeof result === 'object') {
      amountOutValue = result.amountOut;
      priceImpactValue = result.priceImpact || 0;
    }
    
    if (!amountOutValue) {
      console.error('WASM returned invalid result:', result);
      throw new Error('WASM trade calculation failed - no amountOut');
    }
    
    const amountOut = CurrencyAmount.fromRawAmount(
      route.output,
      JSBI.BigInt(amountOutValue)
    );
    
    return {
      amountOut,
      priceImpact: priceImpactValue
    };
  }

  /**
   * Batch calculate trades for multiple routes and amounts
   */
  calculateTradesBatch(
    routes: Route<Token, Token>[],
    amounts: CurrencyAmount<Token>[]
  ): Array<{ route: Route<Token, Token>, amountIn: CurrencyAmount<Token>, amountOut: CurrencyAmount<Token>, priceImpact: number }> {
    if (!this.initialized) {
      throw new Error('WASMTradeCalculator not initialized');
    }
    
    // Convert routes to pool ID arrays
    const routePoolIds = routes.map(route => 
      route.pools.map(p => p.id)
    );
    
    // Convert amounts to strings
    const amountStrings = amounts.map(a => a.quotient.toString());
    
    // Assume all routes have same input token
    const tokenInId = routes[0]?.input.id || '';
    
    const results = wasmModule.calculate_trades_for_routes(
      routePoolIds,
      amountStrings,
      tokenInId
    );
    
    const trades: Array<{ route: Route<Token, Token>, amountIn: CurrencyAmount<Token>, amountOut: CurrencyAmount<Token>, priceImpact: number }> = [];
    let resultIdx = 0;
    
    for (const route of routes) {
      for (const amount of amounts) {
        const result = results[resultIdx++];
        if (result.success) {
          trades.push({
            route,
            amountIn: amount,
            amountOut: CurrencyAmount.fromRawAmount(
              route.output,
              JSBI.BigInt(result.amountOut)
            ),
            priceImpact: result.priceImpact
          });
        }
      }
    }
    
    return trades;
  }

  /**
   * Clear all pools from memory
   */
  clear(): void {
    if (this.initialized) {
      wasmModule.clear_pools();
      this.poolsMap.clear();
      this.initialized = false;
    }
  }
}

/**
 * Create a WASM-accelerated Trade from a route
 */
export async function createTradeFromRouteWASM(
  route: Route<Token, Token>,
  amount: CurrencyAmount<Token>,
  tradeType: TradeType,
  pools: Pool[]
): Promise<Trade<Token, Token, TradeType>> {
  const calculator = new WASMTradeCalculator();
  await calculator.initializeWithPools(pools);
  
  try {
    if (tradeType === TradeType.EXACT_INPUT) {
      const { amountOut } = calculator.calculateTradeOutput(route, amount);
      
      return Trade.createUncheckedTrade({
        route,
        inputAmount: amount,
        outputAmount: amountOut,
        tradeType: TradeType.EXACT_INPUT,
        percent: 100
      });
    } else {
      // For EXACT_OUTPUT, we'd need to implement reverse calculation
      // For now, fall back to JS implementation
      return Trade.fromRoute(route, amount, tradeType);
    }
  } finally {
    calculator.clear();
  }
}

/**
 * Find best trade with split using WASM acceleration
 */
export async function bestTradeWithSplitWASM(
  routes: Route<Token, Token>[],
  amount: CurrencyAmount<Token>,
  percents: number[],
  tradeType: TradeType,
  pools: Pool[],
  swapConfig = { minSplits: 1, maxSplits: 10 }
): Promise<Trade<Token, Token, TradeType> | null> {
  const calculator = new WASMTradeCalculator();
  await calculator.initializeWithPools(pools);
  
  try {
    // Calculate all split amounts
    const splitAmounts = percents.map(percent => 
      CurrencyAmount.fromRawAmount(
        amount.currency,
        JSBI.divide(JSBI.multiply(amount.quotient, JSBI.BigInt(percent)), JSBI.BigInt(100))
      )
    );
    
    // Batch calculate all trades
    const allTrades = calculator.calculateTradesBatch(routes, splitAmounts);
    
    // Group trades by percent
    const tradesByPercent: { [percent: number]: Trade<Token, Token, TradeType>[] } = {};
    let tradeIdx = 0;
    
    for (let i = 0; i < percents.length; i++) {
      const percent = percents[i];
      tradesByPercent[percent] = [];
      
      for (const route of routes) {
        const tradeDat = allTrades[tradeIdx++];
        if (tradeDat) {
          const trade = Trade.createUncheckedTrade({
            route: tradeDat.route,
            inputAmount: tradeDat.amountIn,
            outputAmount: tradeDat.amountOut,
            tradeType,
            percent
          }) as Trade<Token, Token, TradeType>;
          
          tradesByPercent[percent].push(trade);
        }
      }
    }
    
    // Use existing getBestSwapRoute logic
    const { getBestSwapRoute } = require('./getBestSwapRoute');
    const bestTrades = getBestSwapRoute(tradeType, tradesByPercent, percents, swapConfig);
    
    if (!bestTrades) return null;
    
    const routeData = bestTrades.map(trade => ({
      inputAmount: trade.inputAmount,
      outputAmount: trade.outputAmount,
      route: trade.route,
      percent: trade.swaps[0].percent
    }));
    
    return Trade.createUncheckedTradeWithMultipleRoutes({
      routes: routeData,
      tradeType
    });
  } finally {
    calculator.clear();
  }
}