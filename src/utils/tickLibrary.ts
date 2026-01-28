import { BigintIsh, ZERO, Q256, Q128 } from "../internalConstants";

interface FeeGrowthOutside {
  feeGrowthOutsideAX64: bigint;
  feeGrowthOutsideBX64: bigint;
}

export function subIn256(x: bigint, y: bigint): bigint {
  const difference = (x - y);

  if ((difference < ZERO)) {
    return (Q256 + difference);
  } else {
    return difference;
  }
}

export function subIn128(x: bigint, y: bigint): bigint {
  const difference = (x - y);

  if ((difference < ZERO)) {
    return (Q128 + difference);
  } else {
    return difference;
  }
}

export abstract class TickLibrary {
  /**
   * Cannot be constructed.
   */
  private constructor() {}

  public static getFeeGrowthInside(
    feeGrowthOutsideLower: FeeGrowthOutside,
    feeGrowthOutsideUpper: FeeGrowthOutside,
    tickLower: number,
    tickUpper: number,
    tickCurrent: number,
    feeGrowthGlobalAX64: bigint,
    feeGrowthGlobalBX64: bigint
  ) {
    let feeGrowthBelowAX64: bigint;
    let feeGrowthBelowBX64: bigint;
    if (tickCurrent >= tickLower) {
      feeGrowthBelowAX64 = feeGrowthOutsideLower.feeGrowthOutsideAX64;
      feeGrowthBelowBX64 = feeGrowthOutsideLower.feeGrowthOutsideBX64;
    } else {
      feeGrowthBelowAX64 = subIn128(
        feeGrowthGlobalAX64,
        feeGrowthOutsideLower.feeGrowthOutsideAX64
      );

      feeGrowthBelowBX64 = subIn128(
        feeGrowthGlobalBX64,
        feeGrowthOutsideLower.feeGrowthOutsideBX64
      );
    }

    let feeGrowthAboveAX64: bigint;
    let feeGrowthAboveBX64: bigint;
    if (tickCurrent < tickUpper) {
      feeGrowthAboveAX64 = feeGrowthOutsideUpper.feeGrowthOutsideAX64;
      feeGrowthAboveBX64 = feeGrowthOutsideUpper.feeGrowthOutsideBX64;
    } else {
      feeGrowthAboveAX64 = subIn128(
        feeGrowthGlobalAX64,
        feeGrowthOutsideUpper.feeGrowthOutsideAX64
      );
      feeGrowthAboveBX64 = subIn128(
        feeGrowthGlobalBX64,
        feeGrowthOutsideUpper.feeGrowthOutsideBX64
      );
    }

    return [
      subIn128(
        subIn128(feeGrowthGlobalAX64, feeGrowthBelowAX64),
        feeGrowthAboveAX64
      ),
      subIn128(
        subIn128(feeGrowthGlobalBX64, feeGrowthBelowBX64),
        feeGrowthAboveBX64
      ),
    ];
  }
}
