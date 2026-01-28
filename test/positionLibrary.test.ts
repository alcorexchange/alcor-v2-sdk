import { PositionLibrary } from "utils/positionLibrary";
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
        BigInt(1),
        (BigInt(2) ** BigInt(64)),
        (BigInt(2) ** BigInt(64))
      );
      expect(tokensOwed0).toEqual(BigInt(1));
      expect(tokensOwed1).toEqual(BigInt(1));
    });
  });
});
