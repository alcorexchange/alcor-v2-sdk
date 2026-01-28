import { NEGATIVE_ONE, ZERO, FeeAmount } from "../internalConstants";
import { FullMath } from "./fullMath";
import { SqrtPriceMath } from "./sqrtPriceMath";

const MAX_FEE = (BigInt(10) ** BigInt(6));

// Cache for fee factors - feePips values are limited (100, 500, 3000, 10000)
const feeFactorCache = new Map<FeeAmount, bigint>();
const feePipsCache = new Map<FeeAmount, bigint>();

function getFeeFactor(feePips: FeeAmount): bigint {
  let cached = feeFactorCache.get(feePips);
  if (cached === undefined) {
    cached = (MAX_FEE - getFeePipsBigInt(feePips));
    feeFactorCache.set(feePips, cached);
  }
  return cached;
}

function getFeePipsBigInt(feePips: FeeAmount): bigint {
  let cached = feePipsCache.get(feePips);
  if (cached === undefined) {
    cached = BigInt(feePips);
    feePipsCache.set(feePips, cached);
  }
  return cached;
}

export abstract class SwapMath {
  /**
   * Cannot be constructed.
   */
  private constructor() {}

  public static computeSwapStep(
    sqrtRatioCurrentX64: bigint,
    sqrtRatioTargetX64: bigint,
    liquidity: bigint,
    amountRemaining: bigint,
    feePips: FeeAmount
  ): [bigint, bigint, bigint, bigint] {
    const zeroForOne = (sqrtRatioCurrentX64 >= sqrtRatioTargetX64);
    const exactIn = (amountRemaining >= ZERO);

    let sqrtRatioNextX64: bigint;
    let amountIn: bigint;
    let amountOut: bigint;
    let feeAmount: bigint;

    if (exactIn) {
      const feeFactor = getFeeFactor(feePips);
      const amountRemainingLessFee = ((amountRemaining * feeFactor) / MAX_FEE);

      const deltaIn = zeroForOne
        ? SqrtPriceMath.getAmountADelta(sqrtRatioTargetX64, sqrtRatioCurrentX64, liquidity, true)
        : SqrtPriceMath.getAmountBDelta(sqrtRatioCurrentX64, sqrtRatioTargetX64, liquidity, true);

      if ((amountRemainingLessFee >= deltaIn)) {
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

      feeAmount = (sqrtRatioNextX64 !== sqrtRatioTargetX64)
        ? (amountRemaining - amountIn)
        : FullMath.mulDivRoundingUp(amountIn, getFeePipsBigInt(feePips), feeFactor);
    } else {
      const deltaOut = zeroForOne
        ? SqrtPriceMath.getAmountBDelta(sqrtRatioTargetX64, sqrtRatioCurrentX64, liquidity, false)
        : SqrtPriceMath.getAmountADelta(sqrtRatioCurrentX64, sqrtRatioTargetX64, liquidity, false);

      const amountRemainingNegative = (amountRemaining * NEGATIVE_ONE);

      if ((amountRemainingNegative >= deltaOut)) {
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

      if ((amountOut > amountRemainingNegative)) {
        amountOut = amountRemainingNegative;
      }

      feeAmount = FullMath.mulDivRoundingUp(
        amountIn,
        getFeePipsBigInt(feePips),
        getFeeFactor(feePips)
      );
    }

    return [sqrtRatioNextX64, amountIn, amountOut, feeAmount];
  }
}
