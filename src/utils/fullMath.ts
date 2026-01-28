
const ZERO = BigInt(0);
const ONE = BigInt(1);

export abstract class FullMath {
  private constructor() {}

  public static mulDivRoundingUp(a: bigint, b: bigint, denominator: bigint): bigint {
    // Early return for zero inputs (most common fast path)
    if ((a === ZERO) || (b === ZERO)) {
      return ZERO;
    }

    // Calculate product and quotient (1 division instead of 2)
    const product = (a * b);
    const quotient = (product / denominator);

    // Round up if there's remainder: check if product !== quotient * denominator
    // This avoids expensive % operation (which is another division internally)
    if ((product !== (quotient * denominator))) {
      return (quotient + ONE);
    }

    return quotient;
  }
}
