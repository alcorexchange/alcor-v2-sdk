require('dotenv').config()

import mongoose from 'mongoose'
import { createClient } from 'redis'
import { JsonRpc } from 'eosjs'
import fetch from 'node-fetch'

import { Token, Pool, Trade, CurrencyAmount, Route } from '../build'
import { computeAllRoutes } from '../build/utils/computeAllRoutes'
import { TradeType } from '../build'

const redis = createClient()

const SwapPoolSchema = new mongoose.Schema({
  chain: { type: String, index: true },
  id: { type: Number, index: true },
  fee: { type: Number, index: true },
  active: { type: Boolean, index: true },
  tokenA: {
    contract: { type: String, index: true },
    symbol: { type: String, index: true },
    id: { type: String, index: true },
    quantity: { type: Number },
    decimals: { type: Number },
  },
  tokenB: {
    contract: { type: String, index: true },
    symbol: { type: String, index: true },
    id: { type: String, index: true },
    quantity: { type: Number },
    decimals: { type: Number }
  },
  sqrtPriceX64: { type: String },
  tick: { type: Number },
  feeProtocol: { type: Number, index: true },
  tickSpacing: { type: Number, index: true },
  maxLiquidityPerTick: { type: String },
  feeGrowthGlobalAX64: { type: String },
  feeGrowthGlobalBX64: { type: String },
  protocolFeeA: { type: Number },
  protocolFeeB: { type: Number },
  liquidity: { type: String },
  creator: { type: String },
  volumeA24: { type: Number, default: 0 },
  volumeB24: { type: Number, default: 0 },
  volumeAWeek: { type: Number, default: 0 },
  volumeBWeek: { type: Number, default: 0 },
  volumeAMonth: { type: Number, default: 0 },
  volumeBMonth: { type: Number, default: 0 },
  volumeUSD24: { type: Number, default: 0 },
  volumeUSDWeek: { type: Number, default: 0 },
  volumeUSDMonth: { type: Number, default: 0 },
})
SwapPoolSchema.index({ chain: 1, id: 1 }, { unique: true })
const SwapPool = mongoose.model('SwapPool', SwapPoolSchema)

async function getRedisTicks(chain: string, poolId: number | string) {
  if (!redis.isOpen) await redis.connect()
  const entries = await redis.get(`ticks_${chain}_${poolId}`)
  const plain = JSON.parse(entries || '[]') || []
  const ticks = entries ? new Map([...plain].sort((a, b) => a.id - b.id)) : new Map()
  return ticks
}

async function getPools(chain: string, fetchTicks = true) {
  const mongoPools = await SwapPool.find({ chain }).lean()
  const pools: Pool[] = []

  for (const p of mongoPools) {
    const ticks = fetchTicks ? await getRedisTicks(chain, p.id) : []
    if (ticks.length == 0) continue
    if (!p.active) continue

    pools.push(new Pool({
      ...p,
      tokenA: new Token(p.tokenA.contract, p.tokenA.decimals, p.tokenA.symbol, p.tokenA.id),
      tokenB: new Token(p.tokenB.contract, p.tokenB.decimals, p.tokenB.symbol, p.tokenB.id),
      ticks: Array.from(ticks.values()).sort((a, b) => a.id - b.id),
      tickCurrent: p.tick
    } as any))
  }
  return pools
}

async function connectAll() {
  const uri = `mongodb://${process.env.MONGO_HOST}:${process.env.MONGO_PORT}/${process.env.MONGO_DB}`
  await mongoose.connect(uri, { useUnifiedTopology: true, useNewUrlParser: true, useCreateIndex: true })
  if (!redis.isOpen) await redis.connect()
}

async function main() {
  console.log('=== Pruning Benchmark - Save baseline results ===\n')

  await connectAll()

  const tokenIn = new Token('alien.worlds', 4, 'TLM')
  const amountIn = CurrencyAmount.fromRawAmount(tokenIn, 900_0000)
  const tokenOut = new Token('eosio.token', 8, 'WAX')
  const maxHops = 3

  console.log(`Swap: ${amountIn.toFixed()} ${tokenIn.symbol} -> ${tokenOut.symbol}`)
  console.log(`Max hops: ${maxHops}\n`)

  const pools = await getPools('wax')
  const _pools = pools.filter(p => p.tickDataProvider.ticks.length > 0)
  console.log(`Pools with ticks: ${_pools.length}`)

  console.time('routes generate')
  const routes = computeAllRoutes(amountIn.currency, tokenOut, _pools, maxHops)
  console.timeEnd('routes generate')
  console.log(`Routes found: ${routes.length}\n`)

  // Use bestTradeWithSplit like test23.ts
  const percents = maxHops > 2 ? [5, 10, 15, 35, 25, 50, 75, 100] : [5, 10, 15, 25, 50, 75, 100]

  console.log('Computing bestTradeWithSplit...')
  console.time('split compute')

  const trade = Trade.bestTradeWithSplit(routes, amountIn, percents, TradeType.EXACT_INPUT, { minSplits: 1, maxSplits: 15 })

  console.timeEnd('split compute')

  if (trade) {
    console.log('\n=== BEST TRADE RESULT ===')
    console.log(`Input: ${trade.inputAmount.toFixed()} ${tokenIn.symbol}`)
    console.log(`Output: ${trade.outputAmount.toFixed()} ${tokenOut.symbol}`)
    console.log(`Price Impact: ${trade.priceImpact.toSignificant(4)}%`)
    console.log(`Swaps: ${trade.swaps.length}`)

    console.log('\n=== SWAPS BREAKDOWN ===')
    for (let i = 0; i < trade.swaps.length; i++) {
      const swap = trade.swaps[i]
      console.log(`#${i + 1}: ${swap.percent}% - ${swap.route.tokenPath.map(t => t.symbol).join(' -> ')}`)
      console.log(`    Pools: [${swap.route.pools.map(p => p.id).join(', ')}]`)
      console.log(`    Output: ${swap.outputAmount.toFixed()}`)
    }

    // Save result
    const result = {
      timestamp: new Date().toISOString(),
      input: `${trade.inputAmount.toFixed()} ${tokenIn.symbol}`,
      output: `${trade.outputAmount.toFixed()} ${tokenOut.symbol}`,
      priceImpact: trade.priceImpact.toSignificant(4),
      totalRoutes: routes.length,
      swaps: trade.swaps.map(s => ({
        percent: s.percent,
        path: s.route.tokenPath.map(t => t.symbol).join(' -> '),
        poolIds: s.route.pools.map(p => p.id),
        output: s.outputAmount.toFixed()
      }))
    }

    const fs = require('fs')
    fs.writeFileSync('pruning-results.json', JSON.stringify(result, null, 2))
    console.log('\nResults saved to pruning-results.json')
  } else {
    console.log('No trade found!')
  }

  // Disconnect
  await mongoose.disconnect()
  await redis.disconnect()
}

main().catch(console.error)
