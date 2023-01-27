import invariant from "tiny-invariant";
import { BaseCurrency } from "./baseCurrency";
import { eosjsAccountName } from "eosjs-account-name";
import JSBI from "jsbi";

/**
 * Represents an ERC20 token with a unique address and some metadata.
 */
export class Token extends BaseCurrency {
  /**
   *
   * @param contract {@link BaseCurrency#contract}
   * @param decimals {@link BaseCurrency#decimals}
   * @param symbol {@link BaseCurrency#symbol}
   * @param name {@link BaseCurrency#name}
   */
  public constructor(
    contract: string,
    decimals: number,
    symbol: string,
    name?: string
  ) {
    super(contract, decimals, symbol, name);
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
      return this.symbol.toLowerCase() < other.symbol.toLowerCase();
    } else {
      return JSBI.lessThan(
        eosjsAccountName.nameToUint64(this.contract),
        eosjsAccountName.nameToUint64(other.contract)
      );
    }
  }
}
