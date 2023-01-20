import JSBI from "jsbi";
import { PositionLibrary } from "utils/position";
import { ZERO } from "internalConstants";

describe("PositionLibrary", () => {
  describe("#getTokensOwed", () => {
    it("0", () => {
      const [tokensOwed0, tokensOwed1] = PositionLibrary.getTokensOwed(
        ZERO,
        ZERO,
        ZERO,
        ZERO,
        ZERO
      );
      expect(tokensOwed0).toEqual(ZERO);
      expect(tokensOwed1).toEqual(ZERO);
    });

    it("non-0", () => {
      const [tokensOwed0, tokensOwed1] = PositionLibrary.getTokensOwed(
        ZERO,
        ZERO,
        JSBI.BigInt(1),
        JSBI.exponentiate(JSBI.BigInt(2), JSBI.BigInt(64)),
        JSBI.exponentiate(JSBI.BigInt(2), JSBI.BigInt(64))
      );
      expect(tokensOwed0).toEqual(JSBI.BigInt(1));
      expect(tokensOwed1).toEqual(JSBI.BigInt(1));
    });
  });
});
