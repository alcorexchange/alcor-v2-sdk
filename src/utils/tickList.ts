import JSBI from "jsbi";
import invariant from "tiny-invariant";
import { Tick } from "../entities/tick";
import { ZERO } from "../internalConstants";
import { isSorted } from "./isSorted";

function tickComparator(a: Tick, b: Tick) {
  return a.id - b.id;
}

/**x
 * Utility methods for interacting with sorted lists of ticks
 */
export abstract class TickList {
  /**
   * Cannot be constructed
   */
  private constructor() {}

  public static validateList(ticks: Tick[], tickSpacing: number) {
    invariant(tickSpacing > 0, "TICK_SPACING_NONZERO");
    // ensure ticks are spaced appropriately
    invariant(
      ticks.every(({ id }) => id % tickSpacing === 0),
      "TICK_SPACING"
    );

    const totalNet = ticks.reduce(
      (accumulator, { liquidityNet }) =>
        JSBI.add(accumulator, liquidityNet),
      ZERO
    )

    if (JSBI.greaterThan(totalNet, ZERO)) console.error('ZERO_NET')

    // HOTFIX ignoring for now TODO
    // ensure tick liquidity deltas sum to 0
    // invariant(
    //   JSBI.equal(
    //     ticks.reduce(
    //       (accumulator, { liquidityNet }) =>
    //         JSBI.add(accumulator, liquidityNet),
    //       ZERO
    //     ),
    //     ZERO
    //   ),
    //   "ZERO_NET"
    // );

    invariant(isSorted(ticks, tickComparator), "SORTED");
  }

  public static isBelowSmallest(ticks: readonly Tick[], tick: number): boolean {
    invariant(ticks.length > 0, "LENGTH");
    return tick < ticks[0].id;
  }

  public static isAtOrAboveLargest(
    ticks: readonly Tick[],
    tick: number
  ): boolean {
    invariant(ticks.length > 0, "LENGTH");
    return tick >= ticks[ticks.length - 1].id;
  }

  public static getTick(ticks: readonly Tick[], id: number): Tick {
    const tick = ticks[this.binarySearch(ticks, id)];
    invariant(tick.id === id, "NOT_CONTAINED");
    return tick;
  }

  /**
   * Finds the largest tick in the list of ticks that is less than or equal to tick
   * @param ticks list of ticks
   * @param tick tick to find the largest tick that is less than or equal to tick
   * @private
   */
  private static binarySearch(ticks: readonly Tick[], tick: number): number {
    invariant(!this.isBelowSmallest(ticks, tick), "BELOW_SMALLEST");

    let l = 0;
    let r = ticks.length - 1;
    let i;
    while (true) {
      i = Math.floor((l + r) / 2);

      if (
        ticks[i].id <= tick &&
        (i === ticks.length - 1 || ticks[i + 1].id > tick)
      ) {
        return i;
      }

      if (ticks[i].id < tick) {
        l = i + 1;
      } else {
        r = i - 1;
      }
    }
  }

  public static nextInitializedTick(
    ticks: readonly Tick[],
    tick: number,
    lte: boolean
  ): Tick {
    if (lte) {
      invariant(!TickList.isBelowSmallest(ticks, tick), "BELOW_SMALLEST");
      if (TickList.isAtOrAboveLargest(ticks, tick)) {
        return ticks[ticks.length - 1];
      }
      const id = this.binarySearch(ticks, tick);
      return ticks[id];
    } else {
      invariant(!this.isAtOrAboveLargest(ticks, tick), "AT_OR_ABOVE_LARGEST");
      if (this.isBelowSmallest(ticks, tick)) {
        return ticks[0];
      }
      const id = this.binarySearch(ticks, tick);
      return ticks[id + 1];
    }
  }

  public static nextInitializedTickWithinOneWord(
    ticks: readonly Tick[],
    tick: number,
    lte: boolean,
    tickSpacing: number
  ): [number, boolean] {
    const compressed = Math.floor(tick / tickSpacing); // matches rounding in the code

    if (lte) {
      const wordPos = compressed >> 7;
      const minimum = (wordPos << 7) * tickSpacing;

      if (TickList.isBelowSmallest(ticks, tick)) {
        return [minimum, false];
      }

      const id = TickList.nextInitializedTick(ticks, tick, lte).id;
      const nextInitializedTick = Math.max(minimum, id);
      return [nextInitializedTick, nextInitializedTick === id];
    } else {
      const wordPos = (compressed + 1) >> 7;
      const maximum = (((wordPos + 1) << 7) - 1) * tickSpacing;

      if (this.isAtOrAboveLargest(ticks, tick)) {
        return [maximum, false];
      }

      const id = this.nextInitializedTick(ticks, tick, lte).id;
      const nextInitializedTick = Math.min(maximum, id);
      return [nextInitializedTick, nextInitializedTick === id];
    }
  }
}
