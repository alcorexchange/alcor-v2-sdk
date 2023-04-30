import fetch from 'node-fetch'

// Alcor v2 sdk: https://github.com/alcorexchange/alcor-v2-sdk
import { Token, Position, Pool } from '../src'

import { asset } from 'eos-common'
import { JsonRpc } from 'eosjs'
import { Serialize } from 'eosjs'


export function parseToken(token) {
  return new Token(
    token.contract,
    asset(token.quantity).symbol.precision(),
    asset(token.quantity).symbol.code().to_string(),
    (asset(token.quantity).symbol.code().to_string() + '-' + token.contract).toLowerCase()
  )
}

const rpc = new JsonRpc('https://waxnode02.alcor.exchange', { fetch });

const types: any = Serialize.createInitialTypes()

export const nameToUint64 = (name) => {
  const ser = new Serialize.SerialBuffer()
  ser.pushName(name)
  return types.get('uint64').deserialize(ser)
}

async function main() {
  const account = '3mob2.wam'

  const { rows: pools } = await rpc.get_table_rows({
    scope: 'swap.alcor',
    table: 'pools',
    code: 'swap.alcor',
  })

  // First pool for example (TLM / WAX)
  const { tokenA, tokenB, currSlot: { sqrtPriceX64, tick } } = pools[0]

  const pool = new Pool({
    ...pools[0],
    tokenA: parseToken(tokenA),
    tokenB: parseToken(tokenB),
    sqrtPriceX64,
    tickCurrent: tick
  })

  const { rows: positions } = await rpc.get_table_rows({
    scope: pool.id,
    table: 'positions',
    code: 'swap.alcor',
    key_type: 'i64',
    index_position: 3,
    lower_bound: nameToUint64(account),
    upper_bound: nameToUint64(account)
  })


  const position = new Position({
    ...positions[0], // Only first of account position
    pool
  })

  console.log('amountA:', position.amountA.toAsset())
  console.log('amountB:', position.amountB.toAsset())
}

main()

// amountA: 103.4332 TLM
// amountB: 29.16056021 WAX
