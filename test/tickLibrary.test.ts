import JSBI from "jsbi";
import { TickLibrary } from "utils/tickLibrary";
import { ZERO } from "internalConstants";

describe("TickLibrary", () => {
  describe("#getFeeGrowthInside", () => {
    it("0", () => {
      const [feeGrowthInsideAX64, feeGrowthInsideBX64] =
        TickLibrary.getFeeGrowthInside(
          {
            feeGrowthOutsideAX64: ZERO,
            feeGrowthOutsideBX64: ZERO,
          },
          {
            feeGrowthOutsideAX64: ZERO,
            feeGrowthOutsideBX64: ZERO,
          },
          -1,
          1,
          0,
          ZERO,
          ZERO
        );
      expect(feeGrowthInsideAX64).toEqual(ZERO);
      expect(feeGrowthInsideBX64).toEqual(ZERO);
    });

    it("non-0, all inside", () => {
      const [feeGrowthInsideAX64, feeGrowthInsideBX64] =
        TickLibrary.getFeeGrowthInside(
          {
            feeGrowthOutsideAX64: ZERO,
            feeGrowthOutsideBX64: ZERO,
          },
          {
            feeGrowthOutsideAX64: ZERO,
            feeGrowthOutsideBX64: ZERO,
          },
          -1,
          1,
          0,
          JSBI.exponentiate(JSBI.BigInt(2), JSBI.BigInt(128)),
          JSBI.exponentiate(JSBI.BigInt(2), JSBI.BigInt(128))
        );
      expect(feeGrowthInsideAX64).toEqual(
        JSBI.exponentiate(JSBI.BigInt(2), JSBI.BigInt(128))
      );
      expect(feeGrowthInsideBX64).toEqual(
        JSBI.exponentiate(JSBI.BigInt(2), JSBI.BigInt(128))
      );
    });

    it("non-0, all outside", () => {
      const [feeGrowthInsideAX64, feeGrowthInsideBX64] =
        TickLibrary.getFeeGrowthInside(
          {
            feeGrowthOutsideAX64: JSBI.exponentiate(
              JSBI.BigInt(2),
              JSBI.BigInt(128)
            ),
            feeGrowthOutsideBX64: JSBI.exponentiate(
              JSBI.BigInt(2),
              JSBI.BigInt(128)
            ),
          },
          {
            feeGrowthOutsideAX64: ZERO,
            feeGrowthOutsideBX64: ZERO,
          },
          -1,
          1,
          0,
          JSBI.exponentiate(JSBI.BigInt(2), JSBI.BigInt(128)),
          JSBI.exponentiate(JSBI.BigInt(2), JSBI.BigInt(128))
        );
      expect(feeGrowthInsideAX64).toEqual(ZERO);
      expect(feeGrowthInsideBX64).toEqual(ZERO);
    });

    it("non-0, some outside", () => {
      const [feeGrowthInsideAX64, feeGrowthInsideBX64] =
        TickLibrary.getFeeGrowthInside(
          {
            feeGrowthOutsideAX64: JSBI.exponentiate(
              JSBI.BigInt(2),
              JSBI.BigInt(127)
            ),
            feeGrowthOutsideBX64: JSBI.exponentiate(
              JSBI.BigInt(2),
              JSBI.BigInt(127)
            ),
          },
          {
            feeGrowthOutsideAX64: ZERO,
            feeGrowthOutsideBX64: ZERO,
          },
          -1,
          1,
          0,
          JSBI.exponentiate(JSBI.BigInt(2), JSBI.BigInt(128)),
          JSBI.exponentiate(JSBI.BigInt(2), JSBI.BigInt(128))
        );
      expect(feeGrowthInsideAX64).toEqual(
        JSBI.exponentiate(JSBI.BigInt(2), JSBI.BigInt(127))
      );
      expect(feeGrowthInsideBX64).toEqual(
        JSBI.exponentiate(JSBI.BigInt(2), JSBI.BigInt(127))
      );
    });
  });
});
