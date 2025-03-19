import Queue from 'mnemonist/queue';
import FixedReverseHeap from 'mnemonist/fixed-reverse-heap';
import { Currency } from '../entities/currency';
import { Trade } from '../entities/trade';
import { CurrencyAmount } from '../entities/fractions';
import { TradeType } from '../internalConstants';

export function getBestSwapRoute(
  routeType: TradeType,
  percentToQuotes: { [percent: number]: Trade<Currency, Currency, TradeType>[] },
  percents: number[],
  swapRouteConfig = { minSplits: 1, maxSplits: 8 }
): Trade<Currency, Currency, TradeType>[] | null {
  // Извлекаем уникальные пулы из всех маршрутов
  const allPools = [...new Set(Object.values(percentToQuotes).flatMap(routes => routes.flatMap(r => r.route.pools)))];
  
  // Создаем битовую карту для пулов
  const poolToBit = new Map<number, number>();
  let bitCounter = 0;
  for (const pool of allPools) {
    poolToBit.set(pool.id, 1 << bitCounter++);
  }

  // Предвычисляем маски для всех маршрутов
  const routeToMask = new Map<Trade<Currency, Currency, TradeType>, number>();
  for (const routes of Object.values(percentToQuotes)) {
    for (const route of routes) {
      let mask = 0;
      for (const pool of route.route.pools) {
        mask |= poolToBit.get(pool.id)!;
      }
      routeToMask.set(route, mask);
    }
  }

  // Сортируем маршруты для каждого процента
  const percentToSortedQuotes: { [percent: number]: Trade<Currency, Currency, TradeType>[] } = {};
  for (const percent in percentToQuotes) {
    percentToSortedQuotes[percent] = percentToQuotes[percent].sort((a, b) =>
      routeType === TradeType.EXACT_INPUT
        ? a.outputAmount.greaterThan(b.outputAmount) ? -1 : 1
        : a.inputAmount.lessThan(b.inputAmount) ? -1 : 1
    );
  }

  // Функция сравнения для типа торговли
  const quoteCompFn =
    routeType === TradeType.EXACT_INPUT
      ? (a: CurrencyAmount<Currency>, b: CurrencyAmount<Currency>) => a.greaterThan(b)
      : (a: CurrencyAmount<Currency>, b: CurrencyAmount<Currency>) => a.lessThan(b);

  // Функция суммирования CurrencyAmount
  const sumFn = (currencyAmounts: CurrencyAmount<Currency>[]): CurrencyAmount<Currency> => {
    let sum = currencyAmounts[0]!;
    for (let i = 1; i < currencyAmounts.length; i++) {
      sum = sum.add(currencyAmounts[i]!);
    }
    return sum;
  };

  let bestQuote: CurrencyAmount<Currency> | undefined;
  let bestSwap: Trade<Currency, Currency, TradeType>[] | undefined;

  // Храним лучшие маршруты для каждого уровня разбиения (максимум 3)
  const bestSwapsPerSplit = new FixedReverseHeap<{
    quote: CurrencyAmount<Currency>;
    routes: Trade<Currency, Currency, TradeType>[];
  }>(
    Array,
    (a, b) => (quoteCompFn(a.quote, b.quote) ? -1 : 1),
    3
  );

  const { minSplits, maxSplits } = swapRouteConfig;

  // Проверяем наличие маршрута для 100% и инициализируем начальные данные
  if (!percentToSortedQuotes[100] || minSplits > 1) {
    console.log('Did not find a valid route without any splits. Continuing search anyway.');
  } else {
    bestQuote = percentToSortedQuotes[100][0].outputAmount;
    bestSwap = [percentToSortedQuotes[100][0]];

    for (const routeWithQuote of percentToSortedQuotes[100].slice(0, 5)) {
      bestSwapsPerSplit.push({
        quote: routeWithQuote.outputAmount,
        routes: [routeWithQuote],
      });
    }
  }

  // Очередь для обработки комбинаций маршрутов
  const queue = new Queue<{
    percentIndex: number;
    curRoutes: Trade<Currency, Currency, TradeType>[];
    remainingPercent: number;
    special: boolean;
  }>();

  if (percents.length === 0) return null;

  // Инициализируем очередь с топ-2 маршрутами для каждого процента
  for (let i = percents.length - 1; i >= 0; i--) {
    const percent = percents[i];
    if (!percentToSortedQuotes[percent]) continue;

    const topRoutes = percentToSortedQuotes[percent].slice(0, 2);
    if (topRoutes[0]) {
      queue.enqueue({
        curRoutes: [topRoutes[0]],
        percentIndex: i,
        remainingPercent: 100 - percent,
        special: false,
      });
    }
    if (topRoutes[1]) {
      queue.enqueue({
        curRoutes: [topRoutes[1]],
        percentIndex: i,
        remainingPercent: 100 - percent,
        special: true,
      });
    }
  }

  let splits = 1;

  // Основной цикл поиска лучших маршрутов
  while (queue.size > 0) {
    bestSwapsPerSplit.clear();

    let layer = queue.size;
    splits++;

    if (splits >= 3 && bestSwap && bestSwap.length < splits - 1) {
      break;
    }

    if (splits > maxSplits) {
      break;
    }

    while (layer > 0) {
      layer--;

      const { remainingPercent, curRoutes, percentIndex, special } = queue.dequeue()!;

      for (let i = percentIndex; i >= 0; i--) {
        const percentA = percents[i];
        if (percentA > remainingPercent) continue;
        if (!percentToSortedQuotes[percentA]) continue;

        const candidateRoutesA = percentToSortedQuotes[percentA];
        const routeWithQuoteA = findFirstRouteNotUsingUsedPools(curRoutes, candidateRoutesA, routeToMask);

        if (!routeWithQuoteA) continue;

        const remainingPercentNew = remainingPercent - percentA;
        const curRoutesNew = curRoutes.slice();
        curRoutesNew.push(routeWithQuoteA);

        if (remainingPercentNew === 0 && splits >= minSplits) {
          const quotesNew = curRoutesNew.map(r => r.outputAmount);
          const quoteNew = sumFn(quotesNew);

          bestSwapsPerSplit.push({
            quote: quoteNew,
            routes: curRoutesNew,
          });

          if (!bestQuote || quoteCompFn(quoteNew, bestQuote)) {
            bestQuote = quoteNew;
            bestSwap = curRoutesNew;
          }
        } else {
          queue.enqueue({
            curRoutes: curRoutesNew,
            remainingPercent: remainingPercentNew,
            percentIndex: i,
            special,
          });
        }
      }
    }
  }

  if (!bestSwap) {
    console.log('Could not find a valid swap');
    return null;
  }

  const quote = sumFn(bestSwap.map(routeWithValidQuote => routeWithValidQuote.outputAmount));
  const routeWithQuotes = bestSwap.sort((routeAmountA, routeAmountB) =>
    routeAmountB.outputAmount.greaterThan(routeAmountA.outputAmount) ? 1 : -1
  );

  return routeWithQuotes;
}

// Вспомогательная функция для поиска маршрута без пересекающихся пулов
const findFirstRouteNotUsingUsedPools = (
  usedRoutes: Trade<Currency, Currency, TradeType>[],
  candidateRoutes: Trade<Currency, Currency, TradeType>[],
  routeToMask: Map<Trade<Currency, Currency, TradeType>, number>
): Trade<Currency, Currency, TradeType> | null => {
  let usedMask = 0;
  for (const route of usedRoutes) {
    usedMask |= routeToMask.get(route)!;
  }

  for (const candidate of candidateRoutes) {
    const candidateMask = routeToMask.get(candidate)!;
    if ((candidateMask & usedMask) === 0) {
      return candidate;
    }
  }

  return null;
};
