import fetch from 'node-fetch'
import { APIClient, Action, Transaction } from '@wharfkit/antelope'

import { TradeType } from '../internalConstants'
import { Token, Pool, Route, Currency, CurrencyAmount } from '../entities';

export function computeAllRoutes(
  tokenIn: Token,
  tokenOut: Token,
  pools: Pool[],
  maxHops: number
): Route<Token , Token>[] {
  const poolsUsed = Array<boolean>(pools.length).fill(false);
  const routes: Route<Token, Token>[] = [];

  const computeRoutes = (
    tokenIn: Token,
    tokenOut: Token,
    currentRoute: Pool[],
    poolsUsed: boolean[],
    _previousTokenOut?: Token
  ) => {
    if (currentRoute.length > maxHops) {
      return;
    }

    if (
      currentRoute.length > 0 &&
      currentRoute[currentRoute.length - 1]!.involvesToken(tokenOut)
    ) {
      routes.push(new Route([...currentRoute], tokenIn, tokenOut));
      return;
    }

    for (let i = 0; i < pools.length; i++) {
      if (poolsUsed[i]) {
        continue;
      }

      const curPool = pools[i]!;
      const previousTokenOut = _previousTokenOut ? _previousTokenOut : tokenIn;

      if (!curPool.involvesToken(previousTokenOut)) {
        continue;
      }

      const currentTokenOut = curPool.tokenA.equals(previousTokenOut)
        ? curPool.tokenB
        : curPool.tokenA;

      currentRoute.push(curPool);
      poolsUsed[i] = true;
      computeRoutes(
        tokenIn,
        tokenOut,
        currentRoute,
        poolsUsed,
        currentTokenOut
      );
      poolsUsed[i] = false;
      currentRoute.pop();
    }
  };

  computeRoutes(tokenIn, tokenOut, [], poolsUsed);

  return routes;
}

const abiCache = {}
export async function callReadOnlySwapCalculation<TInput extends Currency, TOutput extends Currency, TTradeType extends TradeType>(
  nodes: string[],
  tradeType: TTradeType,
  inToken: CurrencyAmount<TInput>,
  outToken: CurrencyAmount<TOutput>,
  poolIds: number[],
) {

  const name = tradeType == TradeType.EXACT_INPUT ? 'swapexactin' : 'swapexactout'

  // TODO add failover
  const node = nodes[0]

  // TODO Retry logic
  const rpc = new APIClient({ url: node, fetch })
  const info = await rpc.v1.chain.get_info()
  const header = info.getTransactionHeader()

  if (!abiCache[node]) abiCache[node] = (await rpc.v1.chain.get_abi('amminterface')).abi

  const abi = abiCache[node]

  const action = Action.from({
      authorization: [], // No authorizations
      account: 'amminterface',
      name,
      data: {
        inToken: inToken.toExtendedAssetObject(),
        outToken: outToken.toExtendedAssetObject(),
        poolIds,
      }
  }, abi)

  const transaction = Transaction.from({
      ...header,
      actions: [action],
  })

  try {
    const res: any = await rpc.v1.chain.send_read_only_transaction(transaction)
    const outQuantity = res.processed.action_traces[0].return_value_data.quantity

    return outQuantity.split(' ')[0].replace('.', '')
  } catch (e) {
    return '0'
  }
}
