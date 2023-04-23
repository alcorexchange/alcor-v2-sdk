import invariant from "tiny-invariant";
import { BaseCurrency } from "./baseCurrency";
import { symbol, name } from "eos-common"

/**
 * Represents an ERC20 token with a unique address and some metadata.
 */
export class Token extends BaseCurrency {
  /**
   * @param contract {@link BaseCurrency#contract}
   * @param decimals {@link BaseCurrency#decimals}
   * @param symbol {@link BaseCurrency#symbol}
   * @param id {@link BaseCurrency#id}
   */
  public constructor(
    contract: string,
    decimals: number,
    symbol: string,
    id?: string
  ) {
    super(contract, decimals, symbol, id);
  }

  public get name(): string {
    console.warn('Token.name is deprecated, use token.id')
    return this.symbol.toLowerCase() + '-' + this.contract
  }

  /**
   * Returns true if the two tokens are equivalent, i.e. have the same contract and symbol.
   * @param other other token to compare
   */
  public equals(other: Token): boolean {
    return (
      this.contract === other.contract &&
      this.symbol === other.symbol &&
      this.decimals === other.decimals
    );
  }

  /**
   * Returns true if the address of this token sorts before the address of the other token
   * @param other other token to compare
   * @throws if the tokens have the same contract and symbol
   */
  public sortsBefore(other: Token): boolean {
    if (this.contract === other.contract) {
      invariant(this.symbol !== other.symbol, "SYMBOLS");
      const token0Symbol = symbol(this.symbol, this.decimals);
      const token1Symbol = symbol(other.symbol, other.decimals);
      return token0Symbol.raw().lt(token1Symbol.raw());
    } else {
        return name(this.contract).raw().lt(name(other.contract).raw());
    }
  }
}
