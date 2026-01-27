import { TickList } from "../utils/tickList";
import { Tick, TickConstructorArgs } from "./tick";
import { TickDataProvider } from "./tickDataProvider";

/**
 * A data provider for ticks that is backed by an in-memory array of ticks.
 */
export class TickListDataProvider implements TickDataProvider {
  public ticks: readonly Tick[];
  private _cursorIndex: number = -1;

  constructor(ticks: (Tick | TickConstructorArgs)[], tickSpacing: number) {
    const ticksMapped: Tick[] = ticks.map((t) =>
      t instanceof Tick ? t : new Tick(t)
    );
    TickList.validateList(ticksMapped, tickSpacing);
    this.ticks = ticksMapped;
  }

  getTick(
    tick: number
  ): Tick {
    return TickList.getTick(this.ticks, tick);
  }

  /** Reset cursor for new swap */
  resetCursor(): void {
    this._cursorIndex = -1;
  }

  nextInitializedTickWithinOneWord(
    tick: number,
    lte: boolean,
    tickSpacing: number
  ): [number, boolean] {
    return TickList.nextInitializedTickWithinOneWord(
      this.ticks,
      tick,
      lte,
      tickSpacing
    );
  }

  /** Optimized version with cursor - O(1) for sequential access */
  nextInitializedTickWithinOneWordWithCursor(
    tick: number,
    lte: boolean,
    tickSpacing: number
  ): [number, boolean] {
    const [tickNext, initialized, newCursor] = TickList.nextInitializedTickWithinOneWordWithCursor(
      this.ticks,
      tick,
      lte,
      tickSpacing,
      this._cursorIndex
    );
    this._cursorIndex = newCursor;
    return [tickNext, initialized];
  }

  static toJSON(ticks: Tick[]): object {
    return ticks.map((tick) => Tick.toJSON(tick));
  }

  static fromJSON(ticksArray: any): TickListDataProvider {
    return ticksArray.map(Tick.fromJSON);
  }
}
