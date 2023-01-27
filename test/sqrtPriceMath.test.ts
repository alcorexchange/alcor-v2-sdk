import { MaxUint128, MaxUint64 } from "internalConstants";
import JSBI from "jsbi";
import { SqrtPriceMath } from "utils/sqrtPriceMath";
import { encodeSqrtRatioX64 } from "utils/encodeSqrtRatioX64";
import { BigNumber } from "ethers";

const expandTo18Decimals = (n) => {
  return BigNumber.from(n).mul(BigNumber.from(10).pow(18));
};

describe("#sqrtPriceMath test", () => {
  describe("getNextSqrtPriceFromInput", () => {
    it("aforB = false", () => {
      const sqrtP = encodeSqrtRatioX64(1, 1);
      const liquidity = expandTo18Decimals(1);
      const amountIn = expandTo18Decimals(1).div(10);
      expect(
        String(
          SqrtPriceMath.getNextSqrtPriceFromInput(
            JSBI.BigInt(sqrtP),
            JSBI.BigInt(liquidity),
            JSBI.BigInt(amountIn),
            false
          )
        )
      ).toEqual("20291418481080506777");
    });

    it("aforB = true", () => {
      const sqrtP = encodeSqrtRatioX64(1, 1);
      const liquidity = expandTo18Decimals(1);
      const amountIn = MaxUint64;
      expect(
        String(
          SqrtPriceMath.getNextSqrtPriceFromInput(
            JSBI.BigInt(sqrtP),
            JSBI.BigInt(liquidity),
            JSBI.BigInt(amountIn),
            true
          )
        )
      ).toEqual("948577510136932367");
    });
  });

  describe("getNextSqrtPriceFromOutput", () => {
    it("aforB = false", () => {
      const sqrtP = encodeSqrtRatioX64(1, 1);
      const liquidity = expandTo18Decimals(1);
      const amountOut = expandTo18Decimals(1).div(10);
      expect(
        String(
          SqrtPriceMath.getNextSqrtPriceFromOutput(
            JSBI.BigInt(sqrtP),
            JSBI.BigInt(liquidity),
            JSBI.BigInt(amountOut),
            false
          )
        )
      ).toEqual("20496382304121724018");
    });

    it("aforB = true", () => {
      const sqrtP = encodeSqrtRatioX64(1, 1);
      const liquidity = expandTo18Decimals(1);
      const amountOut = expandTo18Decimals(1).div(10);
      expect(
        String(
          SqrtPriceMath.getNextSqrtPriceFromOutput(
            JSBI.BigInt(sqrtP),
            JSBI.BigInt(liquidity),
            JSBI.BigInt(amountOut),
            true
          )
        )
      ).toEqual("16602069666338596454");
    });
  });

  describe("getAmountDelta", () => {
    it("getAmountADelta", () => {
      const sqrtRatioLX64 = encodeSqrtRatioX64(1, 1);
      const sqrtRatioUX64 = encodeSqrtRatioX64(121, 100);
      const liquidity = expandTo18Decimals(1);
      expect(
        String(
          SqrtPriceMath.getAmountADelta(
            JSBI.BigInt(sqrtRatioLX64),
            JSBI.BigInt(sqrtRatioUX64),
            JSBI.BigInt(liquidity),
            true
          )
        )
      ).toEqual("90909090909090910");
    });

    it("getAmountBDelta", () => {
      const sqrtRatioLX64 = encodeSqrtRatioX64(1, 1);
      const sqrtRatioUX64 = encodeSqrtRatioX64(121, 100);
      const liquidity = expandTo18Decimals(1);
      expect(
        String(
          SqrtPriceMath.getAmountBDelta(
            JSBI.BigInt(sqrtRatioLX64),
            JSBI.BigInt(sqrtRatioUX64),
            JSBI.BigInt(liquidity),
            true
          )
        )
      ).toEqual("100000000000000000");
    });
  });
});
