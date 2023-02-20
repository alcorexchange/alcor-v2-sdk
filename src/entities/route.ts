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
  public readonly pools: Pool[]
  public readonly tokenPath: Token[]
  public readonly input: TInput
  public readonly output: TOutput

  private _midPrice: Price<TInput, TOutput> | null = null

  /**
   * Creates an instance of route.
   * @param pools An array of `Pool` objects, ordered by the route the swap will take
   * @param input The input token
   * @param output The output token
   */
  public constructor(pools: Pool[], input: TInput, output: TOutput) {
    invariant(pools.length > 0, 'POOLS')

    const wrappedInput = input
    invariant(pools[0].involvesToken(wrappedInput), 'INPUT')

    invariant(pools[pools.length - 1].involvesToken(output), 'OUTPUT')

    /**
     * Normalizes tokenA-tokenB order and selects the next token/fee step to add to the path
     * */
    const tokenPath: Token[] = [wrappedInput]
    for (const [i, pool] of pools.entries()) {
      const currentInputToken = tokenPath[i]
      invariant(currentInputToken.equals(pool.tokenA) || currentInputToken.equals(pool.tokenB), 'PATH')
      const nextToken = currentInputToken.equals(pool.tokenA) ? pool.tokenB : pool.tokenA
      tokenPath.push(nextToken)
    }

    this.pools = pools
    this.tokenPath = tokenPath
    this.input = input
    this.output = output ?? tokenPath[tokenPath.length - 1]
  }

  /**
   * Returns the mid price of the route
   */
  public get midPrice(): Price<TInput, TOutput> {
    if (this._midPrice !== null) return this._midPrice

    const price = this.pools.slice(1).reduce(
      ({ nextInput, price }, pool) => {
        return nextInput.equals(pool.tokenA)
          ? {
              nextInput: pool.tokenB,
              price: price.multiply(pool.tokenAPrice)
            }
          : {
              nextInput: pool.tokenA,
              price: price.multiply(pool.tokenBPrice)
            }
      },
      this.pools[0].tokenA.equals(this.input)
        ? {
            nextInput: this.pools[0].tokenB,
            price: this.pools[0].tokenAPrice
          }
        : {
            nextInput: this.pools[0].tokenA,
            price: this.pools[0].tokenBPrice
          }
    ).price

    return (this._midPrice = new Price(this.input, this.output, price.denominator, price.numerator))
  }
}
