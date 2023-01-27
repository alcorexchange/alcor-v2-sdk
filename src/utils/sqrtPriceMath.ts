import JSBI from "jsbi";
import invariant from "tiny-invariant";
import { ONE, ZERO, Q64, MaxUint128 } from "../internalConstants";
import { FullMath } from "./fullMath";

function multiplyIn128(x: JSBI, y: JSBI): JSBI {
  const product = JSBI.multiply(x, y);
  return JSBI.bitwiseAnd(product, MaxUint128);
}

function addIn128(x: JSBI, y: JSBI): JSBI {
  const sum = JSBI.add(x, y);
  return JSBI.bitwiseAnd(sum, MaxUint128);
}

export abstract class SqrtPriceMath {
  /**
   * Cannot be constructed.
   */
  private constructor() {}

  public static getAmountADelta(
    sqrtRatioLX64: JSBI,
    sqrtRatioUX64: JSBI,
    liquidity: JSBI,
    roundUp: boolean
  ): JSBI {
    if (JSBI.greaterThan(sqrtRatioLX64, sqrtRatioUX64)) {
      [sqrtRatioLX64, sqrtRatioUX64] = [sqrtRatioUX64, sqrtRatioLX64];
    }

    const numerator1 = JSBI.leftShift(liquidity, JSBI.BigInt(64));
    const numerator2 = JSBI.subtract(sqrtRatioUX64, sqrtRatioLX64);

    return roundUp
      ? FullMath.mulDivRoundingUp(
          FullMath.mulDivRoundingUp(numerator1, numerator2, sqrtRatioUX64),
          ONE,
          sqrtRatioLX64
        )
      : JSBI.divide(
          JSBI.divide(JSBI.multiply(numerator1, numerator2), sqrtRatioUX64),
          sqrtRatioLX64
        );
  }

  public static getAmountBDelta(
    sqrtRatioLX64: JSBI,
    sqrtRatioUX64: JSBI,
    liquidity: JSBI,
    roundUp: boolean
  ): JSBI {
    if (JSBI.greaterThan(sqrtRatioLX64, sqrtRatioUX64)) {
      [sqrtRatioLX64, sqrtRatioUX64] = [sqrtRatioUX64, sqrtRatioLX64];
    }

    return roundUp
      ? FullMath.mulDivRoundingUp(
          liquidity,
          JSBI.subtract(sqrtRatioUX64, sqrtRatioLX64),
          Q64
        )
      : JSBI.divide(
          JSBI.multiply(liquidity, JSBI.subtract(sqrtRatioUX64, sqrtRatioLX64)),
          Q64
        );
  }

  public static getNextSqrtPriceFromInput(
    sqrtPX64: JSBI,
    liquidity: JSBI,
    amountIn: JSBI,
    zeroForOne: boolean
  ): JSBI {
    invariant(JSBI.greaterThan(sqrtPX64, ZERO));
    invariant(JSBI.greaterThan(liquidity, ZERO));

    return zeroForOne
      ? this.getNextSqrtPriceFromAmountARoundingUp(
          sqrtPX64,
          liquidity,
          amountIn,
          true
        )
      : this.getNextSqrtPriceFromAmountBRoundingDown(
          sqrtPX64,
          liquidity,
          amountIn,
          true
        );
  }

  public static getNextSqrtPriceFromOutput(
    sqrtPX64: JSBI,
    liquidity: JSBI,
    amountOut: JSBI,
    zeroForOne: boolean
  ): JSBI {
    invariant(JSBI.greaterThan(sqrtPX64, ZERO));
    invariant(JSBI.greaterThan(liquidity, ZERO));

    return zeroForOne
      ? this.getNextSqrtPriceFromAmountBRoundingDown(
          sqrtPX64,
          liquidity,
          amountOut,
          false
        )
      : this.getNextSqrtPriceFromAmountARoundingUp(
          sqrtPX64,
          liquidity,
          amountOut,
          false
        );
  }

  private static getNextSqrtPriceFromAmountARoundingUp(
    sqrtPX64: JSBI,
    liquidity: JSBI,
    amount: JSBI,
    add: boolean
  ): JSBI {
    if (JSBI.equal(amount, ZERO)) return sqrtPX64;
    const numerator1 = JSBI.leftShift(liquidity, JSBI.BigInt(64));

    if (add) {
      let product = multiplyIn128(amount, sqrtPX64);
      if (JSBI.equal(JSBI.divide(product, amount), sqrtPX64)) {
        const denominator = addIn128(numerator1, product);
        if (JSBI.greaterThanOrEqual(denominator, numerator1)) {
          return FullMath.mulDivRoundingUp(numerator1, sqrtPX64, denominator);
        }
      }

      return FullMath.mulDivRoundingUp(
        numerator1,
        ONE,
        JSBI.add(JSBI.divide(numerator1, sqrtPX64), amount)
      );
    } else {
      let product = multiplyIn128(amount, sqrtPX64);

      invariant(JSBI.equal(JSBI.divide(product, amount), sqrtPX64));
      invariant(JSBI.greaterThan(numerator1, product));
      const denominator = JSBI.subtract(numerator1, product);
      return FullMath.mulDivRoundingUp(numerator1, sqrtPX64, denominator);
    }
  }

  private static getNextSqrtPriceFromAmountBRoundingDown(
    sqrtPX64: JSBI,
    liquidity: JSBI,
    amount: JSBI,
    add: boolean
  ): JSBI {
    if (add) {
      const quotient = JSBI.lessThanOrEqual(amount, MaxUint128)
        ? JSBI.divide(JSBI.leftShift(amount, JSBI.BigInt(64)), liquidity)
        : JSBI.divide(JSBI.multiply(amount, Q64), liquidity);

      return JSBI.add(sqrtPX64, quotient);
    } else {
      const quotient = FullMath.mulDivRoundingUp(amount, Q64, liquidity);

      invariant(JSBI.greaterThan(sqrtPX64, quotient));
      return JSBI.subtract(sqrtPX64, quotient);
    }
  }
}
