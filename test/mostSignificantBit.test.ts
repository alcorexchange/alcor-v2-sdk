import { ONE, MaxUint256 } from "internalConstants";
import { mostSignificantBit } from "utils/mostSignificantBit";

describe("mostSignificantBit", () => {
  it("throws for zero", () => {
    expect(() => mostSignificantBit(BigInt(0))).toThrow("ZERO");
  });
  it("correct value for every power of 2", () => {
    for (let i = 1; i < 256; i++) {
      const x = (BigInt(2) ** BigInt(i));
      expect(mostSignificantBit(x)).toEqual(i);
    }
  });
  it("correct value for every power of 2 - 1", () => {
    for (let i = 2; i < 256; i++) {
      const x = ((BigInt(2) ** BigInt(i)) - BigInt(1));
      expect(mostSignificantBit(x)).toEqual(i - 1);
    }
  });

  it("succeeds for MaxUint256", () => {
    expect(mostSignificantBit(MaxUint256)).toEqual(255);
  });

  it("throws for MaxUint256 + 1", () => {
    expect(() => mostSignificantBit((MaxUint256 + ONE))).toThrow("MAX");
  });
});
