import JSBI from "jsbi";
import { ZERO, Q256, Q128 } from "../internalConstants";

interface FeeGrowthOutside {
  feeGrowthOutsideAX64: JSBI;
  feeGrowthOutsideBX64: JSBI;
}

export function subIn256(x: JSBI, y: JSBI): JSBI {
  const difference = JSBI.subtract(x, y);

  if (JSBI.lessThan(difference, ZERO)) {
    return JSBI.add(Q256, difference);
  } else {
    return difference;
  }
}

export function subIn128(x: JSBI, y: JSBI): JSBI {
  const difference = JSBI.subtract(x, y);

  if (JSBI.lessThan(difference, ZERO)) {
    return JSBI.add(Q128, difference);
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
    feeGrowthGlobalAX64: JSBI,
    feeGrowthGlobalBX64: JSBI
  ) {
    let feeGrowthBelowAX64: JSBI;
    let feeGrowthBelowBX64: JSBI;
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

    let feeGrowthAboveAX64: JSBI;
    let feeGrowthAboveBX64: JSBI;
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
