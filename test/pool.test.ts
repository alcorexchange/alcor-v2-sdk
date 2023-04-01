import { Token } from "entities/token";
import { CurrencyAmount } from "entities/fractions/currencyAmount";
import { FeeAmount, TICK_SPACINGS } from "internalConstants";
import { nearestUsableTick } from "utils/nearestUsableTick";
import { TickMath } from "utils/tickMath";
import { Pool } from "entities/pool";
import { encodeSqrtRatioX64 } from "utils/encodeSqrtRatioX64";
import JSBI from "jsbi";
import { NEGATIVE_ONE } from "internalConstants";

const ONE_ETHER = JSBI.exponentiate(JSBI.BigInt(10), JSBI.BigInt(18));

describe("Pool", () => {
  const USDC = new Token("contractb", 6, "USDC", "USD Coin");
  const DAI = new Token("contracta", 18, "DAI", "DAI Stablecoin");
  const WETH = new Token("contracta", 18, "WETH", "Wrapped Ethereum");

  describe("constructor", () => {
    it("fee must be integer", () => {
      expect(() => {
        new Pool({
          tokenA: USDC,
          tokenB: DAI,
          fee: FeeAmount.MEDIUM + 0.5,
          sqrtPriceX64: encodeSqrtRatioX64(1, 1),
          liquidity: 0,
          tickCurrent: 0,
          ticks: []
        });
      }).toThrow("FEE");
    });

    it("fee cannot be more than 1e6", () => {
      expect(() => {
        new Pool({
          tokenA: USDC,
          tokenB: DAI,
          fee: 1e6,
          sqrtPriceX64: encodeSqrtRatioX64(1, 1),
          liquidity: 0,
          tickCurrent: 0,
          ticks: []
        });
      }).toThrow("FEE");
    });

    it("cannot be given two of the same token", () => {
      expect(() => {
        new Pool({
          tokenA: USDC,
          tokenB: USDC,
          fee: FeeAmount.MEDIUM,
          sqrtPriceX64: encodeSqrtRatioX64(1, 1),
          liquidity: 0,
          tickCurrent: 0,
          ticks: []
        });
      }).toThrow("SYMBOLS");
    });

    it("price must be within tick price bounds", () => {
      expect(() => {
        new Pool({
          tokenA: USDC,
          tokenB: DAI,
          fee: FeeAmount.MEDIUM,
          sqrtPriceX64: encodeSqrtRatioX64(1, 1),
          liquidity: 0,
          tickCurrent: 1,
          ticks: []
        });
      }).toThrow("PRICE_BOUNDS");
      expect(() => {
        new Pool({
          tokenA: USDC,
          tokenB: DAI,
          fee: FeeAmount.MEDIUM,
          sqrtPriceX64: JSBI.add(encodeSqrtRatioX64(1, 1), JSBI.BigInt(1)),
          liquidity: 0,
          tickCurrent: -1,
          ticks: []
        });
      }).toThrow("PRICE_BOUNDS");
    });

    it("works with valid arguments for empty pool medium fee", () => {
      new Pool({
        tokenA: USDC,
        tokenB: DAI,
        fee: FeeAmount.MEDIUM,
        sqrtPriceX64: encodeSqrtRatioX64(1, 1),
        liquidity: 0,
        tickCurrent: 0,
        ticks: []
      });
    });

    it("works with valid arguments for empty pool low fee", () => {
      new Pool({
        tokenA: USDC,
        tokenB: DAI,
        fee: FeeAmount.LOW,
        sqrtPriceX64: encodeSqrtRatioX64(1, 1),
        liquidity: 0,
        tickCurrent: 0,
        ticks: []
      });
    });

    it("works with valid arguments for empty pool high fee", () => {
      new Pool({
        tokenA: USDC,
        tokenB: DAI,
        fee: FeeAmount.HIGH,
        sqrtPriceX64: encodeSqrtRatioX64(1, 1),
        liquidity: 0,
        tickCurrent: 0,
        ticks: []
      });
    });
  });

  describe("#tokenA", () => {
    it("always is the token that sorts before", () => {
      let pool = new Pool({
        tokenA: USDC,
        tokenB: DAI,
        fee: FeeAmount.LOW,
        sqrtPriceX64: encodeSqrtRatioX64(1, 1),
        liquidity: 0,
        tickCurrent: 0,
        ticks: []
      });
      expect(pool.tokenA).toEqual(DAI);
      pool = new Pool({
        tokenA: DAI,
        tokenB: USDC,
        fee: FeeAmount.LOW,
        sqrtPriceX64: encodeSqrtRatioX64(1, 1),
        liquidity: 0,
        tickCurrent: 0,
        ticks: []
      });
      expect(pool.tokenA).toEqual(DAI);
    });
  });
  describe("#tokenB", () => {
    it("always is the token that sorts after", () => {
      let pool = new Pool({
        tokenA: USDC,
        tokenB: DAI,
        fee: FeeAmount.LOW,
        sqrtPriceX64: encodeSqrtRatioX64(1, 1),
        liquidity: 0,
        tickCurrent: 0,
        ticks: []
      });
      expect(pool.tokenB).toEqual(USDC);
      pool = new Pool({
        tokenA: DAI,
        tokenB: USDC,
        fee: FeeAmount.LOW,
        sqrtPriceX64: encodeSqrtRatioX64(1, 1),
        liquidity: 0,
        tickCurrent: 0,
        ticks: []
      });
      expect(pool.tokenB).toEqual(USDC);
    });
  });

  describe("#tokenAPrice", () => {
    it("returns price of tokenA in terms of tokenB", () => {
      expect(
        new Pool({
          tokenA: USDC,
          tokenB: DAI,
          fee: FeeAmount.LOW,
          sqrtPriceX64: encodeSqrtRatioX64(101e6, 100e18),
          liquidity: 0,
          tickCurrent: TickMath.getTickAtSqrtRatio(encodeSqrtRatioX64(101e6, 100e18)),
          ticks: []
        }).tokenAPrice.toSignificant(5)
      ).toEqual("1.01");
      expect(
        new Pool({
          tokenA: DAI,
          tokenB: USDC,
          fee: FeeAmount.LOW,
          sqrtPriceX64: encodeSqrtRatioX64(101e6, 100e18),
          liquidity: 0,
          tickCurrent: TickMath.getTickAtSqrtRatio(encodeSqrtRatioX64(101e6, 100e18)),
          ticks: []
        }).tokenAPrice.toSignificant(5)
      ).toEqual("1.01");
    });
  });

  describe("#tokenBPrice", () => {
    it("returns price of tokenB in terms of tokenA", () => {
      expect(
        new Pool({
          tokenA: USDC,
          tokenB: DAI,
          fee: FeeAmount.LOW,
          sqrtPriceX64: encodeSqrtRatioX64(101e6, 100e18),
          liquidity: 0,
          tickCurrent: TickMath.getTickAtSqrtRatio(encodeSqrtRatioX64(101e6, 100e18)),
          ticks: []
        }).tokenBPrice.toSignificant(5)
      ).toEqual("0.9901");
      expect(
        new Pool({
          tokenA: DAI,
          tokenB: USDC,
          fee: FeeAmount.LOW,
          sqrtPriceX64: encodeSqrtRatioX64(101e6, 100e18),
          liquidity: 0,
          tickCurrent: TickMath.getTickAtSqrtRatio(encodeSqrtRatioX64(101e6, 100e18)),
          ticks: []
        }).tokenBPrice.toSignificant(5)
      ).toEqual("0.9901");
    });
  });

  describe("#priceOf", () => {
    const pool = new Pool({
      tokenA: USDC,
      tokenB: DAI,
      fee: FeeAmount.LOW,
      sqrtPriceX64: encodeSqrtRatioX64(1, 1),
      liquidity: 0,
      tickCurrent: 0,
      ticks: []
    });
    it("returns price of token in terms of other token", () => {
      expect(pool.priceOf(DAI)).toEqual(pool.tokenAPrice);
      expect(pool.priceOf(USDC)).toEqual(pool.tokenBPrice);
    });

    it("throws if invalid token", () => {
      expect(() => pool.priceOf(WETH)).toThrow("TOKEN");
    });
  });

  describe("#involvesToken", () => {
    const pool = new Pool({
      tokenA: USDC,
      tokenB: DAI,
      fee: FeeAmount.LOW,
      sqrtPriceX64: encodeSqrtRatioX64(1, 1),
      liquidity: 0,
      tickCurrent: 0,
      ticks: []
    });
    expect(pool.involvesToken(USDC)).toEqual(true);
    expect(pool.involvesToken(DAI)).toEqual(true);
  });

  describe("swaps", () => {
    let pool: Pool;

    beforeEach(() => {
      pool = new Pool({
        tokenA: USDC,
        tokenB: DAI,
        fee: FeeAmount.LOW,
        sqrtPriceX64: encodeSqrtRatioX64(1, 1),
        liquidity: ONE_ETHER,
        tickCurrent: 0,
        ticks: [
          {
            id: nearestUsableTick(
              TickMath.MIN_TICK,
              TICK_SPACINGS[FeeAmount.LOW]
            ),
            liquidityNet: ONE_ETHER,
            liquidityGross: ONE_ETHER,
          },
          {
            id: nearestUsableTick(
              TickMath.MAX_TICK,
              TICK_SPACINGS[FeeAmount.LOW]
            ),
            liquidityNet: JSBI.multiply(ONE_ETHER, NEGATIVE_ONE),
            liquidityGross: ONE_ETHER,
          },
        ]
      });
    });

    describe("#getOutputAmount", () => {
      it("USDC -> DAI", async () => {
        const inputAmount = CurrencyAmount.fromRawAmount(USDC, 100);
        const [outputAmount] = await pool.getOutputAmount(inputAmount);
        expect(outputAmount.currency.equals(DAI)).toBe(true);
        expect(outputAmount.quotient).toEqual(JSBI.BigInt(98));
      });

      it("DAI -> USDC", async () => {
        const inputAmount = CurrencyAmount.fromRawAmount(DAI, 100);
        const [outputAmount] = await pool.getOutputAmount(inputAmount);
        expect(outputAmount.currency.equals(USDC)).toBe(true);
        expect(outputAmount.quotient).toEqual(JSBI.BigInt(98));
      });
    });

    describe("#getInputAmount", () => {
      it("USDC -> DAI", async () => {
        const outputAmount = CurrencyAmount.fromRawAmount(DAI, 98);
        const [inputAmount] = await pool.getInputAmount(outputAmount);
        expect(inputAmount.currency.equals(USDC)).toBe(true);
        expect(inputAmount.quotient).toEqual(JSBI.BigInt(100));
      });

      it("DAI -> USDC", async () => {
        const outputAmount = CurrencyAmount.fromRawAmount(USDC, 98);
        const [inputAmount] = await pool.getInputAmount(outputAmount);
        expect(inputAmount.currency.equals(DAI)).toBe(true);
        expect(inputAmount.quotient).toEqual(JSBI.BigInt(100));
      });
    });
  });

  describe("#bigNums", () => {
    let pool: Pool;
    const bigNum1 = JSBI.add(
      JSBI.BigInt(Number.MAX_SAFE_INTEGER),
      JSBI.BigInt(1)
    );
    const bigNum2 = JSBI.add(
      JSBI.BigInt(Number.MAX_SAFE_INTEGER),
      JSBI.BigInt(1)
    );
    beforeEach(() => {
      pool = new Pool({
        tokenA: USDC,
        tokenB: DAI,
        fee: FeeAmount.LOW,
        sqrtPriceX64: encodeSqrtRatioX64(bigNum1, bigNum2),
        liquidity: ONE_ETHER,
        tickCurrent: 0,
        ticks: [
          {
            id: nearestUsableTick(
              TickMath.MIN_TICK,
              TICK_SPACINGS[FeeAmount.LOW]
            ),
            liquidityNet: ONE_ETHER,
            liquidityGross: ONE_ETHER,
          },
          {
            id: nearestUsableTick(
              TickMath.MAX_TICK,
              TICK_SPACINGS[FeeAmount.LOW]
            ),
            liquidityNet: JSBI.multiply(ONE_ETHER, NEGATIVE_ONE),
            liquidityGross: ONE_ETHER,
          },
        ]
      });
    });

    describe("#priceLimit", () => {
      it("correctly compares two BigIntegers", async () => {
        expect(bigNum1).toEqual(bigNum2);
      });
      it("correctly handles two BigIntegers", async () => {
        const inputAmount = CurrencyAmount.fromRawAmount(USDC, 100);
        const [outputAmount] = await pool.getOutputAmount(inputAmount);
        pool.getInputAmount(outputAmount);
        expect(outputAmount.currency.equals(DAI)).toBe(true);
        // if output is correct, function has succeeded
      });
    });
  });
});
