import JSBI from "jsbi";

const ZERO = JSBI.BigInt(0);
const ONE = JSBI.BigInt(1);

export abstract class FullMath {
  private constructor() {}

  public static mulDivRoundingUp(a: JSBI, b: JSBI, denominator: JSBI): JSBI {
    // Early return for zero inputs (most common fast path)
    if (JSBI.equal(a, ZERO) || JSBI.equal(b, ZERO)) {
      return ZERO;
    }

    // Calculate product and quotient (1 division instead of 2)
    const product = JSBI.multiply(a, b);
    const quotient = JSBI.divide(product, denominator);

    // Round up if there's remainder: check if product !== quotient * denominator
    // This avoids expensive % operation (which is another division internally)
    if (JSBI.notEqual(product, JSBI.multiply(quotient, denominator))) {
      return JSBI.add(quotient, ONE);
    }

    return quotient;
  }
}
