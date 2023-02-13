import { CurrencyAmount, Price, Percent } from "./fractions";
import { Token } from "./token";
import { BigintIsh, MaxUint256 } from "../internalConstants";
import JSBI from "jsbi";
import invariant from "tiny-invariant";
import { ZERO } from "../internalConstants";
import { maxLiquidityForAmounts } from "../utils/maxLiquidityForAmounts";
import { tickToPrice } from "../utils/priceTickConversions";
import { SqrtPriceMath } from "../utils/sqrtPriceMath";
import { TickMath } from "../utils/tickMath";
import { encodeSqrtRatioX64 } from "../utils/encodeSqrtRatioX64";
import { Pool } from "./pool";

interface PositionConstructorArgs {
  pool: Pool;
  tickLower: number;
  tickUpper: number;
  liquidity: BigintIsh;
}

/**
 * Represents a position on a Uniswap V3 Pool
 */
export class Position {
  public readonly pool: Pool;
  public readonly tickLower: number;
  public readonly tickUpper: number;
  public readonly liquidity: JSBI;

  // cached resuts for the getters
  private _tokenAAmount: CurrencyAmount<Token> | null = null;
  private _tokenBAmount: CurrencyAmount<Token> | null = null;
  private _mintAmounts: Readonly<{ amountA: JSBI; amountB: JSBI }> | null =
    null;

  /**
   * Constructs a position for a given pool with the given liquidity
   * @param pool For which pool the liquidity is assigned
   * @param liquidity The amount of liquidity that is in the position
   * @param tickLower The lower tick of the position
   * @param tickUpper The upper tick of the position
   */
  public constructor({
    pool,
    liquidity,
    tickLower,
    tickUpper,
  }: PositionConstructorArgs) {
    invariant(tickLower < tickUpper, "TICK_ORDER");
    invariant(
      tickLower >= TickMath.MIN_TICK && tickLower % pool.tickSpacing === 0,
      "TICK_LOWER"
    );
    invariant(
      tickUpper <= TickMath.MAX_TICK && tickUpper % pool.tickSpacing === 0,
      "TICK_UPPER"
    );

    this.pool = pool;
    this.tickLower = tickLower;
    this.tickUpper = tickUpper;
    this.liquidity = JSBI.BigInt(liquidity);
  }


  // TODO Should be gte?
  public get inRange(): boolean {
    return this.tickLower < this.pool.tickCurrent && this.pool.tickCurrent < this.tickUpper;
  }

  /**
   * Returns the price of tokenA at the lower tick
   */
  public get tokenAPriceLower(): Price<Token, Token> {
    return tickToPrice(this.pool.tokenA, this.pool.tokenB, this.tickLower);
  }

  /**
   * Returns the price of tokenA at the upper tick
   */
  public get tokenAPriceUpper(): Price<Token, Token> {
    return tickToPrice(this.pool.tokenA, this.pool.tokenB, this.tickUpper);
  }

  /**
   * Returns the amount of tokenA that this position's liquidity could be burned for at the current pool price
   */
  public get amountA(): CurrencyAmount<Token> {
    if (this._tokenAAmount === null) {
      if (this.pool.tickCurrent < this.tickLower) {
        this._tokenAAmount = CurrencyAmount.fromRawAmount(
          this.pool.tokenA,
          SqrtPriceMath.getAmountADelta(
            TickMath.getSqrtRatioAtTick(this.tickLower),
            TickMath.getSqrtRatioAtTick(this.tickUpper),
            this.liquidity,
            false
          )
        );
      } else if (this.pool.tickCurrent < this.tickUpper) {
        this._tokenAAmount = CurrencyAmount.fromRawAmount(
          this.pool.tokenA,
          SqrtPriceMath.getAmountADelta(
            this.pool.sqrtRatioX64,
            TickMath.getSqrtRatioAtTick(this.tickUpper),
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
      if (this.pool.tickCurrent < this.tickLower) {
        this._tokenBAmount = CurrencyAmount.fromRawAmount(
          this.pool.tokenB,
          ZERO
        );
      } else if (this.pool.tickCurrent < this.tickUpper) {
        this._tokenBAmount = CurrencyAmount.fromRawAmount(
          this.pool.tokenB,
          SqrtPriceMath.getAmountBDelta(
            TickMath.getSqrtRatioAtTick(this.tickLower),
            this.pool.sqrtRatioX64,
            this.liquidity,
            false
          )
        );
      } else {
        this._tokenBAmount = CurrencyAmount.fromRawAmount(
          this.pool.tokenB,
          SqrtPriceMath.getAmountBDelta(
            TickMath.getSqrtRatioAtTick(this.tickLower),
            TickMath.getSqrtRatioAtTick(this.tickUpper),
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
    sqrtRatioX64Lower: JSBI;
    sqrtRatioX64Upper: JSBI;
  } {
    const priceLower = this.pool.tokenAPrice.asFraction.multiply(
      new Percent(1).subtract(slippageTolerance)
    );
    const priceUpper = this.pool.tokenAPrice.asFraction.multiply(
      slippageTolerance.add(1)
    );
    let sqrtRatioX64Lower = encodeSqrtRatioX64(
      priceLower.numerator,
      priceLower.denominator
    );
    if (JSBI.lessThanOrEqual(sqrtRatioX64Lower, TickMath.MIN_SQRT_RATIO)) {
      sqrtRatioX64Lower = JSBI.add(TickMath.MIN_SQRT_RATIO, JSBI.BigInt(1));
    }
    let sqrtRatioX64Upper = encodeSqrtRatioX64(
      priceUpper.numerator,
      priceUpper.denominator
    );
    if (JSBI.greaterThanOrEqual(sqrtRatioX64Upper, TickMath.MAX_SQRT_RATIO)) {
      sqrtRatioX64Upper = JSBI.subtract(
        TickMath.MAX_SQRT_RATIO,
        JSBI.BigInt(1)
      );
    }
    return {
      sqrtRatioX64Lower,
      sqrtRatioX64Upper,
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
    const { sqrtRatioX64Upper, sqrtRatioX64Lower } =
      this.ratiosAfterSlippage(slippageTolerance);

    // construct counterfactual pools
    const poolLower = new Pool(
      this.pool.tokenA,
      this.pool.tokenB,
      this.pool.fee,
      sqrtRatioX64Lower,
      0 /* liquidity doesn't matter */,
      TickMath.getTickAtSqrtRatio(sqrtRatioX64Lower)
    );
    const poolUpper = new Pool(
      this.pool.tokenA,
      this.pool.tokenB,
      this.pool.fee,
      sqrtRatioX64Upper,
      0 /* liquidity doesn't matter */,
      TickMath.getTickAtSqrtRatio(sqrtRatioX64Upper)
    );

    // because the router is imprecise, we need to calculate the position that will be created (assuming no slippage)
    const positionThatWillBeCreated = Position.fromAmounts({
      pool: this.pool,
      tickLower: this.tickLower,
      tickUpper: this.tickUpper,
      ...this.mintAmounts, // the mint amounts are what will be passed as calldata
      useFullPrecision: false,
    });

    // we want the smaller amounts...
    // ...which occurs at the upper price for amountA...
    const { amountA } = new Position({
      pool: poolUpper,
      liquidity: positionThatWillBeCreated.liquidity,
      tickLower: this.tickLower,
      tickUpper: this.tickUpper,
    }).mintAmounts;
    // ...and the lower for amountB
    const { amountB } = new Position({
      pool: poolLower,
      liquidity: positionThatWillBeCreated.liquidity,
      tickLower: this.tickLower,
      tickUpper: this.tickUpper,
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
    const { sqrtRatioX64Upper, sqrtRatioX64Lower } =
      this.ratiosAfterSlippage(slippageTolerance);

    // construct counterfactual pools
    const poolLower = new Pool(
      this.pool.tokenA,
      this.pool.tokenB,
      this.pool.fee,
      sqrtRatioX64Lower,
      0 /* liquidity doesn't matter */,
      TickMath.getTickAtSqrtRatio(sqrtRatioX64Lower)
    );
    const poolUpper = new Pool(
      this.pool.tokenA,
      this.pool.tokenB,
      this.pool.fee,
      sqrtRatioX64Upper,
      0 /* liquidity doesn't matter */,
      TickMath.getTickAtSqrtRatio(sqrtRatioX64Upper)
    );

    // we want the smaller amounts...
    // ...which occurs at the upper price for amountA...
    const amountA = new Position({
      pool: poolUpper,
      liquidity: this.liquidity,
      tickLower: this.tickLower,
      tickUpper: this.tickUpper,
    }).amountA;
    // ...and the lower for amountB
    const amountB = new Position({
      pool: poolLower,
      liquidity: this.liquidity,
      tickLower: this.tickLower,
      tickUpper: this.tickUpper,
    }).amountB;

    return { amountA: amountA.quotient, amountB: amountB.quotient };
  }

  /**
   * Returns the minimum amounts that must be sent in order to mint the amount of liquidity held by the position at
   * the current price for the pool
   */
  public get mintAmounts(): Readonly<{ amountA: JSBI; amountB: JSBI }> {
    if (this._mintAmounts === null) {
      if (this.pool.tickCurrent < this.tickLower) {
        return {
          amountA: SqrtPriceMath.getAmountADelta(
            TickMath.getSqrtRatioAtTick(this.tickLower),
            TickMath.getSqrtRatioAtTick(this.tickUpper),
            this.liquidity,
            true
          ),
          amountB: ZERO,
        };
      } else if (this.pool.tickCurrent < this.tickUpper) {
        return {
          amountA: SqrtPriceMath.getAmountADelta(
            this.pool.sqrtRatioX64,
            TickMath.getSqrtRatioAtTick(this.tickUpper),
            this.liquidity,
            true
          ),
          amountB: SqrtPriceMath.getAmountBDelta(
            TickMath.getSqrtRatioAtTick(this.tickLower),
            this.pool.sqrtRatioX64,
            this.liquidity,
            true
          ),
        };
      } else {
        return {
          amountA: ZERO,
          amountB: SqrtPriceMath.getAmountBDelta(
            TickMath.getSqrtRatioAtTick(this.tickLower),
            TickMath.getSqrtRatioAtTick(this.tickUpper),
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
   * @param tickLower The lower tick of the position
   * @param tickUpper The upper tick of the position
   * @param amountA tokenA amount
   * @param amountB tokenB amount
   * @param useFullPrecision If false, liquidity will be maximized according to what the router can calculate,
   * not what core can theoretically support
   * @returns The amount of liquidity for the position
   */
  public static fromAmounts({
    pool,
    tickLower,
    tickUpper,
    amountA,
    amountB,
    useFullPrecision,
  }: {
    pool: Pool;
    tickLower: number;
    tickUpper: number;
    amountA: BigintIsh;
    amountB: BigintIsh;
    useFullPrecision: boolean;
  }) {
    const sqrtRatioLX64 = TickMath.getSqrtRatioAtTick(tickLower);
    const sqrtRatioUX64 = TickMath.getSqrtRatioAtTick(tickUpper);
    return new Position({
      pool,
      tickLower,
      tickUpper,
      liquidity: maxLiquidityForAmounts(
        pool.sqrtRatioX64,
        sqrtRatioLX64,
        sqrtRatioUX64,
        amountA,
        amountB,
        useFullPrecision
      ),
    });
  }

  /**
   * Computes a position with the maximum amount of liquidity received for a given amount of tokenA, assuming an unlimited amount of tokenB
   * @param pool The pool for which the position is created
   * @param tickLower The lower tick
   * @param tickUpper The upper tick
   * @param amountA The desired amount of tokenA
   * @param useFullPrecision If true, liquidity will be maximized according to what the router can calculate,
   * not what core can theoretically support
   * @returns The position
   */
  public static fromAmountA({
    pool,
    tickLower,
    tickUpper,
    amountA,
    useFullPrecision,
  }: {
    pool: Pool;
    tickLower: number;
    tickUpper: number;
    amountA: BigintIsh;
    useFullPrecision: boolean;
  }) {
    return Position.fromAmounts({
      pool,
      tickLower,
      tickUpper,
      amountA,
      amountB: MaxUint256,
      useFullPrecision,
    });
  }

  /**
   * Computes a position with the maximum amount of liquidity received for a given amount of tokenB, assuming an unlimited amount of tokenA
   * @param pool The pool for which the position is created
   * @param tickLower The lower tick
   * @param tickUpper The upper tick
   * @param amountB The desired amount of tokenB
   * @returns The position
   */
  public static fromAmountB({
    pool,
    tickLower,
    tickUpper,
    amountB,
  }: {
    pool: Pool;
    tickLower: number;
    tickUpper: number;
    amountB: BigintIsh;
  }) {
    // this function always uses full precision,
    return Position.fromAmounts({
      pool,
      tickLower,
      tickUpper,
      amountA: MaxUint256,
      amountB,
      useFullPrecision: true,
    });
  }
}
