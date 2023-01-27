import invariant from "tiny-invariant";
import { Currency } from "./currency";
import { Token } from "./token";

/**
 * A currency is any fungible financial instrument, including Ether, all ERC20 tokens, and other chain-native currencies
 */
export abstract class BaseCurrency {
  /**
   * The contract address of the currency
   */
  public readonly contract: string;
  /**
   * The decimals used in representing currency amounts
   */
  public readonly decimals: number;
  /**
   * The symbol of the currency, i.e. a short textual non-unique identifier
   */
  public readonly symbol: string;
  /**
   * The name of the currency, i.e. a descriptive textual non-unique identifier
   */
  public readonly name?: string;

  /**
   * Constructs an instance of the base class `BaseCurrency`.
   * @param chainId the chain ID on which this currency resides
   * @param decimals decimals of the currency
   * @param symbol symbol of the currency
   * @param name of the currency
   */
  protected constructor(
    contract: string,
    decimals: number,
    symbol: string,
    name?: string
  ) {
    invariant(
      decimals >= 0 && decimals < 19 && Number.isInteger(decimals),
      "DECIMALS"
    );
    this.contract = contract;
    this.decimals = decimals;
    this.symbol = symbol;
    this.name = name;
  }

  /**
   * Returns whether this currency is functionally equivalent to the other currency
   * @param other the other currency
   */
  public abstract equals(other: Currency): boolean;
}
