import { Token, Pool, Route } from '../entities';

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

export function computeAllRoutesFromMap(
    tokenIn: Token,
    tokenOut: Token,
    poolMap: { [tokenId: string]: Pool[] },
    maxHops: number
): Route<Token , Token>[] {
  const routes: Route<Token, Token>[] = [];

  const computeRoutes = (
      tokenIn: Token,
      tokenOut: Token,
      currentRoute: Pool[],
      visitedPools: Set<Pool>,
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

    const previousTokenOut = _previousTokenOut ? _previousTokenOut : tokenIn;
    const relevantPools = poolMap[previousTokenOut.id] || [];

    for (const curPool of relevantPools) {
      if (visitedPools.has(curPool)) {
        continue;
      }

      const currentTokenOut = curPool.tokenA.equals(previousTokenOut)
          ? curPool.tokenB
          : curPool.tokenA;

      currentRoute.push(curPool);
      visitedPools.add(curPool);

      computeRoutes(
          tokenIn,
          tokenOut,
          currentRoute,
          visitedPools,
          currentTokenOut
      );

      visitedPools.delete(curPool);
      currentRoute.pop();
    }
  };

  computeRoutes(tokenIn, tokenOut, [], new Set());

  return routes;
}
