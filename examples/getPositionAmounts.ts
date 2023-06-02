import fetch from 'node-fetch'

// Alcor v2 sdk: https://github.com/alcorexchange/alcor-v2-sdk
import { Token, Position, Pool } from '../src'
import { fetchAllRows } from './utils/rpc'

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

const rpc = new JsonRpc('https://wax-api.alcor.exchange', { fetch });

const types: any = Serialize.createInitialTypes()

export const nameToUint64 = (name) => {
  const ser = new Serialize.SerialBuffer()
  ser.pushName(name)
  return types.get('uint64').deserialize(ser)
}

async function main() {
  const account = '3mob2.wam'

  const pools = await fetchAllRows(rpc, {
    scope: 'swap.alcor',
    table: 'pools',
    code: 'swap.alcor',
  })

  // First pool for example (TLM / WAX)
  // const poolRow= pools[0]

  // Or Specific pool
  const poolRow= pools.find(p => p.id == 205)

  const { id, tokenA, tokenB, currSlot: { sqrtPriceX64, tick } } = poolRow

  // Or Specific pool
  //const { id, tokenA, tokenB, currSlot: { sqrtPriceX64, tick } } = poolRow

  const ticks = await fetchAllRows(rpc, {
    scope: id,
    table: 'ticks',
    code: 'swap.alcor',
  })

  const pool = new Pool({
    ...poolRow,
    tokenA: parseToken(tokenA),
    tokenB: parseToken(tokenB),
    sqrtPriceX64,
    tickCurrent: tick,
    ticks: ticks.sort((a, b) => a.id - b.id)
  })

  const { rows: positions } = await rpc.get_table_rows({
    scope: pool.id,
    table: 'positions',
    code: 'swap.alcor',

    // TO get positions by account name
    // key_type: 'i64',
    // index_position: 3,
    // lower_bound: nameToUint64(account),
    // upper_bound: nameToUint64(account)
  })

  // or Specific position by id
  // const { rows: positions } = await rpc.get_table_rows({
  //   scope: pool.id,
  //   table: 'positions',
  //   code: 'swap.alcor',
  //   lower_bound: 14235,
  //   upper_bound: 14235
  // })

  //console.log({ pool: pool.id, positions })

  const position = new Position({
    ...positions[0], // Only first of account position
    pool
  })

  console.log('amountA:', position.amountA.toAsset())
  console.log('amountB:', position.amountB.toAsset())

  // fees:
  const { feesA, feesB } = await position.getFees()

  console.log('feesA', feesA.toAsset())
  console.log('feesB', feesB.toAsset())
}

main()

// amountA: 103.4332 TLM
// amountB: 29.16056021 WAX
