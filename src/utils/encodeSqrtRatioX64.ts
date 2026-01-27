import JSBI from "jsbi";
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
): JSBI {
  const numerator = JSBI.leftShift(JSBI.BigInt(amountB), JSBI.BigInt(128));
  const denominator = JSBI.BigInt(amountA);
  const ratioX128 = JSBI.divide(numerator, denominator);
  return sqrt(ratioX128);
}
