import _ from 'lodash'
import Queue from 'mnemonist/queue'
import FixedReverseHeap from 'mnemonist/fixed-reverse-heap'

import { Currency } from '../entities/currency'
import { Trade } from '../entities/trade'
import { CurrencyAmount } from '../entities/fractions'
import { TradeType } from '../internalConstants'

export function getBestSwapRoute(
  routeType: TradeType,
  percentToQuotes: { [percent: number]: Trade<Currency, Currency, TradeType>[] },
  percents: number[],
  swapRouteConfig = { minSplits: 1, maxSplits: 8 }
): Trade<Currency, Currency, TradeType>[] | null {
  const percentToSortedQuotes = _.mapValues(
    percentToQuotes,
    (routeQuotes: Trade<Currency, Currency, TradeType>[]) => {
      return routeQuotes.sort((routeQuoteA, routeQuoteB) => {
        if (routeType == TradeType.EXACT_INPUT) {
          return routeQuoteA.outputAmount.greaterThan(routeQuoteB.outputAmount) ? -1 : 1;
        } else {
          return routeQuoteA.inputAmount.lessThan(routeQuoteB.inputAmount) ? -1 : 1;
        }
      });
    }
  );

  const quoteCompFn =
    routeType == TradeType.EXACT_INPUT
      ? (a: CurrencyAmount<Currency>, b: CurrencyAmount<Currency>) => a.greaterThan(b)
      : (a: CurrencyAmount<Currency>, b: CurrencyAmount<Currency>) => a.lessThan(b);

  const sumFn = (currencyAmounts: CurrencyAmount<Currency>[]): CurrencyAmount<Currency> => {
    let sum = currencyAmounts[0]!;
    for (let i = 1; i < currencyAmounts.length; i++) {
      sum = sum.add(currencyAmounts[i]!);
    }
    return sum;
  };

  let bestQuote: CurrencyAmount<Currency> | undefined;
  let bestSwap: Trade<Currency, Currency, TradeType>[] | undefined;

  const bestSwapsPerSplit = new FixedReverseHeap<{
    quote: CurrencyAmount<Currency>;
    routes: Trade<Currency, Currency, TradeType>[];
  }>(
    Array,
    (a, b) => {
      return quoteCompFn(a.quote, b.quote) ? -1 : 1;
    },
    3
  );

  const { minSplits, maxSplits } = swapRouteConfig;

  if (!percentToSortedQuotes[100] || minSplits > 1) {
    console.log(
      {
        percentToSortedQuotes: _.mapValues(
          percentToSortedQuotes,
          (p) => p.length
        ),
      },
      'Did not find a valid route without any splits. Continuing search anyway.'
    );
  } else {
    bestQuote = percentToSortedQuotes[100][0]!.outputAmount;
    bestSwap = [percentToSortedQuotes[100][0]!];

    for (const routeWithQuote of percentToSortedQuotes[100].slice(0, 5)) {
      bestSwapsPerSplit.push({
        quote: routeWithQuote.outputAmount,
        routes: [routeWithQuote],
      });
    }
  }

  const queue = new Queue<{
    percentIndex: number;
    curRoutes: Trade<Currency, Currency, TradeType>[];
    remainingPercent: number;
    special: boolean;
  }>();

  if (percents.length === 0) return null; // Handle empty percents array

  for (let i = percents.length - 1; i >= 0; i--) {
    const percent = percents[i];

    if (!percentToSortedQuotes[percent]) {
      console.log('continue', { percent });
      continue;
    }

    queue.enqueue({
      curRoutes: [percentToSortedQuotes[percent]![0]!],
      percentIndex: i,
      remainingPercent: 100 - percent,
      special: false,
    });

    if (
      !percentToSortedQuotes[percent] ||
      !percentToSortedQuotes[percent]![1]
    ) {
      console.log('continue2', { percent });
      continue;
    }

    queue.enqueue({
      curRoutes: [percentToSortedQuotes[percent]![1]!],
      percentIndex: i,
      remainingPercent: 100 - percent,
      special: true,
    });
  }

  let splits = 1;

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

      const { remainingPercent, curRoutes, percentIndex, special } =
        queue.dequeue()!;

      for (let i = percentIndex; i >= 0; i--) {
        const percentA = percents[i]!;

        if (percentA > remainingPercent) {
          continue;
        }

        if (!percentToSortedQuotes[percentA]) {
          continue;
        }

        const candidateRoutesA = percentToSortedQuotes[percentA]!;

        const routeWithQuoteA = findFirstRouteNotUsingUsedPools(
          curRoutes,
          candidateRoutesA,
        );

        if (!routeWithQuoteA) {
          continue;
        }

        const remainingPercentNew = remainingPercent - percentA;
        const curRoutesNew = [...curRoutes, routeWithQuoteA];

        if (remainingPercentNew == 0 && splits >= minSplits) {
          const quotesNew = _.map(curRoutesNew, (r) => r.outputAmount);
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
    console.log(`Could not find a valid swap`);
    return null;
  }

  const quote = sumFn(
    _.map(bestSwap, (routeWithValidQuote) => routeWithValidQuote.outputAmount)
  );

  const routeWithQuotes = bestSwap.sort((routeAmountA, routeAmountB) =>
    routeAmountB.outputAmount.greaterThan(routeAmountA.outputAmount) ? 1 : -1
  );

  return routeWithQuotes;
}


const findFirstRouteNotUsingUsedPools = (
  usedRoutes: Trade<Currency, Currency, TradeType>[],
  candidateRoutes: Trade<Currency, Currency, TradeType>[],
): Trade<Currency, Currency, TradeType> | null => {
  const usedPools = new Set<number>();
  usedRoutes.forEach(r => r.route.pools.forEach(pool => usedPools.add(pool.id)));

  for (const candidate of candidateRoutes) {
    if (candidate.route.pools.every(pool => !usedPools.has(pool.id))) {
      return candidate;
    }
  }

  return null;
}
