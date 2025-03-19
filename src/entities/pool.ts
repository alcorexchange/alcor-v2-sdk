import msgpack from "msgpack-lite";
import crypto, {createHash} from 'crypto';

import { CurrencyAmount, Price } from "./fractions";
import { Token } from "./token";
import { BigintIsh, FeeAmount, TICK_SPACINGS } from "../internalConstants";
import JSBI from "jsbi";
import invariant from "tiny-invariant";
import { NEGATIVE_ONE, ONE, Q128, ZERO } from "../internalConstants";
import { LiquidityMath } from "../utils/liquidityMath";
import { SwapMath } from "../utils/swapMath";
import { TickMath } from "../utils/tickMath";
import { Tick, TickConstructorArgs } from "./tick";
import { NoTickDataProvider, TickDataProvider } from "./tickDataProvider";
import { TickListDataProvider } from "./tickListDataProvider";
import {InsufficientReservesError, InsufficientInputAmountError} from "../errors";

export interface PoolConstructorArgs {
  id: number,
  active: boolean,
  tokenA: Token,
  tokenB: Token,
  fee: FeeAmount,
  sqrtPriceX64: BigintIsh,
  liquidity: BigintIsh,
  tickCurrent: number,
  feeGrowthGlobalAX64: BigintIsh,
  feeGrowthGlobalBX64: BigintIsh,
  ticks:
    | TickDataProvider
    | (Tick | TickConstructorArgs)[]
}

interface StepComputations {
  sqrtPriceStartX64: JSBI;
  tickNext: number;
  initialized: boolean;
  sqrtPriceNextX64: JSBI;
  amountIn: JSBI;
  amountOut: JSBI;
  feeAmount: JSBI;
}

/**
 * By default, pools will not allow operations that require ticks.
 */
const NO_TICK_DATA_PROVIDER_DEFAULT = new NoTickDataProvider();

/**
 * Represents a V3 pool
 */
export class Pool {
  // public readonly id: number;
  public readonly id: number;
  public readonly active: boolean;
  public readonly tokenA: Token;
  public readonly tokenB: Token;
  public readonly fee: FeeAmount;
  public readonly sqrtPriceX64: JSBI;
  public readonly liquidity: JSBI;
  public readonly tickCurrent: number;
  public readonly feeGrowthGlobalAX64: JSBI;
  public readonly feeGrowthGlobalBX64: JSBI;
  public readonly tickDataProvider: TickDataProvider;

  public json?: any
  public buffer?: Buffer
  public bufferHash?: string

  static hashToPoolMap: Map<string, Pool> = new Map()
  public static idToPoolMap: Map<number, Pool> = new Map()


  private _tokenAPrice?: Price<Token, Token>;
  private _tokenBPrice?: Price<Token, Token>;

  /**
   * Construct a pool
   * @param tokenA One of the tokens in the pool
   * @param tokenB The other token in the pool
   * @param fee The fee in hundredths of a bips of the input amount of every swap that is collected by the pool
   * @param sqrtPriceX64 The sqrt of the current ratio of amounts of tokenB to tokenA
   * @param liquidity The current value of in range liquidity
   * @param tickCurrent The current tick of the pool
   * @param ticks The current state of the pool ticks or a data provider that can return tick data
   */
  public constructor({
    id,
    active,
    tokenA,
    tokenB,
    fee,
    sqrtPriceX64,
    liquidity,
    tickCurrent,
    ticks = NO_TICK_DATA_PROVIDER_DEFAULT,
    feeGrowthGlobalAX64 = 0,
    feeGrowthGlobalBX64 = 0,
  }: PoolConstructorArgs) {
    invariant(Number.isInteger(fee) && fee < 1_000_000, "FEE");

    const tickCurrentSqrtRatioX64 = TickMath.getSqrtRatioAtTick(tickCurrent);
    const nextTickSqrtRatioX64 = TickMath.getSqrtRatioAtTick(tickCurrent + 1);
    invariant(
      JSBI.greaterThanOrEqual(
        JSBI.BigInt(sqrtPriceX64),
        tickCurrentSqrtRatioX64
      ) &&
        JSBI.lessThanOrEqual(JSBI.BigInt(sqrtPriceX64), nextTickSqrtRatioX64),
      "PRICE_BOUNDS"
    );
    // always create a copy of the list since we want the pool's tick list to be immutable
    this.id = id;
    this.fee = fee;
    this.active = active;
    this.sqrtPriceX64 = JSBI.BigInt(sqrtPriceX64);
    this.liquidity = JSBI.BigInt(liquidity);
    this.tickCurrent = tickCurrent;
    this.feeGrowthGlobalAX64 = JSBI.BigInt(feeGrowthGlobalAX64);
    this.feeGrowthGlobalBX64 = JSBI.BigInt(feeGrowthGlobalBX64);

    this.tickDataProvider = Array.isArray(ticks)
      ? new TickListDataProvider(ticks, TICK_SPACINGS[fee])
      : ticks;

    [this.tokenA, this.tokenB] = tokenA.sortsBefore(tokenB)
      ? [tokenA, tokenB]
      : [tokenB, tokenA];
  }

  /**
   * Returns true if the token is either tokenA or tokenB
   * @param token The token to check
   * @returns True if token is either tokenA or token
   */
  public involvesToken(token: Token): boolean {
    return token.equals(this.tokenA) || token.equals(this.tokenB);
  }

  /**
   * Returns the current mid price of the pool in terms of tokenA, i.e. the ratio of tokenB over tokenA
   */
  public get tokenAPrice(): Price<Token, Token> {
    return (
      this._tokenAPrice ??
      (this._tokenAPrice = new Price(
        this.tokenA,
        this.tokenB,
        Q128,
        JSBI.multiply(this.sqrtPriceX64, this.sqrtPriceX64)
      ))
    );
  }

  /**
   * Returns the current mid price of the pool in terms of tokenB, i.e. the ratio of tokenA over tokenB
   */
  public get tokenBPrice(): Price<Token, Token> {
    return (
      this._tokenBPrice ??
      (this._tokenBPrice = new Price(
        this.tokenB,
        this.tokenA,
        JSBI.multiply(this.sqrtPriceX64, this.sqrtPriceX64),
        Q128
      ))
    );
  }

  /**
   * Return the price of the given token in terms of the other token in the pool.
   * @param token The token to return price of
   * @returns The price of the given token, in terms of the other.
   */
  public priceOf(token: Token): Price<Token, Token> {
    invariant(this.involvesToken(token), "TOKEN");
    return token.equals(this.tokenA) ? this.tokenAPrice : this.tokenBPrice;
  }

  /**
   * Given an input amount of a token, return the computed output amount, and a pool with state updated after the trade
   * @param inputAmount The input amount for which to quote the output amount
   * @param sqrtPriceLimitX64 The Q64.96 sqrt price limit
   * @returns The output amount and the pool with updated state
   */
  public getOutputAmount(
    inputAmount: CurrencyAmount<Token>,
    sqrtPriceLimitX64?: JSBI
  ): CurrencyAmount<Token> {
    invariant(this.involvesToken(inputAmount.currency), "TOKEN");

    const zeroForOne = inputAmount.currency.equals(this.tokenA);

    const { amountA, amountB } = this.swap(zeroForOne, inputAmount.quotient, sqrtPriceLimitX64);

    const outputToken = zeroForOne ? this.tokenB : this.tokenA;
    const outputAmount = zeroForOne ? amountB : amountA;
    const amountIn = zeroForOne ? amountA : amountB;

    //console.log(JSBI.equal(amountIn, inputAmount.quotient))
    if (!JSBI.greaterThanOrEqual(inputAmount.quotient, amountIn)) {
    //if (!JSBI.equal(amountIn, inputAmount.quotient)) {
      throw new InsufficientInputAmountError
    }

    return CurrencyAmount.fromRawAmount(
        outputToken,
        JSBI.multiply(outputAmount, NEGATIVE_ONE)
      )
  }

  /**
   * Given a desired output amount of a token, return the computed input amount and a pool with state updated after the trade
   * @param outputAmount the output amount for which to quote the input amount
   * @param sqrtPriceLimitX64 The Q64.96 sqrt price limit. If zero for one, the price cannot be less than this value after the swap. If one for zero, the price cannot be greater than this value after the swap
   * @returns The input amount and the pool with updated state
   */
  public getInputAmount(
    outputAmount: CurrencyAmount<Token>,
    sqrtPriceLimitX64?: JSBI
  ): CurrencyAmount<Token> {
    const zeroForOne = outputAmount.currency.equals(this.tokenB);

    const { amountA, amountB } = this.swap(zeroForOne, JSBI.multiply(outputAmount.quotient, NEGATIVE_ONE), sqrtPriceLimitX64);

    const inputToken = zeroForOne ? this.tokenA : this.tokenB;
    const inputAmount = zeroForOne ? amountA : amountB;
    const amountOutReceived = JSBI.multiply(zeroForOne ? amountB : amountA, NEGATIVE_ONE)

    if (!JSBI.equal(amountOutReceived, outputAmount.quotient)) {
      throw new InsufficientReservesError
    }

    return CurrencyAmount.fromRawAmount(inputToken, inputAmount)
  }

  /**
   * Executes a swap
   * @param zeroForOne Whether the amount in is tokenA or tokenB
   * @param amountSpecified The amount of the swap, which implicitly configures the swap as exact input (positive), or exact output (negative)
   * @param sqrtPriceLimitX64 The Q64.96 sqrt price limit. If zero for one, the price cannot be less than this value after the swap. If one for zero, the price cannot be greater than this value after the swap
   * @returns amountCalculated
   * @returns sqrtPriceX64
   * @returns liquidity
   * @returns tickCurrent
   */
  private swap(
    zeroForOne: boolean,
    amountSpecified: JSBI,
    sqrtPriceLimitX64?: JSBI
  ): {
    amountA: JSBI;
    amountB: JSBI;
    sqrtPriceX64: JSBI;
    liquidity: JSBI;
    tickCurrent: number;
  } {
    const sqrtPriceLimit = sqrtPriceLimitX64 || (zeroForOne
      ? JSBI.add(TickMath.MIN_SQRT_RATIO, ONE)
      : JSBI.subtract(TickMath.MAX_SQRT_RATIO, ONE));

    // Убираем проверки invariant в продакшене, если данные гарантированно валидны
    const exactInput = JSBI.greaterThanOrEqual(amountSpecified, ZERO);

    const state = {
      amountSpecifiedRemaining: amountSpecified,
      amountCalculated: ZERO,
      sqrtPriceX64: this.sqrtPriceX64,
      tick: this.tickCurrent,
      liquidity: this.liquidity,
    };

    while (JSBI.notEqual(state.amountSpecifiedRemaining, ZERO) && state.sqrtPriceX64 !== sqrtPriceLimit) {
      const step: Partial<StepComputations> = { sqrtPriceStartX64: state.sqrtPriceX64 };

      // Оптимизация вызова nextInitializedTickWithinOneWord
      [step.tickNext, step.initialized] = this.tickDataProvider.nextInitializedTickWithinOneWord(
        state.tick,
        zeroForOne,
        this.tickSpacing
      );

      step.tickNext = Math.max(TickMath.MIN_TICK, Math.min(step.tickNext, TickMath.MAX_TICK));
      step.sqrtPriceNextX64 = TickMath.getSqrtRatioAtTick(step.tickNext);

      const targetPrice = (zeroForOne
        ? JSBI.lessThan(step.sqrtPriceNextX64, sqrtPriceLimit)
        : JSBI.greaterThan(step.sqrtPriceNextX64, sqrtPriceLimit))
        ? sqrtPriceLimit
        : step.sqrtPriceNextX64;

      [state.sqrtPriceX64, step.amountIn, step.amountOut, step.feeAmount] = SwapMath.computeSwapStep(
        state.sqrtPriceX64,
        targetPrice,
        state.liquidity,
        state.amountSpecifiedRemaining,
        this.fee
      );

      if (exactInput) {
        state.amountSpecifiedRemaining = JSBI.subtract(state.amountSpecifiedRemaining, JSBI.add(step.amountIn, step.feeAmount));
        state.amountCalculated = JSBI.subtract(state.amountCalculated, step.amountOut);
      } else {
        state.amountSpecifiedRemaining = JSBI.add(state.amountSpecifiedRemaining, step.amountOut);
        state.amountCalculated = JSBI.add(state.amountCalculated, JSBI.add(step.amountIn, step.feeAmount));
      }

      if (JSBI.equal(state.sqrtPriceX64, step.sqrtPriceNextX64)) {
        if (step.initialized) {
          let liquidityNet = JSBI.BigInt(this.tickDataProvider.getTick(step.tickNext).liquidityNet);
          if (zeroForOne) liquidityNet = JSBI.multiply(liquidityNet, NEGATIVE_ONE);
          state.liquidity = LiquidityMath.addDelta(state.liquidity, liquidityNet);
        }
        state.tick = zeroForOne ? step.tickNext - 1 : step.tickNext;
      } else if (state.sqrtPriceX64 !== step.sqrtPriceStartX64) {
        state.tick = TickMath.getTickAtSqrtRatio(state.sqrtPriceX64);
      }
    }

    return {
      amountA: zeroForOne === exactInput ? JSBI.subtract(amountSpecified, state.amountSpecifiedRemaining) : state.amountCalculated,
      amountB: zeroForOne === exactInput ? state.amountCalculated : JSBI.subtract(amountSpecified, state.amountSpecifiedRemaining),
      sqrtPriceX64: state.sqrtPriceX64,
      liquidity: state.liquidity,
      tickCurrent: state.tick,
    };
  }

  public get tickSpacing(): number {
    return TICK_SPACINGS[this.fee];
  }

  static toJSON(pool: Pool): object {
    if (pool.json) return pool.json
    pool.json = {
      id: pool.id,
      tokenA: Token.toJSON(pool.tokenA),
      tokenB: Token.toJSON(pool.tokenB),
      active: pool.active,
      fee: pool.fee,
      sqrtPriceX64: pool.sqrtPriceX64.toString(),
      liquidity: pool.liquidity.toString(),
      tickCurrent: pool.tickCurrent,
      feeGrowthGlobalAX64: pool.feeGrowthGlobalAX64.toString(),
      feeGrowthGlobalBX64: pool.feeGrowthGlobalBX64.toString(),
      tickDataProvider: TickListDataProvider.toJSON((pool.tickDataProvider as TickListDataProvider).ticks as Tick[])
    }

    return pool.json
  }

  static fromJSON(json: any): Pool {
    return new Pool({
      id: json.id,
      active: json.active,
      tokenA: Token.fromJSON(json.tokenA),
      tokenB: Token.fromJSON(json.tokenB),
      fee: json.fee,
      sqrtPriceX64: JSBI.BigInt(json.sqrtPriceX64),
      liquidity: JSBI.BigInt(json.liquidity),
      tickCurrent: json.tickCurrent,
      feeGrowthGlobalAX64: JSBI.BigInt(json.feeGrowthGlobalAX64),
      feeGrowthGlobalBX64: JSBI.BigInt(json.feeGrowthGlobalBX64),
      ticks: TickListDataProvider.fromJSON(json.tickDataProvider)
    });
  }
  /**
   * Converts the pool to a Buffer using msgpack encoding.
   * @param {Pool} pool - The pool instance to convert.
   * @returns {Buffer} The encoded buffer.
   */
  static toBuffer(pool: Pool): Buffer {
    if (pool.buffer) return pool.buffer;
    
    const json = Pool.toJSON(pool);
    pool.buffer = msgpack.encode(json);
    pool.bufferHash = Pool.createHash(pool.buffer as Buffer);
    
    return pool.buffer as Buffer;
  }

  /**
   * Creates a Pool instance from a Buffer or serialized data.
   * @param {Buffer | any} data - The buffer or serialized data.
   * @returns {Pool} The pool instance.
   */
  static fromBuffer(data: Buffer | any): Pool {
    const bufferHash = Pool.createHash(data instanceof Buffer ? data : data.buffer);

    if (this.hashToPoolMap.has(bufferHash)) {
      return <Pool>this.hashToPoolMap.get(bufferHash);
    }

    const json = msgpack.decode(data instanceof Buffer ? data : data.buffer);
    const pool = Pool.fromJSON(json);

    this.hashToPoolMap.set(bufferHash, pool);
    this.idToPoolMap.set(pool.id, pool);
    
    return pool;
  }

  static fromId(id: number): Pool {
    //console.log('fromId', id)
    const pool = Pool.idToPoolMap.get(id)
    if (!pool) throw new Error('pool does not exist in idToPoolMap')
    return pool;
  }

  static createHash(buffer: Buffer, pool?: Pool) {
    if (pool && pool.bufferHash) {
      return pool.bufferHash
    }
    const hash = crypto.createHash('sha256');
    hash.update(buffer);
    const hexHash = hash.digest('hex');

    if (pool) {
      pool.bufferHash = hexHash
    }
    return hexHash
  }
  static hashEquals(pool: Pool, hash: string) {
    return pool.bufferHash === hash
  }
  public equals(other: Pool): boolean {
    // Сравниваем id пулов
    if (this.id !== other.id) return false;

    // Сравниваем fee
    if (this.fee !== other.fee) return false;

    // Сравниваем sqrtPriceX64
    if (!JSBI.equal(this.sqrtPriceX64, other.sqrtPriceX64)) return false;

    // Сравниваем liquidity
    if (!JSBI.equal(this.liquidity, other.liquidity)) return false;

    // Сравниваем tickCurrent
    if (this.tickCurrent !== other.tickCurrent) return false;

    // Сравниваем токены (предполагается, что у Token есть метод equals)
    if (!this.tokenA.equals(other.tokenA) || !this.tokenB.equals(other.tokenB)) return false;

    // Если все проверки прошли, объекты считаются равными
    return true;
  }
}
