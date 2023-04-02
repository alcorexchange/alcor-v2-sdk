import fs from "fs";
import { Pool } from "entities/pool";
import { Token } from "entities/token";
import { Trade } from "entities/trade";
import { asset, symbol } from "eos-common";
import { CurrencyAmount } from "../src/entities/fractions/currencyAmount";
import JSBI from "jsbi";
import { FeeAmount, TICK_SPACINGS } from "internalConstants";
import { encodeSqrtRatioX64 } from "utils/encodeSqrtRatioX64";
import { TickMath } from "utils/tickMath";
import { nearestUsableTick } from "utils/nearestUsableTick";
import { sqrt } from "utils/sqrt";

function parseToken(token) {
  return new Token(
    token.contract,
    asset(token.quantity).symbol.precision(),
    asset(token.quantity).symbol.code().to_string(),
    (
      asset(token.quantity).symbol.code().to_string() +
      "-" +
      token.contract
    ).toLowerCase()
  );
}

describe("Trade", () => {
  const token0 = new Token(
    "0x0000000000000000000000000000000000000001",
    8,
    "t0",
    "token0"
  );
  const token1 = new Token(
    "0x0000000000000000000000000000000000000002",
    8,
    "t1",
    "token1"
  );
  const token2 = new Token(
    "0x0000000000000000000000000000000000000003",
    8,
    "t2",
    "token2"
  );
  const token3 = new Token(
    "0x0000000000000000000000000000000000000004",
    8,
    "t3",
    "token3"
  );

  function v2StylePool(
    id: number,
    reserve0: CurrencyAmount<Token>,
    reserve1: CurrencyAmount<Token>,
    feeAmount: FeeAmount = FeeAmount.MEDIUM
  ) {
    console.log("feeAmount", feeAmount);
    const sqrtRatioX64 = encodeSqrtRatioX64(
      reserve1.quotient,
      reserve0.quotient
    );
    const liquidity = sqrt(
      JSBI.multiply(reserve0.quotient, reserve1.quotient)
    );
    return new Pool({
      id,
      tokenA: reserve0.currency,
      tokenB: reserve1.currency,
      fee: feeAmount,
      sqrtPriceX64: sqrtRatioX64,
      liquidity,
      tickCurrent: TickMath.getTickAtSqrtRatio(sqrtRatioX64),
      ticks: [
        {
          id: nearestUsableTick(TickMath.MIN_TICK, TICK_SPACINGS[feeAmount]),
          liquidityNet: liquidity,
          liquidityGross: liquidity,
        },
        {
          id: nearestUsableTick(TickMath.MAX_TICK, TICK_SPACINGS[feeAmount]),
          liquidityNet: JSBI.multiply(liquidity, JSBI.BigInt(-1)),
          liquidityGross: liquidity,
        },
      ],
    });
  }
  const pool_0_1 = v2StylePool(
    0,
    CurrencyAmount.fromRawAmount(token0, 100000),
    CurrencyAmount.fromRawAmount(token1, 100000)
  );
  const pool_0_2 = v2StylePool(
    1,
    CurrencyAmount.fromRawAmount(token0, 100000),
    CurrencyAmount.fromRawAmount(token2, 110000)
  );
  const pool_0_3 = v2StylePool(
    2,
    CurrencyAmount.fromRawAmount(token0, 100000),
    CurrencyAmount.fromRawAmount(token3, 90000)
  );
  const pool_1_2 = v2StylePool(
    3,
    CurrencyAmount.fromRawAmount(token1, 120000),
    CurrencyAmount.fromRawAmount(token2, 100000)
  );
  const pool_1_3 = v2StylePool(
    4,
    CurrencyAmount.fromRawAmount(token1, 120000),
    CurrencyAmount.fromRawAmount(token3, 130000)
  );
  describe('#bestTradeExactIn', () => {
    it('throws with empty pools', async () => {
      await expect(
        Trade.bestTradeExactIn([], CurrencyAmount.fromRawAmount(token0, JSBI.BigInt(10000)), token2)
      ).rejects.toThrow('POOLS')
    })
    it('throws with max hops of 0', async () => {
      await expect(
        Trade.bestTradeExactIn([pool_0_2], CurrencyAmount.fromRawAmount(token0, JSBI.BigInt(10000)), token2, {
          maxHops: 0
        })
      ).rejects.toThrow('MAX_HOPS')
    })

    it.only('provides best route', async () => {
      const result = await Trade.bestTradeExactIn(
        [pool_0_1, pool_0_2, pool_1_2],
        CurrencyAmount.fromRawAmount(token0, 10000),
        token2
      )
      console.log("result", result)
      expect(result).toHaveLength(2)
      console.log("result[0].swaps[0].route.tokenPath", result[0].swaps[0].route.tokenPath)
      console.log("result[0].swaps[0].route.pools", result[0].swaps[0].route.pools)
      expect(result[0].swaps[0].route.pools).toHaveLength(1) // 0 -> 2 at 10:11
      expect(result[0].swaps[0].route.tokenPath).toEqual([token0, token2])
      expect(result[0].inputAmount.equalTo(CurrencyAmount.fromRawAmount(token0, JSBI.BigInt(10000)))).toBeTruthy()
      expect(result[0].outputAmount.equalTo(CurrencyAmount.fromRawAmount(token2, JSBI.BigInt(9971)))).toBeTruthy()
      expect(result[1].swaps[0].route.pools).toHaveLength(2) // 0 -> 1 -> 2 at 12:12:10
      expect(result[1].swaps[0].route.tokenPath).toEqual([token0, token1, token2])
      expect(result[1].inputAmount.equalTo(CurrencyAmount.fromRawAmount(token0, JSBI.BigInt(10000)))).toBeTruthy()
      expect(result[1].outputAmount.equalTo(CurrencyAmount.fromRawAmount(token2, JSBI.BigInt(7004)))).toBeTruthy()
    })
  })

  describe("#bestTradeExactOut", () => {
    it("throws with empty pools", async () => {
      await expect(
        Trade.bestTradeExactOut(
          [],
          token0,
          CurrencyAmount.fromRawAmount(token2, JSBI.BigInt(100))
        )
      ).rejects.toThrow("POOLS");
    });

    it("throws with max hops of 0", async () => {
      await expect(
        Trade.bestTradeExactOut(
          [pool_0_2],
          token0,
          CurrencyAmount.fromRawAmount(token2, JSBI.BigInt(100)),
          {
            maxHops: 0,
          }
        )
      ).rejects.toThrow("MAX_HOPS");
    });

    it("provides best route", async () => {
      const result = await Trade.bestTradeExactOut(
        [pool_0_1, pool_0_2, pool_1_2],
        token0,
        CurrencyAmount.fromRawAmount(token2, 10000)
      );
      expect(result).toHaveLength(2);
      expect(result[0].swaps[0].route.pools).toHaveLength(1); // 0 -> 2 at 10:11
      expect(result[0].swaps[0].route.tokenPath).toEqual([token0, token2]);
      expect(
        result[0].inputAmount.equalTo(
          CurrencyAmount.fromRawAmount(token0, 10032)
        )
      ).toBeTruthy();
      expect(
        result[0].outputAmount.equalTo(
          CurrencyAmount.fromRawAmount(token2, 10000)
        )
      ).toBeTruthy();
      expect(result[1].swaps[0].route.pools).toHaveLength(2); // 0 -> 1 -> 2 at 12:12:10
      expect(result[1].swaps[0].route.tokenPath).toEqual([
        token0,
        token1,
        token2,
      ]);
      expect(
        result[1].inputAmount.equalTo(
          CurrencyAmount.fromRawAmount(token0, 15488)
        )
      ).toBeTruthy();
      expect(
        result[1].outputAmount.equalTo(
          CurrencyAmount.fromRawAmount(token2, 10000)
        )
      ).toBeTruthy();
    });
  });
});
