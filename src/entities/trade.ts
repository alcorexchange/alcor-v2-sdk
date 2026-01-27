import _ from 'lodash'
import invariant from 'tiny-invariant'
import JSBI from 'jsbi'

import { Currency } from './currency'
import { Fraction, Percent, Price, CurrencyAmount } from './fractions'
import { sortedInsert } from '../utils'
import { Token } from './token'
import { ONE, ZERO, TradeType } from '../internalConstants'
import { Route } from './route'
import { getBestSwapRoute } from '../utils/getBestSwapRoute'
import { Pool } from './pool'

/**
 * Trades comparator, an extension of the input output comparator that also considers other dimensions of the trade in ranking them
 * @template TInput The input token, either Ether or an ERC-20
 * @template TOutput The output token, either Ether or an ERC-20
 * @template TTradeType The trade type, either exact input or exact output
 * @param a The first trade to compare
 * @param b The second trade to compare
 * @returns A sorted ordering for two neighboring elements in a trade array
 */
export function tradeComparator<TInput extends Currency, TOutput extends Currency, TTradeType extends TradeType>(
  a: Trade<TInput, TOutput, TTradeType>,
  b: Trade<TInput, TOutput, TTradeType>
) {
  // must have same input and output token for comparison
  invariant(a.inputAmount.currency.equals(b.inputAmount.currency), 'INPUT_CURRENCY')
  invariant(a.outputAmount.currency.equals(b.outputAmount.currency), 'OUTPUT_CURRENCY')
  if (a.outputAmount.equalTo(b.outputAmount)) {
    if (a.inputAmount.equalTo(b.inputAmount)) {
      // consider the number of hops since each hop costs cpu
      const aHops = a.swaps.reduce((total, cur) => total + cur.route.tokenPath.length, 0)
      const bHops = b.swaps.reduce((total, cur) => total + cur.route.tokenPath.length, 0)
      return aHops - bHops
    }
    // trade A requires less input than trade B, so A should come first
    if (a.inputAmount.lessThan(b.inputAmount)) {
      return -1
    } else {
      return 1
    }
  } else {
    // tradeA has less output than trade B, so should come second
    if (a.outputAmount.lessThan(b.outputAmount)) {
      return 1
    } else {
      return -1
    }
  }
}

export interface BestTradeOptions {
  // how many results to return
  maxNumResults?: number
  // the maximum number of hops a trade should contain
  maxHops?: number
}

/**
 * Represents a trade executed against a set of routes where some percentage of the input is
 * split across each route.
 *
 * Each route has its own set of pools. Pools can not be re-used across routes.
 *
 * Does not account for slippage, i.e., changes in price environment that can occur between
 * the time the trade is submitted and when it is executed.
 * @template TInput The input token, either Ether or an ERC-20
 * @template TOutput The output token, either Ether or an ERC-20
 * @template TTradeType The trade type, either exact input or exact output
 */
export class Trade<TInput extends Currency, TOutput extends Currency, TTradeType extends TradeType> {
  /**
   * @deprecated Deprecated in favor of 'swaps' property. If the trade consists of multiple routes
   * this will return an error.
   *
   * When the trade consists of just a single route, this returns the route of the trade,
   * i.e. which pools the trade goes through.
   */
  public get route(): Route<TInput, TOutput> {
    invariant(this.swaps.length == 1, 'MULTIPLE_ROUTES')
    return this.swaps[0].route
  }

  /**
   * The swaps of the trade, i.e. which routes and how much is swapped in each that
   * make up the trade.
   */
  public readonly swaps: {
    percent: number,
    route: Route<TInput, TOutput>
    inputAmount: CurrencyAmount<TInput>
    outputAmount: CurrencyAmount<TOutput>
  }[]

  /**
   * The type of the trade, either exact in or exact out.
   */
  public readonly tradeType: TTradeType

  /**
   * The cached result of the input amount computation
   * @private
   */
  private _inputAmount: CurrencyAmount<TInput> | undefined

  /**
   * The input amount for the trade assuming no slippage.
   */
  public get inputAmount(): CurrencyAmount<TInput> {
    if (this._inputAmount) {
      return this._inputAmount
    }

    const inputCurrency = this.swaps[0].inputAmount.currency
    const totalInputFromRoutes = this.swaps
      .map(({ inputAmount }) => inputAmount)
      .reduce((total, cur) => total.add(cur), CurrencyAmount.fromRawAmount(inputCurrency, 0))

    this._inputAmount = totalInputFromRoutes
    return this._inputAmount
  }

  /**
   * The cached result of the output amount computation
   * @private
   */
  private _outputAmount: CurrencyAmount<TOutput> | undefined

  /**
   * The output amount for the trade assuming no slippage.
   */
  public get outputAmount(): CurrencyAmount<TOutput> {
    if (this._outputAmount) {
      return this._outputAmount
    }

    const outputCurrency = this.swaps[0].outputAmount.currency
    const totalOutputFromRoutes = this.swaps
      .map(({ outputAmount }) => outputAmount)
      .reduce((total, cur) => total.add(cur), CurrencyAmount.fromRawAmount(outputCurrency, 0))

    this._outputAmount = totalOutputFromRoutes
    return this._outputAmount
  }

  /**
   * The cached result of the computed execution price
   * @private
   */
  private _executionPrice: Price<TInput, TOutput> | undefined

  /**
   * The price expressed in terms of output amount/input amount.
   */
  public get executionPrice(): Price<TInput, TOutput> {
    return (
      this._executionPrice ??
      (this._executionPrice = new Price(
        this.inputAmount.currency,
        this.outputAmount.currency,
        this.inputAmount.quotient,
        this.outputAmount.quotient
      ))
    )
  }

  /**
   * The cached result of the price impact computation
   * @private
   */
  private _priceImpact: Percent | undefined

  /**
   * Returns the percent difference between the route's mid price and the price impact
   */
  public get priceImpact(): Percent {
    if (this._priceImpact) {
      return this._priceImpact
    }

    let spotOutputAmount = CurrencyAmount.fromRawAmount(this.outputAmount.currency, 0)
    for (const { route, inputAmount } of this.swaps) {
      const midPrice = route.midPrice
      spotOutputAmount = spotOutputAmount.add(midPrice.quote(inputAmount))
    }

    const priceImpact = spotOutputAmount.subtract(this.outputAmount).divide(spotOutputAmount)
    this._priceImpact = new Percent(priceImpact.numerator, priceImpact.denominator)

    return this._priceImpact
  }

  /**
   * Constructs an exact in trade with the given amount in and route
   * @template TInput The input token, either Ether or an ERC-20
   * @template TOutput The output token, either Ether or an ERC-20
   * @param route The route of the exact in trade
   * @param amountIn The amount being passed in
   * @returns The exact in trade
   */
  public static exactIn<TInput extends Currency, TOutput extends Currency>(
    route: Route<TInput, TOutput>,
    amountIn: CurrencyAmount<TInput>
  ): Trade<TInput, TOutput, TradeType.EXACT_INPUT> {
    return Trade.fromRoute(route, amountIn, TradeType.EXACT_INPUT)
  }

  /**
   * Constructs an exact out trade with the given amount out and route
   * @template TInput The input token, either Ether or an ERC-20
   * @template TOutput The output token, either Ether or an ERC-20
   * @param route The route of the exact out trade
   * @param amountOut The amount returned by the trade
   * @returns The exact out trade
   */
  public static exactOut<TInput extends Currency, TOutput extends Currency>(
    route: Route<TInput, TOutput>,
    amountOut: CurrencyAmount<TOutput>
  ): Trade<TInput, TOutput, TradeType.EXACT_OUTPUT> {
    return Trade.fromRoute(route, amountOut, TradeType.EXACT_OUTPUT)
  }

  /**
   * WASM-accelerated version of fromRoute (for EXACT_INPUT only)
   * @param route route to swap through
   * @param amount the input amount
   * @param pools All pools for calculation
   * @returns Promise of the trade
   */
  public static async fromRouteWASM<TInput extends Currency, TOutput extends Currency>(
    route: Route<TInput, TOutput>,
    amount: CurrencyAmount<TInput>,
    pools: Pool[]
  ): Promise<Trade<TInput, TOutput, TradeType.EXACT_INPUT>> {
    const { createTradeFromRouteWASM } = await import('../utils/tradeCalculatorWASM');
    return createTradeFromRouteWASM(
      route as any,
      amount as any,
      TradeType.EXACT_INPUT,
      pools
    ) as any;
  }

  /**
   * Constructs a trade by simulating swaps through the given route
   * @template TInput The input token, either Ether or an ERC-20.
   * @template TOutput The output token, either Ether or an ERC-20.
   * @template TTradeType The type of the trade, either exact in or exact out.
   * @param route route to swap through
   * @param amount the amount specified, either input or output, depending on tradeType
   * @param tradeType whether the trade is an exact input or exact output swap
   * @returns The route
   */
  public static fromRoute<TInput extends Currency, TOutput extends Currency, TTradeType extends TradeType>(
    route: Route<TInput, TOutput>,
    amount: TTradeType extends TradeType.EXACT_INPUT ? CurrencyAmount<TInput> : CurrencyAmount<TOutput>,
    tradeType: TTradeType,
    percent = 100
  ): Trade<TInput, TOutput, TTradeType> {
    const amounts: CurrencyAmount<Token>[] = new Array(route.tokenPath.length);
    let inputAmount: CurrencyAmount<any>;
    let outputAmount: CurrencyAmount<any>;

    if (tradeType === TradeType.EXACT_INPUT) {
      amounts[0] = amount; // Переиспользуем amount напрямую
      for (let i = 0; i < route.tokenPath.length - 1; i++) {
        amounts[i + 1] = route.pools[i].getOutputAmount(amounts[i]);
      }
      inputAmount = amount; // Без создания нового объекта
      outputAmount = amounts[amounts.length - 1];
    } else {
      amounts[amounts.length - 1] = amount;
      for (let i = route.tokenPath.length - 1; i > 0; i--) {
        amounts[i - 1] = route.pools[i - 1].getInputAmount(amounts[i]);
      }
      inputAmount = amounts[0];
      outputAmount = amount;
    }

    return new Trade({
      routes: [{ inputAmount, outputAmount, route, percent }],
      tradeType
    });
  }

  /**
   * Constructs a trade from routes by simulating swaps
   *
   * @template TInput The input token, either Ether or an ERC-20.
   * @template TOutput The output token, either Ether or an ERC-20.
   * @template TTradeType The type of the trade, either exact in or exact out.
   * @param routes the routes to swap through and how much of the amount should be routed through each
   * @param tradeType whether the trade is an exact input or exact output swap
   * @returns The trade
   */
  public static fromRoutes<TInput extends Currency, TOutput extends Currency, TTradeType extends TradeType>(
    routes: {
      amount: TTradeType extends TradeType.EXACT_INPUT ? CurrencyAmount<TInput> : CurrencyAmount<TOutput>
      route: Route<TInput, TOutput>,
      percent: number
    }[],
    tradeType: TTradeType
  ): Trade<TInput, TOutput, TTradeType> {
    const populatedRoutes: {
      percent: number,
      route: Route<TInput, TOutput>
      inputAmount: CurrencyAmount<TInput>
      outputAmount: CurrencyAmount<TOutput>
    }[] = []

    for (const { route, amount, percent } of routes) {
      const amounts: CurrencyAmount<Token>[] = new Array(route.tokenPath.length)
      let inputAmount: CurrencyAmount<TInput>
      let outputAmount: CurrencyAmount<TOutput>

      if (tradeType === TradeType.EXACT_INPUT) {
        invariant(amount.currency.equals(route.input), 'INPUT')
        inputAmount = CurrencyAmount.fromFractionalAmount(route.input, amount.numerator, amount.denominator)
        amounts[0] = CurrencyAmount.fromFractionalAmount(route.input, amount.numerator, amount.denominator)

        for (let i = 0; i < route.tokenPath.length - 1; i++) {
          const pool = route.pools[i]
          const outputAmount = pool.getOutputAmount(amounts[i])
          amounts[i + 1] = outputAmount
        }

        outputAmount = CurrencyAmount.fromFractionalAmount(
          route.output,
          amounts[amounts.length - 1].numerator,
          amounts[amounts.length - 1].denominator
        )
      } else {
        invariant(amount.currency.equals(route.output), 'OUTPUT')
        outputAmount = CurrencyAmount.fromFractionalAmount(route.output, amount.numerator, amount.denominator)
        amounts[amounts.length - 1] = CurrencyAmount.fromFractionalAmount(
          route.output,
          amount.numerator,
          amount.denominator
        )

        for (let i = route.tokenPath.length - 1; i > 0; i--) {
          const pool = route.pools[i - 1]
          const inputAmount = pool.getInputAmount(amounts[i])
          amounts[i - 1] = inputAmount
        }

        inputAmount = CurrencyAmount.fromFractionalAmount(route.input, amounts[0].numerator, amounts[0].denominator)
      }

      populatedRoutes.push({ route, inputAmount, outputAmount, percent })
    }

    return new Trade({
      routes: populatedRoutes,
      tradeType
    })
  }

  /**
   * Creates a trade without computing the result of swapping through the route. Useful when you have simulated the trade
   * elsewhere and do not have any tick data
   * @template TInput The input token, either Ether or an ERC-20
   * @template TOutput The output token, either Ether or an ERC-20
   * @template TTradeType The type of the trade, either exact in or exact out
   * @param constructorArguments The arguments passed to the trade constructor
   * @returns The unchecked trade
   */
  public static createUncheckedTrade<
    TInput extends Currency,
    TOutput extends Currency,
    TTradeType extends TradeType
  >(constructorArguments: {
    percent: number,
    route: Route<TInput, TOutput>
    inputAmount: CurrencyAmount<TInput>
    outputAmount: CurrencyAmount<TOutput>
    tradeType: TTradeType
  }): Trade<TInput, TOutput, TTradeType> {
    return new Trade({
      ...constructorArguments,
      routes: [
        {
          percent: constructorArguments.percent,
          inputAmount: constructorArguments.inputAmount,
          outputAmount: constructorArguments.outputAmount,
          route: constructorArguments.route
        }
      ]
    })
  }

  /**
   * Creates a trade without computing the result of swapping through the routes. Useful when you have simulated the trade
   * elsewhere and do not have any tick data
   * @template TInput The input token, either Ether or an ERC-20
   * @template TOutput The output token, either Ether or an ERC-20
   * @template TTradeType The type of the trade, either exact in or exact out
   * @param constructorArguments The arguments passed to the trade constructor
   * @returns The unchecked trade
   */
  public static createUncheckedTradeWithMultipleRoutes<
    TInput extends Currency,
    TOutput extends Currency,
    TTradeType extends TradeType
  >(constructorArguments: {
    routes: {
      percent: number
      route: Route<TInput, TOutput>
      inputAmount: CurrencyAmount<TInput>
      outputAmount: CurrencyAmount<TOutput>
    }[]
    tradeType: TTradeType
  }): Trade<TInput, TOutput, TTradeType> {
    return new Trade(constructorArguments)
  }

  /**
   * Construct a trade by passing in the pre-computed property values
   * @param routes The routes through which the trade occurs
   * @param tradeType The type of trade, exact input or exact output
   */
  private constructor({
    routes,
    tradeType
  }: {
    routes: {
      percent: number,
      route: Route<TInput, TOutput>
      inputAmount: CurrencyAmount<TInput>
      outputAmount: CurrencyAmount<TOutput>
    }[]
    tradeType: TTradeType
  }) {
    const inputCurrency = routes[0].inputAmount.currency
    const outputCurrency = routes[0].outputAmount.currency
    invariant(
      routes.every(({ route }) => inputCurrency.equals(route.input)),
      'INPUT_CURRENCY_MATCH'
    )
    invariant(
      routes.every(({ route }) => outputCurrency.equals(route.output)),
      'OUTPUT_CURRENCY_MATCH'
    )

    const numPools = routes.map(({ route }) => route.pools.length).reduce((total, cur) => total + cur, 0)
    const poolAddressSet = new Set<number>()
    for (const { route } of routes) {
      for (const pool of route.pools) {
        poolAddressSet.add(pool.id)
      }
    }

    invariant(numPools == poolAddressSet.size, 'POOLS_DUPLICATED')

    this.swaps = routes
    this.tradeType = tradeType
  }

  /**
   * Get the minimum amount that must be received from this trade for the given slippage tolerance
   * @param slippageTolerance The tolerance of unfavorable slippage from the execution price of this trade
   * @returns The amount out
   */
  public minimumAmountOut(slippageTolerance: Percent, amountOut = this.outputAmount): CurrencyAmount<TOutput> {
    invariant(!slippageTolerance.lessThan(ZERO), 'SLIPPAGE_TOLERANCE')
    if (this.tradeType === TradeType.EXACT_OUTPUT) {
      return amountOut
    } else {
      const slippageAdjustedAmountOut = new Fraction(ONE)
        .add(slippageTolerance)
        .invert()
        .multiply(amountOut.quotient).quotient
      return CurrencyAmount.fromRawAmount(amountOut.currency, slippageAdjustedAmountOut)
    }
  }

  /**
   * Get the maximum amount in that can be spent via this trade for the given slippage tolerance
   * @param slippageTolerance The tolerance of unfavorable slippage from the execution price of this trade
   * @returns The amount in
   */
  public maximumAmountIn(slippageTolerance: Percent, amountIn = this.inputAmount): CurrencyAmount<TInput> {
    invariant(!slippageTolerance.lessThan(ZERO), 'SLIPPAGE_TOLERANCE')
    if (this.tradeType === TradeType.EXACT_INPUT) {
      return amountIn
    } else {
      const slippageAdjustedAmountIn = new Fraction(ONE).add(slippageTolerance).multiply(amountIn.quotient).quotient
      return CurrencyAmount.fromRawAmount(amountIn.currency, slippageAdjustedAmountIn)
    }
  }

  /**
   * Return the execution price after accounting for slippage tolerance
   * @param slippageTolerance the allowed tolerated slippage
   * @returns The execution price
   */
  public worstExecutionPrice(slippageTolerance: Percent): Price<TInput, TOutput> {
    return new Price(
      this.inputAmount.currency,
      this.outputAmount.currency,
      this.maximumAmountIn(slippageTolerance).quotient,
      this.minimumAmountOut(slippageTolerance).quotient
    )
  }

  public static bestTradeExactIn<TInput extends Currency, TOutput extends Currency>(
    routes: Route<TInput, TOutput>[],
    currencyAmountIn: CurrencyAmount<TInput>,
    maxNumResults = 1,
  ): Trade<TInput, TOutput, TradeType.EXACT_INPUT>[] {
    invariant(routes.length > 0, 'ROUTES')

    // Pre-filter: remove routes with zero-liquidity pools
    const validRoutes = routes.filter(route =>
      route.pools.every(pool => pool.active && JSBI.greaterThan(pool.liquidity, ZERO))
    )

    // Helper: compute min liquidity using JSBI (no overflow)
    const getMinLiquidity = (route: Route<TInput, TOutput>): JSBI => {
      let min = route.pools[0].liquidity
      for (let i = 1; i < route.pools.length; i++) {
        if (JSBI.lessThan(route.pools[i].liquidity, min)) {
          min = route.pools[i].liquidity
        }
      }
      return min
    }

    // Precompute min liquidity for sorting
    const routeMinLiq = new Map<Route<TInput, TOutput>, JSBI>()
    for (const route of validRoutes) {
      routeMinLiq.set(route, getMinLiquidity(route))
    }

    // Sort routes: fewer hops first, then by min liquidity desc
    validRoutes.sort((a, b) => {
      if (a.pools.length !== b.pools.length) return a.pools.length - b.pools.length
      const minLiqA = routeMinLiq.get(a)!
      const minLiqB = routeMinLiq.get(b)!
      if (JSBI.greaterThan(minLiqA, minLiqB)) return -1
      if (JSBI.lessThan(minLiqA, minLiqB)) return 1
      return 0
    })

    const bestTrades: Trade<TInput, TOutput, TradeType.EXACT_INPUT>[] = []

    for (const route of validRoutes) {
      let trade
      try {
        trade = Trade.fromRoute(route, currencyAmountIn, TradeType.EXACT_INPUT)
      } catch (error) {
        // not enough liquidity in this pair
        if ((error as any).isInsufficientInputAmountError) {
          continue
        }
        throw error
      }

      // Only check outputAmount > 0, skip expensive priceImpact calculation
      if (!trade.outputAmount.greaterThan(0)) continue

      sortedInsert(
        bestTrades,
        trade,
        maxNumResults,
        tradeComparator
      )
    }

    return bestTrades
  }

  public static bestTradeExactOut<TInput extends Currency, TOutput extends Currency>(
    routes: Route<TInput, TOutput>[],
    currencyAmountOut: CurrencyAmount<TOutput>,
    maxNumResults = 1,
  ): Trade<TInput, TOutput, TradeType.EXACT_OUTPUT>[] {
    invariant(routes.length > 0, 'ROUTES')

    const bestTrades: Trade<TInput, TOutput, TradeType.EXACT_OUTPUT>[] = []
    for (const route of routes) {
      let trade 
      try {
        trade = Trade.fromRoute(route, currencyAmountOut, TradeType.EXACT_OUTPUT)
      } catch (error) {
        // not enough liquidity in this pair
        if ((error as any).isInsufficientReservesError) {
          continue
        }
        throw error
      }

      if (!trade.inputAmount.greaterThan(0) || !trade.priceImpact.greaterThan(0)) continue

      sortedInsert(
        bestTrades,
        trade,
        maxNumResults,
        tradeComparator
      )
    }

    return bestTrades
  }

  /**
   * WASM-accelerated version of bestTradeWithSplit
   * @param _routes Routes to consider
   * @param amount Amount to swap
   * @param percents Percentages to split
   * @param tradeType Type of trade
   * @param pools All pools for trade calculation
   * @param swapConfig Configuration for splits
   * @returns Best trade or null
   */
  public static async bestTradeWithSplitWASM<TInput extends Currency, TOutput extends Currency>(
    _routes: Route<TInput, TOutput>[],
    amount: CurrencyAmount<Currency>,
    percents: number[],
    tradeType: TradeType,
    pools: Pool[],
    swapConfig = { minSplits: 1, maxSplits: 10 }
  ): Promise<Trade<Currency, Currency, TradeType> | null> {
    const { bestTradeWithSplitWASM } = await import('../utils/tradeCalculatorWASM');
    return bestTradeWithSplitWASM(
      _routes as any,
      amount as any,
      percents,
      tradeType,
      pools,
      swapConfig
    );
  }

  public static bestTradeWithSplit<TInput extends Currency, TOutput extends Currency>(
    _routes: Route<TInput, TOutput>[],
    amount: CurrencyAmount<Currency>,
    percents: number[],
    tradeType: TradeType,
    swapConfig = { minSplits: 1, maxSplits: 10 }
  ): Trade<Currency, Currency, TradeType> | null {
    invariant(_routes.length > 0, 'ROUTES')
    invariant(percents.length > 0, 'PERCENTS')

    // Pre-filter: remove routes with zero-liquidity or inactive pools
    const validRoutes = _routes.filter(route =>
      route.pools.every(pool => pool.active && JSBI.greaterThan(pool.liquidity, ZERO))
    )

    // Helper: compute min liquidity for a route using JSBI (no overflow)
    const getMinLiquidity = (route: Route<TInput, TOutput>): JSBI => {
      let min = route.pools[0].liquidity
      for (let i = 1; i < route.pools.length; i++) {
        if (JSBI.lessThan(route.pools[i].liquidity, min)) {
          min = route.pools[i].liquidity
        }
      }
      return min
    }

    // Precompute min liquidity for sorting (avoid recalculating)
    const routeMinLiq = new Map<Route<TInput, TOutput>, JSBI>()
    for (const route of validRoutes) {
      routeMinLiq.set(route, getMinLiquidity(route))
    }

    // Sort routes by min liquidity (descending) - no hop preference
    validRoutes.sort((a, b) => {
      const minLiqA = routeMinLiq.get(a)!
      const minLiqB = routeMinLiq.get(b)!
      if (JSBI.greaterThan(minLiqA, minLiqB)) return -1
      if (JSBI.lessThan(minLiqA, minLiqB)) return 1
      return 0
    })

    // Предварительно вычисляем splitAmount для всех процентов
    const percentToAmount = new Map<number, CurrencyAmount<Currency>>();
    for (const percent of percents) {
      percentToAmount.set(percent, amount.multiply(percent).divide(100));
    }

    // Используем Map вместо объекта для лучшей производительности
    const percentToTrades = new Map<number, Trade<Currency, Currency, TradeType>[]>();
    for (const percent of percents) {
      percentToTrades.set(percent, []);
    }

    // Оптимизируем внутренний цикл - группируем вычисления по маршрутам
    for (const route of validRoutes) {
      for (const percent of percents) {
        const splitAmount = percentToAmount.get(percent)!;

        try {
          const trade = Trade.fromRoute(route, splitAmount, tradeType, percent);

          // Only check outputAmount > 0, skip expensive priceImpact calculation
          if (trade.outputAmount.greaterThan(0)) {
            percentToTrades.get(percent)!.push(trade);
          }
        } catch (error) {
          if ((error as any).isInsufficientReservesError || (error as any).isInsufficientInputAmountError) {
            continue;
          }
          throw error;
        }
      }
    }
    
    // Преобразуем Map обратно в объект для совместимости с getBestSwapRoute
    const percentToTradesObj: { [percent: number]: Trade<Currency, Currency, TradeType>[] } = {};
    percentToTrades.forEach((trades, percent) => {
      percentToTradesObj[percent] = trades;
    });
    
    const bestTrades = getBestSwapRoute(tradeType, percentToTradesObj, percents, swapConfig);
    if (!bestTrades) return null

    const routes = bestTrades.map(({ inputAmount, outputAmount, route, swaps }) => {
      return { inputAmount, outputAmount, route, percent: swaps[0].percent }
    })

    // Check missing input after splitting
    // TODO Do we need it for exact out?
    if (tradeType === TradeType.EXACT_INPUT) {
      const totalAmount = _.reduce(routes, (total, route) =>
        total.add(route.inputAmount),
        CurrencyAmount.fromRawAmount(routes[0].route.input, 0)
      )

      const missingAmount = amount.subtract(totalAmount)

      if (missingAmount.greaterThan(0)) {
        console.log("MISSING AMOUNT!!!", missingAmount.toFixed())
        routes[0].inputAmount = routes[0].inputAmount.add(missingAmount)
      }
    }

    return new Trade({ routes, tradeType })
  }
}
