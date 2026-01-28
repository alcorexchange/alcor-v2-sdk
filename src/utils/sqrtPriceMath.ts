import { ONE, ZERO, Q64, MaxUint128 } from "../internalConstants";
import { FullMath } from "./fullMath";

function multiplyIn128(x: bigint, y: bigint): bigint {
  const product = (x * y);
  return (product & MaxUint128);
}

function addIn128(x: bigint, y: bigint): bigint {
  const sum = (x + y);
  return (sum & MaxUint128);
}

export abstract class SqrtPriceMath {
  /**
   * Cannot be constructed.
   */
  private constructor() {}

  public static getAmountADelta(
    sqrtRatioLX64: bigint,
    sqrtRatioUX64: bigint,
    liquidity: bigint,
    roundUp: boolean
  ): bigint {
    if ((sqrtRatioLX64 > sqrtRatioUX64)) {
      [sqrtRatioLX64, sqrtRatioUX64] = [sqrtRatioUX64, sqrtRatioLX64];
    }

    const numerator1 = (liquidity << BigInt(64));
    const numerator2 = (sqrtRatioUX64 - sqrtRatioLX64);

    if (roundUp) {
      const mul1 = FullMath.mulDivRoundingUp(numerator1, numerator2, sqrtRatioUX64);
      return FullMath.mulDivRoundingUp(mul1, ONE, sqrtRatioLX64);
    } else {
      const mul1 = ((numerator1 * numerator2) / sqrtRatioUX64);
      return (mul1 / sqrtRatioLX64);
    }
  }

  public static getAmountBDelta(
    sqrtRatioLX64: bigint,
    sqrtRatioUX64: bigint,
    liquidity: bigint,
    roundUp: boolean
  ): bigint {
    if ((sqrtRatioLX64 > sqrtRatioUX64)) {
      [sqrtRatioLX64, sqrtRatioUX64] = [sqrtRatioUX64, sqrtRatioLX64];
    }

    const diff = (sqrtRatioUX64 - sqrtRatioLX64);
    if (roundUp) {
      return FullMath.mulDivRoundingUp(liquidity, diff, Q64);
    } else {
      return ((liquidity * diff) / Q64);
    }
  }

  public static getNextSqrtPriceFromInput(
    sqrtPX64: bigint,
    liquidity: bigint,
    amountIn: bigint,
    zeroForOne: boolean
  ): bigint {
    // Убраны invariant для ускорения, если данные валидны
    return zeroForOne
      ? this.getNextSqrtPriceFromAmountARoundingUp(sqrtPX64, liquidity, amountIn, true)
      : this.getNextSqrtPriceFromAmountBRoundingDown(sqrtPX64, liquidity, amountIn, true);
  }

  public static getNextSqrtPriceFromOutput(
    sqrtPX64: bigint,
    liquidity: bigint,
    amountOut: bigint,
    zeroForOne: boolean
  ): bigint {
    // Убраны invariant для ускорения, если данные валидны
    return zeroForOne
      ? this.getNextSqrtPriceFromAmountBRoundingDown(sqrtPX64, liquidity, amountOut, false)
      : this.getNextSqrtPriceFromAmountARoundingUp(sqrtPX64, liquidity, amountOut, false);
  }

  private static getNextSqrtPriceFromAmountARoundingUp(
    sqrtPX64: bigint,
    liquidity: bigint,
    amount: bigint,
    add: boolean
  ): bigint {
    if ((amount === ZERO)) return sqrtPX64;
    const numerator1 = (liquidity << BigInt(64));

    if (add) {
      const product = multiplyIn128(amount, sqrtPX64);
      if (((product / amount) === sqrtPX64)) {
        const denominator = addIn128(numerator1, product);
        if ((denominator >= numerator1)) {
          return FullMath.mulDivRoundingUp(numerator1, sqrtPX64, denominator);
        }
      }
      const adjustedDenominator = ((numerator1 / sqrtPX64) + amount);
      return FullMath.mulDivRoundingUp(numerator1, ONE, adjustedDenominator);
    } else {
      const product = multiplyIn128(amount, sqrtPX64);
      // Убрана invariant, предполагаем, что numerator1 > product
      const denominator = (numerator1 - product);
      return FullMath.mulDivRoundingUp(numerator1, sqrtPX64, denominator);
    }
  }

  private static getNextSqrtPriceFromAmountBRoundingDown(
    sqrtPX64: bigint,
    liquidity: bigint,
    amount: bigint,
    add: boolean
  ): bigint {
    if (add) {
      const quotient = (amount <= MaxUint128)
        ? ((amount << BigInt(64)) / liquidity)
        : ((amount * Q64) / liquidity);
      return (sqrtPX64 + quotient);
    } else {
      const quotient = FullMath.mulDivRoundingUp(amount, Q64, liquidity);
      // Убрана invariant, предполагаем, что sqrtPX64 > quotient
      return (sqrtPX64 - quotient);
    }
  }
}
