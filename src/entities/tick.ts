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
  public readonly liquidityGross: bigint;
  public readonly liquidityNet: bigint;
  public readonly feeGrowthOutsideAX64: bigint;
  public readonly feeGrowthOutsideBX64: bigint;
  public readonly tickCumulativeOutside: bigint;
  public readonly secondsOutside: bigint;
  public readonly secondsPerLiquidityOutsideX64: bigint;

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
    this.liquidityGross = BigInt(liquidityGross);
    this.liquidityNet = BigInt(liquidityNet);
    this.feeGrowthOutsideAX64 = BigInt(feeGrowthOutsideAX64);
    this.feeGrowthOutsideBX64 = BigInt(feeGrowthOutsideBX64);
    this.tickCumulativeOutside = BigInt(tickCumulativeOutside)
    this.secondsOutside = BigInt(secondsOutside);
    this.secondsPerLiquidityOutsideX64 = BigInt(secondsPerLiquidityOutsideX64);
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
      liquidityGross: BigInt(json.liquidityGross),
      liquidityNet: BigInt(json.liquidityNet),
      feeGrowthOutsideAX64: BigInt(json.feeGrowthOutsideAX64),
      feeGrowthOutsideBX64: BigInt(json.feeGrowthOutsideBX64),
      tickCumulativeOutside: BigInt(json.tickCumulativeOutside),
      secondsOutside: BigInt(json.secondsOutside),
      secondsPerLiquidityOutsideX64: BigInt(json.secondsPerLiquidityOutsideX64),
    });
  }
}
