import JSBI from "jsbi";

const ZERO = JSBI.BigInt(0);
const ONE = JSBI.BigInt(1);

export abstract class FullMath {
  private constructor() {}

  public static mulDivRoundingUp(a: JSBI, b: JSBI, denominator: JSBI): JSBI {
    // Check for division by zero
    if (JSBI.equal(denominator, ZERO)) {
      throw new Error("Division by zero");
    }

    // Early return for zero inputs
    if (JSBI.equal(a, ZERO) || JSBI.equal(b, ZERO)) {
      return ZERO;
    }

    // Early return if denominator is one
    if (JSBI.equal(denominator, ONE)) {
      return JSBI.multiply(a, b);
    }

    // Calculate product, quotient, and remainder
    const product = JSBI.multiply(a, b);
    const quotient = JSBI.divide(product, denominator);
    const remainder = JSBI.remainder(product, denominator);

    // Round up if there’s a non-zero remainder
    if (JSBI.notEqual(remainder, ZERO)) {
      return JSBI.add(quotient, ONE);
    }

    return quotient;
  }
}
