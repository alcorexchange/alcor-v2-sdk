import JSBI from "jsbi";
import invariant from "tiny-invariant";
import { BigintIsh } from "../internalConstants";
import { TickMath } from "../utils/tickMath";

export interface TickConstructorArgs {
  id: number;
  liquidityGross: BigintIsh;
  liquidityNet: BigintIsh;
  feeGrowthOutsideAX64: BigintIsh;
  feeGrowthOutsideBX64: BigintIsh;
  tickCumulativeOutside: BigintIsh;
  secondsPerLiquidityOutsideX64: BigintIsh;
  secondsOutside: BigintIsh;
}

export class Tick {
  public readonly id: number;
  public readonly liquidityGross: JSBI;
  public readonly liquidityNet: JSBI;
  public readonly feeGrowthOutsideAX64: JSBI;
  public readonly feeGrowthOutsideBX64: JSBI;
  public readonly tickCumulativeOutside: JSBI;
  public readonly secondsOutside: JSBI;
  public readonly secondsPerLiquidityOutsideX64: JSBI;

  constructor({
    id,
    liquidityGross,
    liquidityNet,
    feeGrowthOutsideAX64 = 0,
    feeGrowthOutsideBX64 = 0,
    tickCumulativeOutside = 0,
    secondsOutside = 0,
    secondsPerLiquidityOutsideX64 = 0,
  }: TickConstructorArgs) {
    invariant(id >= TickMath.MIN_TICK && id <= TickMath.MAX_TICK, "TICK");

    this.id = id;
    this.liquidityGross = JSBI.BigInt(liquidityGross);
    this.liquidityNet = JSBI.BigInt(liquidityNet);
    this.feeGrowthOutsideAX64 = JSBI.BigInt(feeGrowthOutsideAX64);
    this.feeGrowthOutsideBX64 = JSBI.BigInt(feeGrowthOutsideBX64);
    this.tickCumulativeOutside = JSBI.BigInt(tickCumulativeOutside)
    this.secondsOutside = JSBI.BigInt(secondsOutside);
    this.secondsPerLiquidityOutsideX64 = JSBI.BigInt(secondsPerLiquidityOutsideX64);
  }

  static toJSON(tick: Tick): object {
    return {
      id: tick.id,
      liquidityGross: tick.liquidityGross.toString(),
      liquidityNet: tick.liquidityNet.toString(),
      feeGrowthOutsideAX64: tick.feeGrowthOutsideAX64.toString(),
      feeGrowthOutsideBX64: tick.feeGrowthOutsideBX64.toString(),
      tickCumulativeOutside: tick.tickCumulativeOutside.toString(),
      secondsOutside: tick.secondsOutside.toString(),
      secondsPerLiquidityOutsideX64: tick.secondsPerLiquidityOutsideX64.toString(),
    }
  }

  static fromJSON(json: any): Tick {
    return new Tick({
      id: json.id,
      liquidityGross: JSBI.BigInt(json.liquidityGross),
      liquidityNet: JSBI.BigInt(json.liquidityNet),
      feeGrowthOutsideAX64: JSBI.BigInt(json.feeGrowthOutsideAX64),
      feeGrowthOutsideBX64: JSBI.BigInt(json.feeGrowthOutsideBX64),
      tickCumulativeOutside: JSBI.BigInt(json.tickCumulativeOutside),
      secondsOutside: JSBI.BigInt(json.secondsOutside),
      secondsPerLiquidityOutsideX64: JSBI.BigInt(json.secondsPerLiquidityOutsideX64),
    });
  }
}
