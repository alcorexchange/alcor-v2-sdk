import { Percent, Trade } from "../entities"
import { TradeType } from "../internalConstants"

export function parseTrade(trade) {
  // Parse Trade into api format object
  const slippage = new Percent(3, 100) // 0.3%
  const receiver = '<receiver>'

  const maxSent = trade.inputAmount
  const minReceived = trade.minimumAmountOut(slippage)
  const tradeType = trade.tradeType == TradeType.EXACT_INPUT ? 'swapexactin' : 'swapexactout'

  const swaps = trade.swaps.map(({ route, percent, inputAmount, outputAmount }) => {
    route = route.pools.map(p => p.id)

    let minReceived = outputAmount

    if (trade.tradeType === TradeType.EXACT_INPUT) {
      minReceived = outputAmount.multiply(new Percent(1).subtract(slippage))
    }

    const input = inputAmount.toSignificant()
    const output = outputAmount.toSignificant()

    const memo = `${tradeType}#${route.join(',')}#${receiver}#${minReceived.toExtendedAsset()}#0`
    return { input, output, percent, memo }
  })

  const result = {
    swaps,
    input: trade.inputAmount.toFixed(),
    output: trade.outputAmount.toFixed(),
    minReceived: minReceived.toFixed(),
    maxSent: maxSent.toFixed(),
    priceImpact: trade.priceImpact.toSignificant(2),

    executionPriceStr: trade.executionPrice.toFixed(),
    executionPrice: {
      numerator: trade.executionPrice.numerator.toString(),
      denominator: trade.executionPrice.denominator.toString()
    }
  }

  return result
}

