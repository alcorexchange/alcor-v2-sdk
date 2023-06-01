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
  owner: string,
  pool: Pool;
  tickLower: number;
  tickUpper: number;
  liquidity: BigintIsh;
  feeGrowthInsideALastX64: BigintIsh,
  feeGrowthInsideBLastX64: BigintIsh,
  feesA: BigintIsh,
  feesB: BigintIsh,
}

interface Fees {
  feesA: CurrencyAmount<Token>,
  feesB: CurrencyAmount<Token>
}

export class Position {
  public readonly id: number;
  public readonly owner: string;
  public readonly pool: Pool;
  public readonly tickLower: number;
  public readonly tickUpper: number;
  public readonly liquidity: JSBI;
  public readonly feesA: JSBI;
  public readonly feesB: JSBI;
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
    owner,
    pool,
    liquidity,
    tickLower,
    tickUpper,
    feeGrowthInsideALastX64 = 0,
    feeGrowthInsideBLastX64 = 0,
    feesA = 0,
    feesB = 0,
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

    this.id = id;
    this.owner = owner;
    this.pool = pool;
    this.tickLower = tickLower;
    this.tickUpper = tickUpper;
    this.liquidity = JSBI.BigInt(liquidity);
    this.feeGrowthInsideALastX64 = JSBI.BigInt(feeGrowthInsideALastX64);
    this.feeGrowthInsideBLastX64 = JSBI.BigInt(feeGrowthInsideBLastX64);
    this.feesA = JSBI.BigInt(feesA)
    this.feesB = JSBI.BigInt(feesB)
  }

  public get inRange(): boolean {
    return (
      this.tickLower < this.pool.tickCurrent &&
      this.pool.tickCurrent < this.tickUpper
    );
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
            this.pool.sqrtPriceX64,
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
            this.pool.sqrtPriceX64,
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
      owner: this.owner,
      pool: this.pool,
      tickLower: this.tickLower,
      tickUpper: this.tickUpper,
      ...this.mintAmounts, // the mint amounts are what will be passed as calldata
      useFullPrecision: false,
      feeGrowthInsideALastX64: this.feeGrowthInsideALastX64,
      feeGrowthInsideBLastX64: this.feeGrowthInsideBLastX64,
      feesA: this.feesA,
      feesB: this.feesB,
    });

    // we want the smaller amounts...
    // ...which occurs at the upper price for amountA...
    const { amountA } = new Position({
      id: this.id,
      owner: this.owner,
      pool: poolUpper,
      liquidity: positionThatWillBeCreated.liquidity,
      tickLower: this.tickLower,
      tickUpper: this.tickUpper,
      feeGrowthInsideALastX64: this.feeGrowthInsideALastX64,
      feeGrowthInsideBLastX64: this.feeGrowthInsideBLastX64,
      feesA: this.feesA,
      feesB: this.feesB,
    }).mintAmounts;
    // ...and the lower for amountB
    const { amountB } = new Position({
      id: this.id,
      owner: this.owner,
      pool: poolLower,
      liquidity: positionThatWillBeCreated.liquidity,
      tickLower: this.tickLower,
      tickUpper: this.tickUpper,
      feeGrowthInsideALastX64: this.feeGrowthInsideALastX64,
      feeGrowthInsideBLastX64: this.feeGrowthInsideBLastX64,
      feesA: this.feesA,
      feesB: this.feesB,
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
  ): Readonly<{ amountA: CurrencyAmount<Token>; amountB: CurrencyAmount<Token> }> {
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
      owner: this.owner,
      pool: poolUpper,
      liquidity: this.liquidity,
      tickLower: this.tickLower,
      tickUpper: this.tickUpper,
      feeGrowthInsideALastX64: this.feeGrowthInsideALastX64,
      feeGrowthInsideBLastX64: this.feeGrowthInsideBLastX64,
      feesA: this.feesA,
      feesB: this.feesB,
    }).amountA;
    // ...and the lower for amountB
    const amountB = new Position({
      id: this.id,
      owner: this.owner,
      pool: poolLower,
      liquidity: this.liquidity,
      tickLower: this.tickLower,
      tickUpper: this.tickUpper,
      feeGrowthInsideALastX64: this.feeGrowthInsideALastX64,
      feeGrowthInsideBLastX64: this.feeGrowthInsideBLastX64,
      feesA: this.feesA,
      feesB: this.feesB,
    }).amountB;

    return { amountA: amountA, amountB: amountB };
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
            this.pool.sqrtPriceX64,
            TickMath.getSqrtRatioAtTick(this.tickUpper),
            this.liquidity,
            true
          ),
          amountB: SqrtPriceMath.getAmountBDelta(
            TickMath.getSqrtRatioAtTick(this.tickLower),
            this.pool.sqrtPriceX64,
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
    owner,
    pool,
    tickLower,
    tickUpper,
    amountA,
    amountB,
    useFullPrecision,
    feeGrowthInsideALastX64,
    feeGrowthInsideBLastX64,
    feesA,
    feesB
  }: {
    id: number,
    owner: string,
    pool: Pool;
    tickLower: number;
    tickUpper: number;
    amountA: BigintIsh;
    amountB: BigintIsh;
    useFullPrecision: boolean;
    feeGrowthInsideALastX64: | BigintIsh,
    feeGrowthInsideBLastX64: | BigintIsh,
    feesA: BigintIsh,
    feesB: BigintIsh
  }) {
    const sqrtRatioLX64 = TickMath.getSqrtRatioAtTick(tickLower);
    const sqrtRatioUX64 = TickMath.getSqrtRatioAtTick(tickUpper);
    return new Position({
      id,
      owner,
      pool,
      tickLower,
      tickUpper,
      liquidity: maxLiquidityForAmounts(
        pool.sqrtPriceX64,
        sqrtRatioLX64,
        sqrtRatioUX64,
        amountA,
        amountB,
        useFullPrecision
      ),
      feeGrowthInsideALastX64,
      feeGrowthInsideBLastX64,
      feesA,
      feesB
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
    owner,
    pool,
    tickLower,
    tickUpper,
    amountA,
    useFullPrecision,
    feeGrowthInsideALastX64,
    feeGrowthInsideBLastX64,
    feesA,
    feesB
  }: {
    id: number,
    owner: string,
    pool: Pool;
    tickLower: number;
    tickUpper: number;
    amountA: BigintIsh;
    useFullPrecision: boolean;
    feeGrowthInsideALastX64: | BigintIsh;
    feeGrowthInsideBLastX64: | BigintIsh;
    feesA: | BigintIsh;
    feesB: | BigintIsh;
  }) {
    return Position.fromAmounts({
      id,
      owner,
      pool,
      tickLower,
      tickUpper,
      amountA,
      amountB: MaxUint64,
      useFullPrecision,
      feeGrowthInsideALastX64,
      feeGrowthInsideBLastX64,
      feesA,
      feesB
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
    owner,
    pool,
    tickLower,
    tickUpper,
    amountB,
    feeGrowthInsideALastX64,
    feeGrowthInsideBLastX64,
    feesA,
    feesB
  }: {
    id: number,
    owner: string,
    pool: Pool;
    tickLower: number;
    tickUpper: number;
    amountB: BigintIsh;
    feeGrowthInsideALastX64: | BigintIsh;
    feeGrowthInsideBLastX64: | BigintIsh;
    feesA: BigintIsh
    feesB: BigintIsh
  }) {
    // this function always uses full precision,
    return Position.fromAmounts({
      id,
      owner,
      pool,
      tickLower,
      tickUpper,
      amountA: MaxUint64,
      amountB,
      useFullPrecision: true,
      feeGrowthInsideALastX64,
      feeGrowthInsideBLastX64,
      feesA,
      feesB
    });
  }

  /**
   * Computes a position fees
   * @returns The position
   */
  public async getFees(): Promise<Fees> {
    const { liquidity, tickLower, tickUpper, feeGrowthInsideALastX64, feeGrowthInsideBLastX64, pool } = this
    
    const lower = await this.pool.tickDataProvider.getTick(tickLower)
    const upper = await this.pool.tickDataProvider.getTick(tickUpper)

    const { feeGrowthGlobalAX64, feeGrowthGlobalBX64 } = pool

    const [feeGrowthInsideAX64, feeGrowthInsideBX64] = TickLibrary.getFeeGrowthInside(
      lower,
      upper,

      tickLower,
      tickUpper,
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
      feesA: CurrencyAmount.fromRawAmount(this.pool.tokenA, JSBI.add(tokensOwedA, this.feesA)),
      feesB: CurrencyAmount.fromRawAmount(this.pool.tokenB, JSBI.add(tokensOwedB, this.feesB))
    }
  }
}
