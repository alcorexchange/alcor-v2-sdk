import { Token, Pool, Route } from '../entities';

interface RouteNode {
  currentToken: Token;
  currentRoute: Pool[];
  usedPools: Set<number>;
}

export function computeAllRoutes(
  tokenIn: Token,
  tokenOut: Token,
  pools: Pool[],
  maxHops: number
): Route<Token, Token>[] {
  // Создаем карту пулов для каждого токена
  const poolMap: Map<string, Pool[]> = new Map();
  pools.forEach((pool, index) => {
    const tokenA = pool.tokenA.id;
    const tokenB = pool.tokenB.id;
    if (!poolMap.has(tokenA)) poolMap.set(tokenA, []);
    if (!poolMap.has(tokenB)) poolMap.set(tokenB, []);
    poolMap.get(tokenA)!.push(pool);
    poolMap.get(tokenB)!.push(pool);
  });

  // Инициализируем стек для итеративного обхода
  const routes: Route<Token, Token>[] = [];
  const stack: RouteNode[] = [
    {
      currentToken: tokenIn,
      currentRoute: [],
      usedPools: new Set(),
    },
  ];

  // Основной цикл обработки маршрутов
  while (stack.length > 0) {
    const { currentToken, currentRoute, usedPools } = stack.pop()!;

    // Ранняя остановка: превышен лимит хопов
    if (currentRoute.length > maxHops) continue;

    // Если маршрут завершен (достигнут tokenOut), добавляем его в результат
    if (currentRoute.length > 0 && currentRoute[currentRoute.length - 1].involvesToken(tokenOut)) {
      routes.push(new Route([...currentRoute], tokenIn, tokenOut));
      continue;
    }

    // Получаем доступные пулы для текущего токена
    const availablePools = poolMap.get(currentToken.id) || [];
    for (const pool of availablePools) {
      const poolIndex = pools.indexOf(pool);
      if (usedPools.has(poolIndex)) continue; // Пропускаем уже использованные пулы

      // Определяем следующий токен
      const nextToken = pool.tokenA.equals(currentToken) ? pool.tokenB : pool.tokenA;

      // Создаем новый маршрут и добавляем его в стек
      const newRoute = [...currentRoute, pool];
      const newUsedPools = new Set(usedPools).add(poolIndex);
      stack.push({
        currentToken: nextToken,
        currentRoute: newRoute,
        usedPools: newUsedPools,
      });
    }
  }

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
