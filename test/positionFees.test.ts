import { Token } from "entities/token";
import { FeeAmount } from "internalConstants";
import { encodeSqrtRatioX64 } from "utils/encodeSqrtRatioX64";
import { TickMath } from "utils/tickMath";
import { Pool } from "entities/pool";
import { Position } from "entities/position";

describe("Position.getFees", () => {
  const USDC = new Token("wrap.alcor", 6, "USDC");
  const USDT = new Token("wrap.alcor", 6, "USDT");
  const SQRT_PRICE = encodeSqrtRatioX64(1, 1);

  // No initialized ticks at all: whatever a position points at is gone.
  const POOL = new Pool({
    tokenA: USDC,
    tokenB: USDT,
    fee: FeeAmount.LOWEST,
    sqrtPriceX64: SQRT_PRICE,
    liquidity: 0,
    tickCurrent: TickMath.getTickAtSqrtRatio(SQRT_PRICE),
    ticks: [],
  });

  it("returns stored fees of a withdrawn position without reading its ticks", async () => {
    const position = new Position({
      pool: POOL,
      liquidity: 0,
      tickLower: 3,
      tickUpper: 52,
      feeGrowthInsideALastX64: "2800767659379",
      feeGrowthInsideBLastX64: "2801551784381",
      feesA: 34505,
      feesB: 34514,
    });

    const { feesA, feesB } = await position.getFees();
    expect(feesA.quotient).toEqual(BigInt(34505));
    expect(feesB.quotient).toEqual(BigInt(34514));
  });

  it("returns zero for an empty position", async () => {
    const position = new Position({ pool: POOL, liquidity: 0, tickLower: 3, tickUpper: 52 });

    const { feesA, feesB } = await position.getFees();
    expect(feesA.quotient).toEqual(BigInt(0));
    expect(feesB.quotient).toEqual(BigInt(0));
  });
});
