import JSBI from "jsbi";
import { NEGATIVE_ONE, ZERO, FeeAmount } from "../internalConstants";
import { FullMath } from "./fullMath";
import { SqrtPriceMath } from "./sqrtPriceMath";

const MAX_FEE = JSBI.exponentiate(JSBI.BigInt(10), JSBI.BigInt(6));
const MAX_FEE_MINUS_FEE_PIPS = (feePips: FeeAmount) => JSBI.subtract(MAX_FEE, JSBI.BigInt(feePips));

export abstract class SwapMath {
  /**
   * Cannot be constructed.
   */
  private constructor() {}

  public static computeSwapStep(
    sqrtRatioCurrentX64: JSBI,
    sqrtRatioTargetX64: JSBI,
    liquidity: JSBI,
    amountRemaining: JSBI,
    feePips: FeeAmount
  ): [JSBI, JSBI, JSBI, JSBI] {
    const zeroForOne = JSBI.greaterThanOrEqual(sqrtRatioCurrentX64, sqrtRatioTargetX64);
    const exactIn = JSBI.greaterThanOrEqual(amountRemaining, ZERO);

    let sqrtRatioNextX64: JSBI;
    let amountIn: JSBI;
    let amountOut: JSBI;
    let feeAmount: JSBI;

    if (exactIn) {
      const feeFactor = MAX_FEE_MINUS_FEE_PIPS(feePips);
      const amountRemainingLessFee = JSBI.divide(
        JSBI.multiply(amountRemaining, feeFactor),
        MAX_FEE
      );

      const deltaIn = zeroForOne
        ? SqrtPriceMath.getAmountADelta(sqrtRatioTargetX64, sqrtRatioCurrentX64, liquidity, true)
        : SqrtPriceMath.getAmountBDelta(sqrtRatioCurrentX64, sqrtRatioTargetX64, liquidity, true);

      if (JSBI.greaterThanOrEqual(amountRemainingLessFee, deltaIn)) {
        sqrtRatioNextX64 = sqrtRatioTargetX64;
        amountIn = deltaIn;
      } else {
        sqrtRatioNextX64 = SqrtPriceMath.getNextSqrtPriceFromInput(
          sqrtRatioCurrentX64,
          liquidity,
          amountRemainingLessFee,
          zeroForOne
        );
        amountIn = zeroForOne
          ? SqrtPriceMath.getAmountADelta(sqrtRatioNextX64, sqrtRatioCurrentX64, liquidity, true)
          : SqrtPriceMath.getAmountBDelta(sqrtRatioCurrentX64, sqrtRatioNextX64, liquidity, true);
      }

      amountOut = zeroForOne
        ? SqrtPriceMath.getAmountBDelta(sqrtRatioNextX64, sqrtRatioCurrentX64, liquidity, false)
        : SqrtPriceMath.getAmountADelta(sqrtRatioCurrentX64, sqrtRatioNextX64, liquidity, false);

      feeAmount = JSBI.notEqual(sqrtRatioNextX64, sqrtRatioTargetX64)
        ? JSBI.subtract(amountRemaining, amountIn)
        : FullMath.mulDivRoundingUp(amountIn, JSBI.BigInt(feePips), feeFactor);
    } else {
      const deltaOut = zeroForOne
        ? SqrtPriceMath.getAmountBDelta(sqrtRatioTargetX64, sqrtRatioCurrentX64, liquidity, false)
        : SqrtPriceMath.getAmountADelta(sqrtRatioCurrentX64, sqrtRatioTargetX64, liquidity, false);

      const amountRemainingNegative = JSBI.multiply(amountRemaining, NEGATIVE_ONE);

      if (JSBI.greaterThanOrEqual(amountRemainingNegative, deltaOut)) {
        sqrtRatioNextX64 = sqrtRatioTargetX64;
        amountOut = deltaOut;
      } else {
        sqrtRatioNextX64 = SqrtPriceMath.getNextSqrtPriceFromOutput(
          sqrtRatioCurrentX64,
          liquidity,
          amountRemainingNegative,
          zeroForOne
        );
        amountOut = zeroForOne
          ? SqrtPriceMath.getAmountBDelta(sqrtRatioNextX64, sqrtRatioCurrentX64, liquidity, false)
          : SqrtPriceMath.getAmountADelta(sqrtRatioCurrentX64, sqrtRatioNextX64, liquidity, false);
      }

      amountIn = zeroForOne
        ? SqrtPriceMath.getAmountADelta(sqrtRatioNextX64, sqrtRatioCurrentX64, liquidity, true)
        : SqrtPriceMath.getAmountBDelta(sqrtRatioCurrentX64, sqrtRatioNextX64, liquidity, true);

      if (JSBI.greaterThan(amountOut, amountRemainingNegative)) {
        amountOut = amountRemainingNegative;
      }

      feeAmount = FullMath.mulDivRoundingUp(
        amountIn,
        JSBI.BigInt(feePips),
        MAX_FEE_MINUS_FEE_PIPS(feePips)
      );
    }

    return [sqrtRatioNextX64, amountIn, amountOut, feeAmount];
  }
}
