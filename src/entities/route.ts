import msgpack from "msgpack-lite"
import invariant from 'tiny-invariant'

import { Currency } from './currency'
import { Price } from './fractions'
import { Token } from './token'

import { Pool } from './pool'

/**
 * Represents a list of pools through which a swap can occur
 * @template TInput The input token
 * @template TOutput The output token
 */
export class Route<TInput extends Currency, TOutput extends Currency> {
  public readonly pools: Pool[];
  public readonly tokenPath: Token[];
  public readonly input: TInput;
  public readonly output: TOutput;

  private _midPrice: Price<TInput, TOutput> | null = null;

  /**
   * Creates an instance of route.
   * @param pools An array of `Pool` objects, ordered by the route the swap will take
   * @param input The input token
   * @param output The output token
   */
  public constructor(pools: Pool[], input: TInput, output: TOutput) {
    invariant(pools.length > 0, 'POOLS');

    const wrappedInput = input;
    invariant(pools[0].involvesToken(wrappedInput), 'INPUT');

    invariant(pools[pools.length - 1].involvesToken(output), 'OUTPUT');

    /**
     * Normalizes tokenA-tokenB order and selects the next token/fee step to add to the path
     * */
    const tokenPath: Token[] = [wrappedInput];
    for (const [i, pool] of pools.entries()) {
      const currentInputToken = tokenPath[i];
      invariant(
        currentInputToken.equals(pool.tokenA) ||
          currentInputToken.equals(pool.tokenB),
        'PATH'
      );
      const nextToken = currentInputToken.equals(pool.tokenA)
        ? pool.tokenB
        : pool.tokenA;
      tokenPath.push(nextToken);
    }

    this.pools = pools;
    this.tokenPath = tokenPath;
    this.input = input;
    this.output = output ?? tokenPath[tokenPath.length - 1];
  }

  /**
   * Returns the mid price of the route
   */
  public get midPrice(): Price<TInput, TOutput> {
    if (this._midPrice !== null) return this._midPrice;

    const price = this.pools.slice(1).reduce(
      ({ nextInput, price }, pool) => {
        return nextInput.equals(pool.tokenA)
          ? {
              nextInput: pool.tokenB,
              price: price.multiply(pool.tokenAPrice),
            }
          : {
              nextInput: pool.tokenA,
              price: price.multiply(pool.tokenBPrice),
            };
      },
      this.pools[0].tokenA.equals(this.input)
        ? {
            nextInput: this.pools[0].tokenB,
            price: this.pools[0].tokenAPrice,
          }
        : {
            nextInput: this.pools[0].tokenA,
            price: this.pools[0].tokenBPrice,
          }
    ).price;

    return (this._midPrice = new Price(
      this.input,
      this.output,
      price.denominator,
      price.numerator
    ));
  }

  static toJSON(route: Route<Currency, Currency>, lightWeightVersion = false) {
    return {
      pools: route.pools.map((pool) => {
        if (lightWeightVersion) {
          return pool.id;
        } else {
          return Pool.toBuffer(pool);
        }
      }),
      input: Token.toJSON(route.input),
      output: Token.toJSON(route.output),
      _midPrice: route._midPrice,
    };
  }

  static fromJSON(json: any) {
    const pools = json.pools.map((pool) => {
      if (typeof pool === 'number') {
        return Pool.fromId(pool);
      } else {
        const bytes =
          pool instanceof Uint8Array
            ? pool
            : typeof Buffer !== 'undefined' &&
              typeof Buffer.isBuffer === 'function' &&
              Buffer.isBuffer(pool)
            ? pool
            : pool instanceof ArrayBuffer
            ? new Uint8Array(pool)
            : pool && pool.buffer instanceof ArrayBuffer
            ? new Uint8Array(pool.buffer)
            : pool;
        return Pool.fromBuffer(bytes);
      }
    });
    const input = Token.fromJSON(json.input);
    const output = Token.fromJSON(json.output);
    return new Route(pools, input, output);
  }

  static toBuffer(
    route: Route<Currency, Currency>,
    lightWeightVersion = false
  ) {
    const json = this.toJSON(route, lightWeightVersion);
    return msgpack.encode(json);
  }

  static fromBuffer(buffer: Uint8Array) {
    const json = msgpack.decode(buffer);
    return this.fromJSON(json);
  }

  static toBufferAdvanced(route: Route<Currency, Currency>, pools: any[]) {
    const json = {
      pools: pools.map((pool) => {
        const isBuffer =
          typeof Buffer !== 'undefined' &&
          typeof Buffer.isBuffer === 'function' &&
          Buffer.isBuffer(pool);
        if (typeof pool === 'number' || pool instanceof Uint8Array || isBuffer) {
          return pool;
        } else {
          return Pool.toBuffer(pool);
        }
      }),
      input: Token.toJSON(route.input),
      output: Token.toJSON(route.output),
      _midPrice: route._midPrice,
    };
    return msgpack.encode(json);
  }

  public equals(other: Route<Currency, Currency>): boolean {
    if (this.pools.length !== other.pools.length) return false;

    for (let i = 0; i < this.pools.length; i++) {
      if (!this.pools[i].equals(other.pools[i])) return false;
    }
    return this.input.equals(other.input) && this.output.equals(other.output);
  }
}
