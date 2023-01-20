import JSBI from "jsbi";
import { Q64 } from "internalConstants";
import { encodeSqrtRatioX64 } from "utils/encodeSqrtRatioX64";

describe("#encodeSqrtRatioX64", () => {
  it("1/1", () => {
    expect(encodeSqrtRatioX64(1, 1)).toEqual(Q64);
  });

  it("100/1", () => {
    expect(encodeSqrtRatioX64(100, 1)).toEqual(
      JSBI.BigInt("184467440737095516160")
    );
  });

  it("1/100", () => {
    expect(encodeSqrtRatioX64(1, 100)).toEqual(
      JSBI.BigInt("1844674407370955161")
    );
  });

  it("111/333", () => {
    expect(encodeSqrtRatioX64(111, 333)).toEqual(
      JSBI.BigInt("10650232656628343401")
    );
  });

  it("333/111", () => {
    expect(encodeSqrtRatioX64(333, 111)).toEqual(
      JSBI.BigInt("31950697969885030203")
    );
  });
});
