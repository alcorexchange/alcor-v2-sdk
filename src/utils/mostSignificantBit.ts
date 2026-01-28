import invariant from "tiny-invariant";
import { ZERO, MaxUint256 } from "../internalConstants";

const TWO = BigInt(2);
const POWERS_OF_2 = [128, 64, 32, 16, 8, 4, 2, 1].map(
  (pow: number): [number, bigint] => [
    pow,
    (TWO ** BigInt(pow)),
  ]
);

export function mostSignificantBit(x: bigint): number {
  invariant((x > ZERO), "ZERO");
  invariant((x <= MaxUint256), "MAX");

  let msb: number = 0;
  for (const [power, min] of POWERS_OF_2) {
    if ((x >= min)) {
      x = (x >> BigInt(power));
      msb += power;
    }
  }
  return msb;
}
