# alcor-v2-sdk

## Installation
​​
**npm** 
```
npm i @alcorexchange/alcor-swap-sdk
``` 
**yarn** 
```
yarn add @alcorexchange/alcor-swap-sdk
``` 
## Usage
### Import:

ES6

```js
import SwapSDK from '@alcorexchange/alcor-swap-sdk'
```  

CommonJS

```js
const SwapSDK = require('@alcorexchange/alcor-swap-sdk')
```

### Initialization:

```ts 
import fetch from 'node-fetch'

import { Token, Pool  } from '@alcorexchange/alcor-swap-sdk'

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

  const { tokenA, tokenB, currSlot: { sqrtPriceX64, tick } } = rows[0]

  const pool = new Pool({
    ...rows[0],
    tokenA: parseToken(tokenA),
    tokenB: parseToken(tokenB),
    sqrtPriceX64,
    tickCurrent: tick
  })
  
  // Do you thing with pool here
}
```
## Examples
The examples can be found in examples/ directory.
