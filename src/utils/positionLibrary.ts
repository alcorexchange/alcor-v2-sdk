import JSBI from "jsbi";
import { subIn128 } from ".";
import { Q64 } from "../internalConstants";

export abstract class PositionLibrary {
  /**
   * Cannot be constructed.
   */
  private constructor() {}

  // replicates the portions of Position#update required to compute unaccounted fees
  public static getTokensOwed(
    feeGrowthInsideALastX64: JSBI,
    feeGrowthInsideBLastX64: JSBI,
    liquidity: JSBI,
    feeGrowthInsideAX64: JSBI,
    feeGrowthInsideBX64: JSBI
  ) {
    const tokensOwed0 = JSBI.divide(
      JSBI.multiply(
        subIn128(feeGrowthInsideAX64, feeGrowthInsideALastX64),
        liquidity
      ),
      Q64
    );

    const tokensOwed1 = JSBI.divide(
      JSBI.multiply(
        subIn128(feeGrowthInsideBX64, feeGrowthInsideBLastX64),
        liquidity
      ),
      Q64
    );

    return [tokensOwed0, tokensOwed1];
  }
}
