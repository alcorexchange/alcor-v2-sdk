import { sqrt } from "./sqrt";
import { BigintIsh } from "../internalConstants";

/**
 * Returns the sqrt ratio as a Q64.64 corresponding to a given ratio of amountB and amountA
 * @param amountB The numerator amount i.e., the amount of tokenB
 * @param amountA The denominator amount i.e., the amount of tokenA
 * @returns The sqrt ratio
 */

export function encodeSqrtRatioX64(
  amountB: BigintIsh,
  amountA: BigintIsh
): bigint {
  const numerator = (BigInt(amountB) << BigInt(128));
  const denominator = BigInt(amountA);
  const ratioX128 = (numerator / denominator);
  return sqrt(ratioX128);
}
