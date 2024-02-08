import { Percent } from "../entities"
import { TradeType } from "../internalConstants"

export function parseTrade(trade) {
  // Parse Trade into api format object
  const slippage = new Percent(3, 100) // 0.3%
  const receiver = '<receiver>'

  const tradeType = trade.tradeType == TradeType.EXACT_INPUT ? 'swapexactin' : 'swapexactout'

  const route = trade.route.pools.map(p => p.id)
  const maxSent = trade.inputAmount
  const minReceived = trade.minimumAmountOut(slippage)
  const memo = `${tradeType}#${route.join(',')}#${receiver}#${minReceived.toExtendedAsset()}#0`

  const result = {
    input: trade.inputAmount.toFixed(),
    output: trade.outputAmount.toFixed(),
    minReceived: minReceived.toFixed(),
    maxSent: maxSent.toFixed(),
    priceImpact: trade.priceImpact.toSignificant(2),
    memo,
    route,
    executionPrice: {
      numerator: trade.executionPrice.numerator.toString(),
      denominator: trade.executionPrice.denominator.toString()
    }
  }

  return result
}

