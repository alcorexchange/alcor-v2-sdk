const workerpool = require('workerpool')
const { CurrencyAmount, Pool, Route, Trade, TradeType } = require('./build/index.js')

async function processRoute(routeBuffer, splitAmount, tradeType, percent) {
  const route = Route.fromBuffer(routeBuffer);

  try {
    const { outputAmount } = Trade.fromRoute(route, CurrencyAmount.fromRawAmount(route.input, '10000000'), TradeType.EXACT_INPUT, 100);
    return { outputAmount: outputAmount.quotient.toString() };
  } catch (error) {
    if (error.isInsufficientReservesError || error.isInsufficientInputAmountError) {
      return null; // Return null if trade is not possible
    }
    throw error;
  }
}

// создаем пул воркеров
workerpool.worker({
  processRoute: processRoute
});
