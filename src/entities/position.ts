import { CurrencyAmount, Price, Percent } from "./fractions";
import { Token } from "./token";
import { BigintIsh, MaxUint64, Q64 } from "../internalConstants";
import JSBI from "jsbi";
import invariant from "tiny-invariant";
import { ZERO } from "../internalConstants";
import { maxLiquidityForAmounts } from "../utils/maxLiquidityForAmounts";
import { tickToPrice } from "../utils/priceTickConversions";
import { SqrtPriceMath } from "../utils/sqrtPriceMath";
import { TickMath } from "../utils/tickMath";
import { encodeSqrtRatioX64 } from "../utils/encodeSqrtRatioX64";
import { Pool } from "./pool";
import { TickLibrary, subIn128 } from "../utils";

interface PositionConstructorArgs {
  id: number,
  pool: Pool;
  lower: number;
  upper: number;
  liquidity: BigintIsh;
  feeGrowthInsideALastX64: BigintIsh,
  feeGrowthInsideBLastX64: BigintIsh
}

interface Fees {
  feesA: CurrencyAmount<Token>,
  feesB: CurrencyAmount<Token>
}

export class Position {
  public readonly id: number;
  public readonly pool: Pool;
  public readonly lower: number;
  public readonly upper: number;
  public readonly liquidity: JSBI;
  public readonly feeGrowthInsideALastX64: JSBI;
  public readonly feeGrowthInsideBLastX64: JSBI;

  // cached resuts for the getters
  private _tokenAAmount: CurrencyAmount<Token> | null = null;
  private _tokenBAmount: CurrencyAmount<Token> | null = null;
  private _mintAmounts: Readonly<{ amountA: JSBI; amountB: JSBI }> | null =
    null;

  /**
   * Constructs a position for a given pool with the given liquidity
   * @param pool For which pool the liquidity is assigned
   * @param liquidity The amount of liquidity that is in the position
   * @param lower The lower tick of the position
   * @param upper The upper tick of the position
   */
  public constructor({
    id,
    pool,
    liquidity,
    lower,
    upper,
    feeGrowthInsideALastX64,
    feeGrowthInsideBLastX64,
  }: PositionConstructorArgs) {
    invariant(lower < upper, "TICK_ORDER");
    invariant(
      lower >= TickMath.MIN_TICK && lower % pool.tickSpacing === 0,
      "TICK_LOWER"
    );
    invariant(
      upper <= TickMath.MAX_TICK && upper % pool.tickSpacing === 0,
      "TICK_UPPER"
    );

    this.id = id;
    this.pool = pool;
    this.lower = lower;
    this.upper = upper;
    this.liquidity = JSBI.BigInt(liquidity);
    this.feeGrowthInsideALastX64 = JSBI.BigInt(feeGrowthInsideALastX64);
    this.feeGrowthInsideBLastX64 = JSBI.BigInt(feeGrowthInsideBLastX64);
  }

  public get inRange(): boolean {
    return (
      this.lower < this.pool.tickCurrent &&
      this.pool.tickCurrent < this.upper
    );
  }

  /**
   * Returns the price of tokenA at the lower tick
   */
  public get tokenAPriceLower(): Price<Token, Token> {
    return tickToPrice(this.pool.tokenA, this.pool.tokenB, this.lower);
  }

  /**
   * Returns the price of tokenA at the upper tick
   */
  public get tokenAPriceUpper(): Price<Token, Token> {
    return tickToPrice(this.pool.tokenA, this.pool.tokenB, this.upper);
  }

  /**
   * Returns the amount of tokenA that this position's liquidity could be burned for at the current pool price
   */
  public get amountA(): CurrencyAmount<Token> {
    if (this._tokenAAmount === null) {
      if (this.pool.tickCurrent < this.lower) {
        this._tokenAAmount = CurrencyAmount.fromRawAmount(
          this.pool.tokenA,
          SqrtPriceMath.getAmountADelta(
            TickMath.getSqrtRatioAtTick(this.lower),
            TickMath.getSqrtRatioAtTick(this.upper),
            this.liquidity,
            false
          )
        );
      } else if (this.pool.tickCurrent < this.upper) {
        this._tokenAAmount = CurrencyAmount.fromRawAmount(
          this.pool.tokenA,
          SqrtPriceMath.getAmountADelta(
            this.pool.sqrtPriceX64,
            TickMath.getSqrtRatioAtTick(this.upper),
            this.liquidity,
            false
          )
        );
      } else {
        this._tokenAAmount = CurrencyAmount.fromRawAmount(
          this.pool.tokenA,
          ZERO
        );
      }
    }
    return this._tokenAAmount;
  }

  /**
   * Returns the amount of tokenB that this position's liquidity could be burned for at the current pool price
   */
  public get amountB(): CurrencyAmount<Token> {
    if (this._tokenBAmount === null) {
      if (this.pool.tickCurrent < this.lower) {
        this._tokenBAmount = CurrencyAmount.fromRawAmount(
          this.pool.tokenB,
          ZERO
        );
      } else if (this.pool.tickCurrent < this.upper) {
        this._tokenBAmount = CurrencyAmount.fromRawAmount(
          this.pool.tokenB,
          SqrtPriceMath.getAmountBDelta(
            TickMath.getSqrtRatioAtTick(this.lower),
            this.pool.sqrtPriceX64,
            this.liquidity,
            false
          )
        );
      } else {
        this._tokenBAmount = CurrencyAmount.fromRawAmount(
          this.pool.tokenB,
          SqrtPriceMath.getAmountBDelta(
            TickMath.getSqrtRatioAtTick(this.lower),
            TickMath.getSqrtRatioAtTick(this.upper),
            this.liquidity,
            false
          )
        );
      }
    }
    return this._tokenBAmount;
  }

  /**
   * Returns the lower and upper sqrt ratios if the price 'slips' up to slippage tolerance percentage
   * @param slippageTolerance The amount by which the price can 'slip' before the transaction will revert
   * @returns The sqrt ratios after slippage
   */
  private ratiosAfterSlippage(slippageTolerance: Percent): {
    sqrtPriceX64Lower: JSBI;
    sqrtPriceX64Upper: JSBI;
  } {
    const priceLower = this.pool.tokenAPrice.asFraction.multiply(
      new Percent(1).subtract(slippageTolerance)
    );
    const priceUpper = this.pool.tokenAPrice.asFraction.multiply(
      slippageTolerance.add(1)
    );
    let sqrtPriceX64Lower = encodeSqrtRatioX64(
      priceLower.numerator,
      priceLower.denominator
    );
    if (JSBI.lessThanOrEqual(sqrtPriceX64Lower, TickMath.MIN_SQRT_RATIO)) {
      sqrtPriceX64Lower = JSBI.add(TickMath.MIN_SQRT_RATIO, JSBI.BigInt(1));
    }
    let sqrtPriceX64Upper = encodeSqrtRatioX64(
      priceUpper.numerator,
      priceUpper.denominator
    );
    if (JSBI.greaterThanOrEqual(sqrtPriceX64Upper, TickMath.MAX_SQRT_RATIO)) {
      sqrtPriceX64Upper = JSBI.subtract(
        TickMath.MAX_SQRT_RATIO,
        JSBI.BigInt(1)
      );
    }
    return {
      sqrtPriceX64Lower,
      sqrtPriceX64Upper,
    };
  }

  /**
   * Returns the minimum amounts that must be sent in order to safely mint the amount of liquidity held by the position
   * with the given slippage tolerance
   * @param slippageTolerance Tolerance of unfavorable slippage from the current price
   * @returns The amounts, with slippage
   */
  public mintAmountsWithSlippage(
    slippageTolerance: Percent
  ): Readonly<{ amountA: JSBI; amountB: JSBI }> {
    // get lower/upper prices
    const { sqrtPriceX64Upper, sqrtPriceX64Lower } =
      this.ratiosAfterSlippage(slippageTolerance);

    // construct counterfactual pools
    const poolLower = new Pool({
      id: this.pool.id,
      tokenA: this.pool.tokenA,
      tokenB: this.pool.tokenB,
      fee: this.pool.fee,
      sqrtPriceX64: sqrtPriceX64Lower,
      liquidity: 0 /* liquidity doesn't matter */,
      tickCurrent: TickMath.getTickAtSqrtRatio(sqrtPriceX64Lower),
      feeGrowthGlobalAX64: this.feeGrowthInsideALastX64,
      feeGrowthGlobalBX64: this.feeGrowthInsideBLastX64,
      ticks: this.pool.tickDataProvider
    });
    const poolUpper = new Pool({
      id: this.pool.id,
      tokenA: this.pool.tokenA,
      tokenB: this.pool.tokenB,
      fee: this.pool.fee,
      sqrtPriceX64: sqrtPriceX64Upper,
      liquidity: 0 /* liquidity doesn't matter */,
      tickCurrent: TickMath.getTickAtSqrtRatio(sqrtPriceX64Upper),
      feeGrowthGlobalAX64: this.feeGrowthInsideALastX64,
      feeGrowthGlobalBX64: this.feeGrowthInsideBLastX64,
      ticks: this.pool.tickDataProvider
    });

    // because the router is imprecise, we need to calculate the position that will be created (assuming no slippage)
    const positionThatWillBeCreated = Position.fromAmounts({
      id: this.id,
      pool: this.pool,
      lower: this.lower,
      upper: this.upper,
      ...this.mintAmounts, // the mint amounts are what will be passed as calldata
      useFullPrecision: false,
      feeGrowthInsideALastX64: this.feeGrowthInsideALastX64,
      feeGrowthInsideBLastX64: this.feeGrowthInsideBLastX64,
    });

    // we want the smaller amounts...
    // ...which occurs at the upper price for amountA...
    const { amountA } = new Position({
      id: this.id,
      pool: poolUpper,
      liquidity: positionThatWillBeCreated.liquidity,
      lower: this.lower,
      upper: this.upper,
      feeGrowthInsideALastX64: this.feeGrowthInsideALastX64,
      feeGrowthInsideBLastX64: this.feeGrowthInsideBLastX64,
    }).mintAmounts;
    // ...and the lower for amountB
    const { amountB } = new Position({
      id: this.id,
      pool: poolLower,
      liquidity: positionThatWillBeCreated.liquidity,
      lower: this.lower,
      upper: this.upper,
      feeGrowthInsideALastX64: this.feeGrowthInsideALastX64,
      feeGrowthInsideBLastX64: this.feeGrowthInsideBLastX64,
    }).mintAmounts;

    return { amountA, amountB };
  }

  /**
   * Returns the minimum amounts that should be requested in order to safely burn the amount of liquidity held by the
   * position with the given slippage tolerance
   * @param slippageTolerance tolerance of unfavorable slippage from the current price
   * @returns The amounts, with slippage
   */
  public burnAmountsWithSlippage(
    slippageTolerance: Percent
  ): Readonly<{ amountA: JSBI; amountB: JSBI }> {
    // get lower/upper prices
    const { sqrtPriceX64Upper, sqrtPriceX64Lower } =
      this.ratiosAfterSlippage(slippageTolerance);

    // construct counterfactual pools
    const poolLower = new Pool({
      id: this.pool.id,
      tokenA: this.pool.tokenA,
      tokenB: this.pool.tokenB,
      fee: this.pool.fee,
      sqrtPriceX64: sqrtPriceX64Lower,
      liquidity: 0 /* liquidity doesn't matter */,
      tickCurrent: TickMath.getTickAtSqrtRatio(sqrtPriceX64Lower),
      feeGrowthGlobalAX64: this.feeGrowthInsideALastX64,
      feeGrowthGlobalBX64: this.feeGrowthInsideBLastX64,
      ticks: this.pool.tickDataProvider
    });
    const poolUpper = new Pool({
      id: this.pool.id,
      tokenA: this.pool.tokenA,
      tokenB: this.pool.tokenB,
      fee: this.pool.fee,
      sqrtPriceX64: sqrtPriceX64Upper,
      liquidity: 0 /* liquidity doesn't matter */,
      tickCurrent: TickMath.getTickAtSqrtRatio(sqrtPriceX64Upper),
      feeGrowthGlobalAX64: this.feeGrowthInsideALastX64,
      feeGrowthGlobalBX64: this.feeGrowthInsideBLastX64,
      ticks: this.pool.tickDataProvider
    });

    // we want the smaller amounts...
    // ...which occurs at the upper price for amountA...
    const amountA = new Position({
      id: this.id,
      pool: poolUpper,
      liquidity: this.liquidity,
      lower: this.lower,
      upper: this.upper,
      feeGrowthInsideALastX64: this.feeGrowthInsideALastX64,
      feeGrowthInsideBLastX64: this.feeGrowthInsideBLastX64,
    }).amountA;
    // ...and the lower for amountB
    const amountB = new Position({
      id: this.id,
      pool: poolLower,
      liquidity: this.liquidity,
      lower: this.lower,
      upper: this.upper,
      feeGrowthInsideALastX64: this.feeGrowthInsideALastX64,
      feeGrowthInsideBLastX64: this.feeGrowthInsideBLastX64,
    }).amountB;

    return { amountA: amountA.quotient, amountB: amountB.quotient };
  }

  /**
   * Returns the minimum amounts that must be sent in order to mint the amount of liquidity held by the position at
   * the current price for the pool
   */
  public get mintAmounts(): Readonly<{ amountA: JSBI; amountB: JSBI }> {
    if (this._mintAmounts === null) {
      if (this.pool.tickCurrent < this.lower) {
        return {
          amountA: SqrtPriceMath.getAmountADelta(
            TickMath.getSqrtRatioAtTick(this.lower),
            TickMath.getSqrtRatioAtTick(this.upper),
            this.liquidity,
            true
          ),
          amountB: ZERO,
        };
      } else if (this.pool.tickCurrent < this.upper) {
        return {
          amountA: SqrtPriceMath.getAmountADelta(
            this.pool.sqrtPriceX64,
            TickMath.getSqrtRatioAtTick(this.upper),
            this.liquidity,
            true
          ),
          amountB: SqrtPriceMath.getAmountBDelta(
            TickMath.getSqrtRatioAtTick(this.lower),
            this.pool.sqrtPriceX64,
            this.liquidity,
            true
          ),
        };
      } else {
        return {
          amountA: ZERO,
          amountB: SqrtPriceMath.getAmountBDelta(
            TickMath.getSqrtRatioAtTick(this.lower),
            TickMath.getSqrtRatioAtTick(this.upper),
            this.liquidity,
            true
          ),
        };
      }
    }
    return this._mintAmounts;
  }

  /**
   * Computes the maximum amount of liquidity received for a given amount of tokenA, tokenB,
   * and the prices at the tick boundaries.
   * @param pool The pool for which the position should be created
   * @param lower The lower tick of the position
   * @param upper The upper tick of the position
   * @param amountA tokenA amount
   * @param amountB tokenB amount
   * @param useFullPrecision If false, liquidity will be maximized according to what the router can calculate,
   * not what core can theoretically support
   * @returns The amount of liquidity for the position
   */
  public static fromAmounts({
    id,
    pool,
    lower,
    upper,
    amountA,
    amountB,
    useFullPrecision,
    feeGrowthInsideALastX64,
    feeGrowthInsideBLastX64,
  }: {
    id: number,
    pool: Pool;
    lower: number;
    upper: number;
    amountA: BigintIsh;
    amountB: BigintIsh;
    useFullPrecision: boolean;
    feeGrowthInsideALastX64: | BigintIsh,
    feeGrowthInsideBLastX64: | BigintIsh
  }) {
    const sqrtRatioLX64 = TickMath.getSqrtRatioAtTick(lower);
    const sqrtRatioUX64 = TickMath.getSqrtRatioAtTick(upper);
    return new Position({
      id,
      pool,
      lower,
      upper,
      liquidity: maxLiquidityForAmounts(
        pool.sqrtPriceX64,
        sqrtRatioLX64,
        sqrtRatioUX64,
        amountA,
        amountB,
        useFullPrecision
      ),
      feeGrowthInsideALastX64,
      feeGrowthInsideBLastX64
    });
  }

  /**
   * Computes a position with the maximum amount of liquidity received for a given amount of tokenA, assuming an unlimited amount of tokenB
   * @param pool The pool for which the position is created
   * @param lower The lower tick
   * @param upper The upper tick
   * @param amountA The desired amount of tokenA
   * @param useFullPrecision If true, liquidity will be maximized according to what the router can calculate,
   * not what core can theoretically support
   * @returns The position
   */
  public static fromAmountA({
    id,
    pool,
    lower,
    upper,
    amountA,
    useFullPrecision,
    feeGrowthInsideALastX64,
    feeGrowthInsideBLastX64
  }: {
    id: number,
    pool: Pool;
    lower: number;
    upper: number;
    amountA: BigintIsh;
    useFullPrecision: boolean;
    feeGrowthInsideALastX64: | BigintIsh;
    feeGrowthInsideBLastX64: | BigintIsh;
  }) {
    return Position.fromAmounts({
      id,
      pool,
      lower,
      upper,
      amountA,
      amountB: MaxUint64,
      useFullPrecision,
      feeGrowthInsideALastX64,
      feeGrowthInsideBLastX64
    });
  }

  /**
   * Computes a position with the maximum amount of liquidity received for a given amount of tokenB, assuming an unlimited amount of tokenA
   * @param pool The pool for which the position is created
   * @param lower The lower tick
   * @param upper The upper tick
   * @param amountB The desired amount of tokenB
   * @returns The position
   */
  public static fromAmountB({
    id,
    pool,
    lower,
    upper,
    amountB,
    feeGrowthInsideALastX64,
    feeGrowthInsideBLastX64,
  }: {
    id: number,
    pool: Pool;
    lower: number;
    upper: number;
    amountB: BigintIsh;
    feeGrowthInsideALastX64: | BigintIsh;
    feeGrowthInsideBLastX64: | BigintIsh;
  }) {
    // this function always uses full precision,
    return Position.fromAmounts({
      id,
      pool,
      lower,
      upper,
      amountA: MaxUint64,
      amountB,
      useFullPrecision: true,
      feeGrowthInsideALastX64,
      feeGrowthInsideBLastX64,
    });
  }

  /**
   * Computes a position fees
   * @returns The position
   */
  public async getFees(): Promise<Fees> {
    const { liquidity, lower, upper, feeGrowthInsideALastX64, feeGrowthInsideBLastX64, pool } = this
    
    const tickLower = await this.pool.tickDataProvider.getTick(lower)
    const tickUpper = await this.pool.tickDataProvider.getTick(upper)

    const { feeGrowthGlobalAX64, feeGrowthGlobalBX64 } = pool

    const [feeGrowthInsideAX64, feeGrowthInsideBX64] = TickLibrary.getFeeGrowthInside(
      tickLower,
      tickUpper,

      lower,
      upper,
      pool.tickCurrent,
      feeGrowthGlobalAX64,
      feeGrowthGlobalBX64
    )

    const tokensOwedA = JSBI.divide(
      JSBI.multiply(
        subIn128(feeGrowthInsideAX64, feeGrowthInsideALastX64),
        liquidity
      ),
      Q64
    );

    const tokensOwedB = JSBI.divide(
      JSBI.multiply(
        subIn128(feeGrowthInsideBX64, feeGrowthInsideBLastX64),
        liquidity
      ),
      Q64
    );

    return {
      feesA: CurrencyAmount.fromRawAmount(this.pool.tokenA, tokensOwedA),
      feesB: CurrencyAmount.fromRawAmount(this.pool.tokenB, tokensOwedB),
    }
  }
}
