import Queue from 'mnemonist/queue'

import { Currency } from '../entities/currency'
import { Route } from '../entities/route'
import { CurrencyAmount } from '../entities/fractions'
import { TradeType } from '../internalConstants'

export interface SplitRouteQuote {
  percent: number
  route: Route<Currency, Currency>
  inputAmount: CurrencyAmount<Currency>
  outputAmount: CurrencyAmount<Currency>
}

interface SwapRouteConfig {
  minSplits: number
  maxSplits: number
  branchFactor?: number
  candidateLimit?: number
}

export function getBestSwapRoute(
  routeType: TradeType,
  percentToQuotes: { [percent: number]: SplitRouteQuote[] },
  percents: number[],
  swapRouteConfig: SwapRouteConfig = { minSplits: 1, maxSplits: 8 }
): SplitRouteQuote[] | null {
  const { minSplits, maxSplits, branchFactor = 1, candidateLimit = 0 } = swapRouteConfig
  const branchWidth = Math.max(1, branchFactor)

  const quoteCompFn =
    routeType === TradeType.EXACT_INPUT
      ? (a: CurrencyAmount<Currency>, b: CurrencyAmount<Currency>) => a.greaterThan(b)
      : (a: CurrencyAmount<Currency>, b: CurrencyAmount<Currency>) => a.lessThan(b)

  const quoteOf =
    routeType === TradeType.EXACT_INPUT
      ? (q: SplitRouteQuote) => q.outputAmount
      : (q: SplitRouteQuote) => q.inputAmount

  // Build pool bit ids without intermediate arrays.
  const poolToBit = new Map<number, bigint>()
  let bitCounter = BigInt(0)

  for (const quotes of Object.values(percentToQuotes)) {
    for (const quote of quotes) {
      for (const pool of quote.route.pools) {
        if (!poolToBit.has(pool.id)) {
          poolToBit.set(pool.id, BigInt(1) << bitCounter)
          bitCounter += BigInt(1)
        }
      }
    }
  }

  const routeToMask = new Map<SplitRouteQuote, bigint>()
  for (const quotes of Object.values(percentToQuotes)) {
    for (const quote of quotes) {
      let mask = BigInt(0)
      for (const pool of quote.route.pools) {
        mask |= poolToBit.get(pool.id)!
      }
      routeToMask.set(quote, mask)
    }
  }

  const percentToSortedQuotes: { [percent: number]: SplitRouteQuote[] } = {}
  for (const percent in percentToQuotes) {
    const sorted = percentToQuotes[percent].sort((a, b) => {
      const qa = quoteOf(a)
      const qb = quoteOf(b)
      return quoteCompFn(qa, qb) ? -1 : 1
    })

    percentToSortedQuotes[percent] =
      candidateLimit > 0 && sorted.length > candidateLimit ? sorted.slice(0, candidateLimit) : sorted
  }

  let bestQuote: CurrencyAmount<Currency> | undefined
  let bestSwap: SplitRouteQuote[] | undefined

  if ((!percentToSortedQuotes[100] || percentToSortedQuotes[100].length === 0) && minSplits <= 1) {
    console.log('Did not find a valid route without any splits. Continuing search anyway.')
  } else if (minSplits <= 1 && percentToSortedQuotes[100] && percentToSortedQuotes[100][0]) {
    bestSwap = [percentToSortedQuotes[100][0]]
    bestQuote = quoteOf(percentToSortedQuotes[100][0])
  }

  const queue = new Queue<{
    percentIndex: number
    curRoutes: SplitRouteQuote[]
    remainingPercent: number
    usedMask: bigint
    quoteSoFar: CurrencyAmount<Currency>
  }>()

  if (percents.length === 0) return null

  for (let i = percents.length - 1; i >= 0; i--) {
    const percent = percents[i]
    const candidates = percentToSortedQuotes[percent]
    if (!candidates || candidates.length === 0) continue

    const seeds = candidates.slice(0, branchWidth)
    for (const seed of seeds) {
      queue.enqueue({
        curRoutes: [seed],
        percentIndex: i,
        remainingPercent: 100 - percent,
        usedMask: routeToMask.get(seed)!,
        quoteSoFar: quoteOf(seed)
      })
    }
  }

  let splits = 1

  while (queue.size > 0) {
    let layer = queue.size
    splits++

    if (splits >= 3 && bestSwap && bestSwap.length < splits - 1) {
      break
    }

    if (splits > maxSplits) {
      break
    }

    while (layer > 0) {
      layer--

      const { remainingPercent, curRoutes, percentIndex, usedMask, quoteSoFar } = queue.dequeue()!

      for (let i = percentIndex; i >= 0; i--) {
        const percent = percents[i]
        if (percent > remainingPercent) continue

        const candidates = percentToSortedQuotes[percent]
        if (!candidates || candidates.length === 0) continue

        const routeCandidates = findRoutesNotUsingUsedPools(usedMask, candidates, routeToMask, branchWidth)
        if (routeCandidates.length === 0) continue

        for (const candidate of routeCandidates) {
          const remainingPercentNew = remainingPercent - percent
          const usedMaskNew = usedMask | routeToMask.get(candidate)!
          const quoteNew = quoteSoFar.add(quoteOf(candidate))

          if (remainingPercentNew === 0 && splits >= minSplits) {
            const curRoutesNew = curRoutes.slice()
            curRoutesNew.push(candidate)

            if (!bestQuote || quoteCompFn(quoteNew, bestQuote)) {
              bestQuote = quoteNew
              bestSwap = curRoutesNew
            }
          } else {
            const curRoutesNew = curRoutes.slice()
            curRoutesNew.push(candidate)
            queue.enqueue({
              curRoutes: curRoutesNew,
              remainingPercent: remainingPercentNew,
              percentIndex: i,
              usedMask: usedMaskNew,
              quoteSoFar: quoteNew
            })
          }
        }
      }
    }
  }

  if (!bestSwap) {
    console.log('Could not find a valid swap')
    return null
  }

  return bestSwap
}

const findRoutesNotUsingUsedPools = (
  usedMask: bigint,
  candidateRoutes: SplitRouteQuote[],
  routeToMask: Map<SplitRouteQuote, bigint>,
  limit: number
): SplitRouteQuote[] => {
  const result: SplitRouteQuote[] = []

  for (const candidate of candidateRoutes) {
    const candidateMask = routeToMask.get(candidate)!
    if ((candidateMask & usedMask) === BigInt(0)) {
      result.push(candidate)
      if (result.length >= limit) return result
    }
  }

  return result
}
