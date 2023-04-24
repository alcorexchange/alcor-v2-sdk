import fs from "fs";

import { Pool } from "entities/pool";
import { Token } from "entities/token";
import { Trade } from "entities/trade";

import { asset, symbol } from "eos-common";
import { CurrencyAmount } from "../src/entities/fractions/currencyAmount";
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

const toCurrency = (quantity, contract) => {
  const parsed = asset(quantity)
  const token = parseToken({ quantity, contract })

  return CurrencyAmount.fromRawAmount(token, parsed.amount.toString())
}


describe("test", () => {
  const poolsData = JSON.parse(
    fs.readFileSync(__dirname + "/fixtures/pools.json", "utf8")
  );
  const ticksData = JSON.parse(
    fs.readFileSync(__dirname + "/fixtures/ticks.json", "utf8")
  );

  const pools = poolsData.rows.map((p) => {
    return new Pool({
      ...p,
      tokenA: parseToken(p.tokenA),
      tokenB: parseToken(p.tokenB),
      ticks: ticksData[String(p.id)].rows.sort((a, b) => a.id - b.id),
      sqrtPriceX64: p.currSlot.sqrtPriceX64,
      tickCurrent: p.currSlot.tick,
    });
  });

  // describe("bestTradeExactIn", () => {
  //   it("test bestTradeExactOut", async () => {
  //     const token0 = {
  //       quantity: "100.0000 TLM",
  //       contract: "alien.worlds",
  //     };
  //     const token1 = {
  //       quantity: "0.00000000 WAX",
  //       contract: "eosio.token",
  //     };

  //     const currencyAmountIn = CurrencyAmount.fromRawAmount(
  //       parseToken(token0),
  //       100_0000
  //     );

  //     const [bestExactIn] = await Trade.bestTradeExactIn(
  //       pools,
  //       currencyAmountIn,
  //       parseToken(token1)
  //     );

  //     const currencyAmountOut = bestExactIn.outputAmount;
  //     const [bestExactOut] = await Trade.bestTradeExactOut(
  //       pools,
  //       parseToken(token0),
  //       currencyAmountOut
  //     );

  //     // console.log(
  //     //   "100.0000 TLM -> ",
  //     //   bestExactIn.outputAmount.toAsset(),
  //     //   "| priceImpact:",
  //     //   bestExactIn.priceImpact.toFixed()
  //     // );

  //     // console.log(currencyAmountOut.toAsset());
  //     // console.log(
  //     //   bestExactOut.outputAmount.toAsset(),
  //     //   "->",
  //     //   bestExactOut.inputAmount.toAsset(),
  //     //   "| priceImpact:",
  //     //   bestExactOut.priceImpact.toFixed()
  //     // );

  //     expect(currencyAmountIn.toAsset()).toEqual(bestExactOut.inputAmount.toAsset());
  //   });

  //   it("test bestTradeExactOut with flip tokens", async () => {
  //     const poolsData = JSON.parse(
  //       fs.readFileSync(__dirname + "/fixtures/pools.json", "utf8")
  //     );
  //     const ticksData = JSON.parse(
  //       fs.readFileSync(__dirname + "/fixtures/ticks.json", "utf8")
  //     );

  //     const pools = poolsData.rows.map((p) => {
  //       return new Pool({
  //         ...p,
  //         tokenA: parseToken(p.tokenA),
  //         tokenB: parseToken(p.tokenB),
  //         ticks: ticksData[String(p.id)].rows.sort((a, b) => a.id - b.id),
  //         sqrtPriceX64: p.currSlot.sqrtPriceX64,
  //         tickCurrent: p.currSlot.tick,
  //       });
  //     });

  //     const token0 = {
  //       quantity: "0.0000 TLM",
  //       contract: "alien.worlds",
  //     };

  //     const token1 = {
  //       quantity: "0.00000000 WAX",
  //       contract: "eosio.token",
  //     };

  //     const currencyAmountIn = CurrencyAmount.fromRawAmount(
  //       parseToken(token1),
  //       100_00000000
  //     );

  //     const [bestExactIn] = await Trade.bestTradeExactIn(
  //       pools,
  //       currencyAmountIn,
  //       parseToken(token0)
  //     );

  //     const [bestExactOut] = await Trade.bestTradeExactOut(
  //       pools,
  //       parseToken(token1),
  //       bestExactIn.outputAmount
  //     );

  //     // console.log(
  //     //   "100.0000 TLM -> ",
  //     //   bestExactIn.outputAmount.toAsset(),
  //     //   "| priceImpact:",
  //     //   bestExactIn.priceImpact.toFixed()
  //     // );

  //     // console.log(currencyAmountOut.toAsset());
  //     // console.log(
  //     //   bestExactOut.outputAmount.toAsset(),
  //     //   "->",
  //     //   bestExactOut.inputAmount.toAsset(),
  //     //   "| priceImpact:",
  //     //   bestExactOut.priceImpact.toFixed()
  //     // );

  //     expect(bestExactIn.inputAmount.toAsset()).toEqual(bestExactOut.inputAmount.toAsset());
  //   });
  // });

  describe("bestTradeExactOut", () => {
    it("test bestTradeExactOut", async () => {
      const poolsData = JSON.parse(
        fs.readFileSync(__dirname + "/fixtures/pools.json", "utf8")
      );
      const ticksData = JSON.parse(
        fs.readFileSync(__dirname + "/fixtures/ticks.json", "utf8")
      );

      const pools = poolsData.rows.map((p) => {
        return new Pool({
          ...p,
          tokenA: parseToken(p.tokenA),
          tokenB: parseToken(p.tokenB),
          ticks: ticksData[String(p.id)].rows.sort((a, b) => a.id - b.id),
          sqrtPriceX64: p.currSlot.sqrtPriceX64,
          tickCurrent: p.currSlot.tick,
        });
      });

      const input = toCurrency('1.00000000 WAX', 'eosio.token')
      const output = toCurrency('0.0000 TLM', 'alien.worlds')

      const [bestExactIn] = await Trade.bestTradeExactIn(
        pools,
        input,
        output.currency
      );

      const [bestExactOut] = await Trade.bestTradeExactOut(
        pools,
        input.currency,
        bestExactIn.outputAmount
      );

      expect(bestExactOut.inputAmount.toAsset()).toEqual(bestExactIn.inputAmount.toAsset());
    });

    // it("test bestTradeExactOut with flip tokens", async () => {
    //   const poolsData = JSON.parse(
    //     fs.readFileSync(__dirname + "/fixtures/pools.json", "utf8")
    //   );
    //   const ticksData = JSON.parse(
    //     fs.readFileSync(__dirname + "/fixtures/ticks.json", "utf8")
    //   );

    //   const pools = poolsData.rows.map((p) => {
    //     return new Pool({
    //       ...p,
    //       tokenA: parseToken(p.tokenA),
    //       tokenB: parseToken(p.tokenB),
    //       ticks: ticksData[String(p.id)].rows.sort((a, b) => a.id - b.id),
    //       sqrtPriceX64: p.currSlot.sqrtPriceX64,
    //       tickCurrent: p.currSlot.tick,
    //     });
    //   });

    //   const token0 = {
    //     quantity: "0.0000 TLM",
    //     contract: "alien.worlds",
    //   };

    //   const token1 = {
    //     quantity: "0.00000000 WAX",
    //     contract: "eosio.token",
    //   };

    //   const currencyAmountIn = CurrencyAmount.fromRawAmount(
    //     parseToken(token1),
    //     100_00000000
    //   );

    //   const [bestExactIn] = await Trade.bestTradeExactIn(
    //     pools,
    //     currencyAmountIn,
    //     parseToken(token0)
    //   );

    //   const [bestExactOut] = await Trade.bestTradeExactOut(
    //     pools,
    //     parseToken(token1),
    //     bestExactIn.outputAmount
    //   );

    //   // console.log(
    //   //   "100.0000 TLM -> ",
    //   //   bestExactIn.outputAmount.toAsset(),
    //   //   "| priceImpact:",
    //   //   bestExactIn.priceImpact.toFixed()
    //   // );

    //   // console.log(currencyAmountOut.toAsset());
    //   // console.log(
    //   //   bestExactOut.outputAmount.toAsset(),
    //   //   "->",
    //   //   bestExactOut.inputAmount.toAsset(),
    //   //   "| priceImpact:",
    //   //   bestExactOut.priceImpact.toFixed()
    //   // );

    //   expect(bestExactIn.inputAmount.toAsset()).toEqual(bestExactOut.inputAmount.toAsset());
    // });
  });
});
