import { Q64, BigintIsh } from "../internalConstants";

/**
 * Returns an imprecise maximum amount of liquidity received for a given amount of token 0.
 * This function is available to accommodate LiquidityAmounts#getLiquidityForAmountA in the v3 periphery,
 * which could be more precise by at least 32 bits by dividing by Q64 instead of Q64 in the intermediate step,
 * and shifting the subtracted ratio left by 32 bits. This imprecise calculation will likely be replaced in a future
 * v3 router contract.
 * @param sqrtRatioLX64 The price at the lower boundary
 * @param sqrtRatioUX64 The price at the upper boundary
 * @param amountA The token0 amount
 * @returns liquidity for amountA, imprecise
 */
function maxLiquidityForAmountAImprecise(
  sqrtRatioLX64: bigint,
  sqrtRatioUX64: bigint,
  amountA: BigintIsh
): bigint {
  if ((sqrtRatioLX64 > sqrtRatioUX64)) {
    [sqrtRatioLX64, sqrtRatioUX64] = [sqrtRatioUX64, sqrtRatioLX64];
  }
  const intermediate = ((sqrtRatioLX64 * sqrtRatioUX64) / Q64);
  return ((BigInt(amountA) * intermediate) / (sqrtRatioUX64 - sqrtRatioLX64));
}

/**
 * Returns a precise maximum amount of liquidity received for a given amount of token 0 by dividing by Q64 instead of Q64 in the intermediate step,
 * and shifting the subtracted ratio left by 32 bits.
 * @param sqrtRatioLX64 The price at the lower boundary
 * @param sqrtRatioUX64 The price at the upper boundary
 * @param amountA The token0 amount
 * @returns liquidity for amountA, precise
 */
function maxLiquidityForAmountAPrecise(
  sqrtRatioLX64: bigint,
  sqrtRatioUX64: bigint,
  amountA: BigintIsh
): bigint {
  if ((sqrtRatioLX64 > sqrtRatioUX64)) {
    [sqrtRatioLX64, sqrtRatioUX64] = [sqrtRatioUX64, sqrtRatioLX64];
  }

  const numerator = ((BigInt(amountA) * sqrtRatioLX64) * sqrtRatioUX64);
  const denominator = (Q64 * (sqrtRatioUX64 - sqrtRatioLX64));

  return (numerator / denominator);
}

/**
 * Computes the maximum amount of liquidity received for a given amount of token1
 * @param sqrtRatioLX64 The price at the lower tick boundary
 * @param sqrtRatioUX64 The price at the upper tick boundary
 * @param amountB The token1 amount
 * @returns liquidity for amountB
 */
function maxLiquidityForAmountB(
  sqrtRatioLX64: bigint,
  sqrtRatioUX64: bigint,
  amountB: BigintIsh
): bigint {
  if ((sqrtRatioLX64 > sqrtRatioUX64)) {
    [sqrtRatioLX64, sqrtRatioUX64] = [sqrtRatioUX64, sqrtRatioLX64];
  }
  return ((BigInt(amountB) * Q64) / (sqrtRatioUX64 - sqrtRatioLX64));
}

/**
 * Computes the maximum amount of liquidity received for a given amount of token0, token1,
 * and the prices at the tick boundaries.
 * @param sqrtRatioCurrentX64 the current price
 * @param sqrtRatioLX64 price at lower boundary
 * @param sqrtRatioUX64 price at upper boundary
 * @param amountA token0 amount
 * @param amountB token1 amount
 * @param useFullPrecision if false, liquidity will be maximized according to what the router can calculate,
 * not what core can theoretically support
 */
export function maxLiquidityForAmounts(
  sqrtRatioCurrentX64: bigint,
  sqrtRatioLX64: bigint,
  sqrtRatioUX64: bigint,
  amountA: BigintIsh,
  amountB: BigintIsh,
  useFullPrecision: boolean
): bigint {
  if ((sqrtRatioLX64 > sqrtRatioUX64)) {
    [sqrtRatioLX64, sqrtRatioUX64] = [sqrtRatioUX64, sqrtRatioLX64];
  }

  const maxLiquidityForAmountA = useFullPrecision
    ? maxLiquidityForAmountAPrecise
    : maxLiquidityForAmountAImprecise;

  if ((sqrtRatioCurrentX64 <= sqrtRatioLX64)) {
    return maxLiquidityForAmountA(sqrtRatioLX64, sqrtRatioUX64, amountA);
  } else if ((sqrtRatioCurrentX64 < sqrtRatioUX64)) {
    const liquidityA = maxLiquidityForAmountA(
      sqrtRatioCurrentX64,
      sqrtRatioUX64,
      amountA
    );
    const liquidityB = maxLiquidityForAmountB(
      sqrtRatioLX64,
      sqrtRatioCurrentX64,
      amountB
    );
    return (liquidityA < liquidityB) ? liquidityA : liquidityB;
  } else {
    return maxLiquidityForAmountB(sqrtRatioLX64, sqrtRatioUX64, amountB);
  }
}
