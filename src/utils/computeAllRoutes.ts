import { Token, Pool, Route } from '../entities';

export function computeAllRoutes(
  tokenIn: Token,
  tokenOut: Token,
  pools: Pool[],
  maxHops: number
): Route<Token, Token>[] {
  const routes: Route<Token, Token>[] = [];
  
  // Pre-filter pools for faster lookup during recursion
  const poolsByToken: Map<string, Pool[]> = new Map();
  
  for (const pool of pools) {
    for (const token of [pool.tokenA, pool.tokenB]) {
      const tokenAddress = token.id;
      if (!poolsByToken.has(tokenAddress)) {
        poolsByToken.set(tokenAddress, []);
      }
      poolsByToken.get(tokenAddress)!.push(pool);
    }
  }
  
  // Track pools used in current path
  const poolsUsed = new Set<string>();
  const currentRoute: Pool[] = [];
  
  function computeRoutes(currentTokenIn: Token) {
    // Base case: reached max hop limit
    if (currentRoute.length > maxHops) {
      return;
    }
    
    // Success case: last pool in route involves the destination token
    if (
      currentRoute.length > 0 &&
      currentRoute[currentRoute.length - 1]!.involvesToken(tokenOut)
    ) {
      routes.push(new Route([...currentRoute], tokenIn, tokenOut));
      return;
    }
    
    // Get pools that involve the current input token
    const possiblePools = poolsByToken.get(currentTokenIn.id) || [];
    
    for (const curPool of possiblePools) {
      // Skip if this pool is already used in the current route
      const poolKey = `${curPool.tokenA.id}:${curPool.tokenB.id}`;
      if (poolsUsed.has(poolKey)) {
        continue;
      }
      
      // Get the other token from the pool (the output token from this step)
      const currentTokenOut = curPool.tokenA.equals(currentTokenIn)
        ? curPool.tokenB
        : curPool.tokenA;
      
      // Add this pool to the current route
      currentRoute.push(curPool);
      poolsUsed.add(poolKey);
      
      // Recurse with the output token as the new input
      computeRoutes(currentTokenOut);
      
      // Backtrack
      poolsUsed.delete(poolKey);
      currentRoute.pop();
    }
  }
  
  // Start recursive search
  computeRoutes(tokenIn);
  
  return routes;
}

export function computeAllRoutesOld(
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
