import { Pool } from "entities/pool";
import { Token } from "entities/token";
import { Trade } from "entities/trade";
import { asset, symbol } from "eos-common"
import { CurrencyAmount } from "../src/entities/fractions/currencyAmount";
function parseToken(token) {
    console.log("token", token)
    return new Token(
      token.contract,
      asset(token.quantity).symbol.precision(),
      asset(token.quantity).symbol.code().to_string(),
      (asset(token.quantity).symbol.code().to_string() + '-' + token.contract).toLowerCase()
    )
  }
  
describe("test", () => {
    const pools: Pool [] = [];
    const CONTRACT_ONE = "contracta";
    describe("bestTradeExactOut", () => {
        it("test bestTradeExactOut", async () => {
            const statePools={
                "rows": [{
                    "id": 9,
                    "active": 1,
                    "tokenA": {
                      "quantity": "76.7868 TLM",
                      "contract": "alien.worlds"
                    },
                    "tokenB": {
                      "quantity": "74.38606062 CMX",
                      "contract": "token.mf"
                    },
                    "fee": 10000,
                    "feeProtocol": 0,
                    "tickSpacing": 200,
                    "maxLiquidityPerTick": "4157481197590613",
                    "currSlot": {
                      "sqrtPriceX64": "1844673594537660054688",
                      "tick": 92108,
                      "lastObservationTimestamp": 1680357849,
                      "currentObservationNum": 1,
                      "maxObservationNum": 1
                    },
                    "feeGrowthGlobalAX64": 0,
                    "feeGrowthGlobalBX64": 0,
                    "protocolFeeA": "0.0000 TLM",
                    "protocolFeeB": "0.00000000 CMX",
                    "liquidity": 262381461
                  }
                ],
                "more": false,
                "next_key": ""
              };
              const ticks = [{
                    "id": 85200,
                    "liquidityGross": 251227894,
                    "liquidityNet": 251227894,
                    "feeGrowthOutsideAX64": "0",
                    "feeGrowthOutsideBX64": "0",
                    "tickCumulativeOutside": 0,
                    "secondsPerLiquidityOutsideX64": "0",
                    "secondsOutside": 1680357849,
                    "initialized": 1
                  },{
                    "id": 90200,
                    "liquidityGross": 11153567,
                    "liquidityNet": 11153567,
                    "feeGrowthOutsideAX64": "0",
                    "feeGrowthOutsideBX64": "0",
                    "tickCumulativeOutside": 0,
                    "secondsPerLiquidityOutsideX64": "0",
                    "secondsOutside": 1680360378,
                    "initialized": 1
                  },{
                    "id": 95600,
                    "liquidityGross": 11153567,
                    "liquidityNet": -11153567,
                    "feeGrowthOutsideAX64": "0",
                    "feeGrowthOutsideBX64": "0",
                    "tickCumulativeOutside": 0,
                    "secondsPerLiquidityOutsideX64": "0",
                    "secondsOutside": 0,
                    "initialized": 1
                  },{
                    "id": 99200,
                    "liquidityGross": 251227894,
                    "liquidityNet": -251227894,
                    "feeGrowthOutsideAX64": "0",
                    "feeGrowthOutsideBX64": "0",
                    "tickCumulativeOutside": 0,
                    "secondsPerLiquidityOutsideX64": "0",
                    "secondsOutside": 0,
                    "initialized": 1
                  }
                ]
            for(const row of statePools.rows){
                const {tokenA, tokenB, currSlot:{sqrtPriceX64, tick}} = row
                
                pools.push(new Pool({
                    ...row,
                    tokenA: parseToken(tokenA),
                    tokenB: parseToken(tokenB),
                    ticks,
                    sqrtPriceX64,
                    tickCurrent:tick
                }))
            }
            const token0={
                "quantity": "1.0000 TLM",
                "contract": "alien.worlds"
              }
              const token1={
                "quantity": "0.00000000 CMX",
                "contract": "token.mf"
              }
            const currencyAmountIn = CurrencyAmount.fromRawAmount(parseToken(token0), 1234)
            const bestExactIn = await Trade.bestTradeExactIn(pools, currencyAmountIn, parseToken(token1));
            console.log(JSON.stringify(bestExactIn, null, 4))

            const tokenB={
                "quantity": "1.0000 TLM",
                "contract": "alien.worlds"
              }
              const tokenA={
                "quantity": "0.00000000 CMX",
                "contract": "token.mf"
              }
            const currencyAmountOut = CurrencyAmount.fromRawAmount(parseToken(tokenB), 10000)
            const bestExactOut = await Trade.bestTradeExactOut(pools, parseToken(tokenA), currencyAmountOut);
            console.log(JSON.stringify(bestExactOut, null, 4))
        });
    });
});