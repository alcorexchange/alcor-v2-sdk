import { Token } from "entities/token";

describe("Token", () => {
  const CONTRACT_ONE = "contract1";
  const CONTRACT_TWO = "contract2";

  describe("#constructor", () => {
    it("fails with negative decimals", () => {
      expect(() => new Token(CONTRACT_ONE, -1, "ABC")).toThrow("DECIMALS");
    });
    it("fails with 256 decimals", () => {
      expect(() => new Token(CONTRACT_ONE, 256, "ABC")).toThrow("DECIMALS");
    });
    it("fails with non-integer decimals", () => {
      expect(() => new Token(CONTRACT_ONE, 1.5, "ABC")).toThrow("DECIMALS");
    });
  });

  describe("#equals", () => {
    it("fails if contract differs", () => {
      expect(
        new Token(CONTRACT_ONE, 8, "ABC").equals(
          new Token(CONTRACT_TWO, 8, "ABC")
        )
      ).toBe(false);
    });

    it("true if contract and symbol are the same", () => {
      expect(
        new Token(CONTRACT_ONE, 8, "ABC").equals(
          new Token(CONTRACT_ONE, 8, "ABC")
        )
      ).toBe(true);
    });

    it("true even if name differ", () => {
      const tokenA = new Token(CONTRACT_ONE, 9, "abc", "def");
      const tokenB = new Token(CONTRACT_ONE, 9, "abc", "jkl");
      expect(tokenA.equals(tokenB)).toBe(true);
    });
  });

  describe("#sortsBefore", () => {
    it("correct cases", () => {
      expect(
        new Token('eosio.token', 4, "TLOS").sortsBefore(
          new Token('vapaeetokens', 6, "GUX")
        )
      ).toBe(true);

      expect(
        new Token('vapaeetokens', 0, "SEXCOIN").sortsBefore(
          new Token('vapaeetokens', 0, "PRTYFUN")
        )
      ).toBe(true);
    });
  });
});
