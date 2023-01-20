import JSBI from 'jsbi'
import { NEGATIVE_ONE, ZERO, FeeAmount } from '../internalConstants'
import { FullMath } from './fullMath'
import { SqrtPriceMath } from './sqrtPriceMath'

const MAX_FEE = JSBI.exponentiate(JSBI.BigInt(10), JSBI.BigInt(6))

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
    const returnValues: Partial<{
      sqrtRatioNextX64: JSBI
      amountIn: JSBI
      amountOut: JSBI
      feeAmount: JSBI
    }> = {}

    const zeroForOne = JSBI.greaterThanOrEqual(sqrtRatioCurrentX64, sqrtRatioTargetX64)
    const exactIn = JSBI.greaterThanOrEqual(amountRemaining, ZERO)

    if (exactIn) {
      const amountRemainingLessFee = JSBI.divide(
        JSBI.multiply(amountRemaining, JSBI.subtract(MAX_FEE, JSBI.BigInt(feePips))),
        MAX_FEE
      )
      returnValues.amountIn = zeroForOne
        ? SqrtPriceMath.getAmountADelta(sqrtRatioTargetX64, sqrtRatioCurrentX64, liquidity, true)
        : SqrtPriceMath.getAmountBDelta(sqrtRatioCurrentX64, sqrtRatioTargetX64, liquidity, true)
      if (JSBI.greaterThanOrEqual(amountRemainingLessFee, returnValues.amountIn!)) {
        returnValues.sqrtRatioNextX64 = sqrtRatioTargetX64
      } else {
        returnValues.sqrtRatioNextX64 = SqrtPriceMath.getNextSqrtPriceFromInput(
          sqrtRatioCurrentX64,
          liquidity,
          amountRemainingLessFee,
          zeroForOne
        )
      }
    } else {
      returnValues.amountOut = zeroForOne
        ? SqrtPriceMath.getAmountBDelta(sqrtRatioTargetX64, sqrtRatioCurrentX64, liquidity, false)
        : SqrtPriceMath.getAmountADelta(sqrtRatioCurrentX64, sqrtRatioTargetX64, liquidity, false)
      if (JSBI.greaterThanOrEqual(JSBI.multiply(amountRemaining, NEGATIVE_ONE), returnValues.amountOut)) {
        returnValues.sqrtRatioNextX64 = sqrtRatioTargetX64
      } else {
        returnValues.sqrtRatioNextX64 = SqrtPriceMath.getNextSqrtPriceFromOutput(
          sqrtRatioCurrentX64,
          liquidity,
          JSBI.multiply(amountRemaining, NEGATIVE_ONE),
          zeroForOne
        )
      }
    }

    const max = JSBI.equal(sqrtRatioTargetX64, returnValues.sqrtRatioNextX64)

    if (zeroForOne) {
      returnValues.amountIn =
        max && exactIn
          ? returnValues.amountIn
          : SqrtPriceMath.getAmountADelta(returnValues.sqrtRatioNextX64, sqrtRatioCurrentX64, liquidity, true)
      returnValues.amountOut =
        max && !exactIn
          ? returnValues.amountOut
          : SqrtPriceMath.getAmountBDelta(returnValues.sqrtRatioNextX64, sqrtRatioCurrentX64, liquidity, false)
    } else {
      returnValues.amountIn =
        max && exactIn
          ? returnValues.amountIn
          : SqrtPriceMath.getAmountBDelta(sqrtRatioCurrentX64, returnValues.sqrtRatioNextX64, liquidity, true)
      returnValues.amountOut =
        max && !exactIn
          ? returnValues.amountOut
          : SqrtPriceMath.getAmountADelta(sqrtRatioCurrentX64, returnValues.sqrtRatioNextX64, liquidity, false)
    }

    if (!exactIn && JSBI.greaterThan(returnValues.amountOut!, JSBI.multiply(amountRemaining, NEGATIVE_ONE))) {
      returnValues.amountOut = JSBI.multiply(amountRemaining, NEGATIVE_ONE)
    }

    if (exactIn && JSBI.notEqual(returnValues.sqrtRatioNextX64, sqrtRatioTargetX64)) {
      // we didn't reach the target, so take the remainder of the maximum input as fee
      returnValues.feeAmount = JSBI.subtract(amountRemaining, returnValues.amountIn!)
    } else {
      returnValues.feeAmount = FullMath.mulDivRoundingUp(
        returnValues.amountIn!,
        JSBI.BigInt(feePips),
        JSBI.subtract(MAX_FEE, JSBI.BigInt(feePips))
      )
    }

    return [returnValues.sqrtRatioNextX64!, returnValues.amountIn!, returnValues.amountOut!, returnValues.feeAmount!]
  }
}
