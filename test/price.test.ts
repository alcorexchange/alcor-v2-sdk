import { Token } from "entities/token";
import { CurrencyAmount } from "../src/entities/fractions/currencyAmount";
import { Price } from "../src/entities/fractions/price";

describe("Price", () => {
  const CONTRACT_ZERO = "contracta";
  const CONTRACT_ONE = "contractb";

  const t0 = new Token(CONTRACT_ZERO, 8, "ABC");
  const t0_6 = new Token(CONTRACT_ZERO, 6, "BCD");
  const t1 = new Token(CONTRACT_ONE, 8, "EFG");

  describe("#constructor", () => {
    it("array format works", () => {
      const price = new Price(t0, t1, 1, 54321);
      expect(price.toSignificant(5)).toEqual("54321");
      expect(price.baseCurrency.equals(t0));
      expect(price.quoteCurrency.equals(t1));
    });
    it("object format works", () => {
      const price = new Price({
        baseAmount: CurrencyAmount.fromRawAmount(t0, 1),
        quoteAmount: CurrencyAmount.fromRawAmount(t1, 54321),
      });
      expect(price.toSignificant(5)).toEqual("54321");
      expect(price.baseCurrency.equals(t0));
      expect(price.quoteCurrency.equals(t1));
    });
  });

  describe("#quote", () => {
    it("returns correct value", () => {
      const price = new Price(t0, t1, 1, 5);
      expect(price.quote(CurrencyAmount.fromRawAmount(t0, 10))).toEqual(
        CurrencyAmount.fromRawAmount(t1, 50)
      );
    });
  });

  describe("#toSignificant", () => {
    it("no decimals", () => {
      const p = new Price(t0, t1, 123, 456);
      expect(p.toSignificant(4)).toEqual("3.707");
    });
    it("no decimals flip ratio", () => {
      const p = new Price(t0, t1, 456, 123);
      expect(p.toSignificant(4)).toEqual("0.2697");
    });
    it("with decimal difference", () => {
      const p = new Price(t0_6, t1, 123, 456);
      expect(p.toSignificant(4)).toEqual("0.03707");
    });
    it("with decimal difference flipped", () => {
      const p = new Price(t0_6, t1, 456, 123);
      expect(p.toSignificant(4)).toEqual("0.002697");
    });
    it("with decimal difference flipped base quote flipped", () => {
      const p = new Price(t1, t0_6, 456, 123);
      expect(p.toSignificant(4)).toEqual("26.97");
    });
  });
});
