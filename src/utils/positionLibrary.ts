import { subIn128 } from "./tickLibrary";
import { Q64 } from "../internalConstants";

export abstract class PositionLibrary {
  /**
   * Cannot be constructed.
   */
  private constructor() {}

  // replicates the portions of Position#update required to compute unaccounted fees
  public static getTokensOwed(
    feeGrowthInsideALastX64: bigint,
    feeGrowthInsideBLastX64: bigint,
    liquidity: bigint,
    feeGrowthInsideAX64: bigint,
    feeGrowthInsideBX64: bigint
  ) {
    const tokensOwed0 = ((subIn128(feeGrowthInsideAX64, feeGrowthInsideALastX64) * liquidity) / Q64);

    const tokensOwed1 = ((subIn128(feeGrowthInsideBX64, feeGrowthInsideBLastX64) * liquidity) / Q64);

    return [tokensOwed0, tokensOwed1];
  }
}
