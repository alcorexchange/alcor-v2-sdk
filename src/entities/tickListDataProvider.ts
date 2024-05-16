import { TickList } from "../utils/tickList";
import { Tick, TickConstructorArgs } from "./tick";
import { TickDataProvider } from "./tickDataProvider";

/**
 * A data provider for ticks that is backed by an in-memory array of ticks.
 */
export class TickListDataProvider implements TickDataProvider {
  public ticks: readonly Tick[];

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

  static toJSON(ticks: Tick[]): object {
    return ticks.map((tick) => Tick.toJSON(tick));
  }

  static fromJSON(ticksArray: any): TickListDataProvider {
    return ticksArray.map(Tick.fromJSON);
  }
}
