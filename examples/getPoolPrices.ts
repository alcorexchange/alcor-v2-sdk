import fetch from 'node-fetch'

// Alcor v2 sdk: https://github.com/alcorexchange/alcor-v2-sdk
import { Token, Pool  } from '../src'

import { asset } from 'eos-common'
import { JsonRpc } from 'eosjs'

export function parseToken(token) {
  return new Token(
    token.contract,
    asset(token.quantity).symbol.precision(),
    asset(token.quantity).symbol.code().to_string(),
    (asset(token.quantity).symbol.code().to_string() + '-' + token.contract).toLowerCase()
  )
}

const rpc = new JsonRpc('https://waxnode02.alcor.exchange', { fetch });

async function main() {
  const { rows } = await rpc.get_table_rows({
    scope: 'swap.alcor',
    table: 'pools',
    code: 'swap.alcor',
  })

  // First pool for example
  const { tokenA, tokenB, currSlot: { sqrtPriceX64, tick } } = rows[0]

  const pool = new Pool({
    ...rows[0],
    tokenA: parseToken(tokenA),
    tokenB: parseToken(tokenB),
    sqrtPriceX64,
    tickCurrent: tick
  })

  console.log('priceA', pool.tokenAPrice.toFixed())
  console.log('priceB', pool.tokenBPrice.toFixed())
}

main()

//priceA 0.2820
//priceB 3.5466
