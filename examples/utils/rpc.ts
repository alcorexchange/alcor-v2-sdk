const MAX_PAGINATION_FETCHES = 99

export const fetchAllRows =
  async (rpc, options, indexName = 'id'): Promise<any> => {
    const mergedOptions = {
      json: true,
      lower_bound: 0,
      upper_bound: undefined,
      limit: 9999,
      ...options
    }

    let rows = []
    let lowerBound = mergedOptions.lower_bound

    for (let i = 0; i < MAX_PAGINATION_FETCHES; i += 1) {
      const result = await rpc.get_table_rows({
        ...mergedOptions,
        lower_bound: lowerBound
      })
      rows = rows.concat(result.rows)

      if (!result.more || result.rows.length === 0) break

      // EOS 2.0 api
      // TODO Add 'more' key
      if (typeof result.next_key !== 'undefined') {
        lowerBound = result.next_key
      } else {
        lowerBound =
          Number.parseInt(
            `${result.rows[result.rows.length - 1][indexName]}`,
            10
          ) + 1
      }
    }

    return rows
  }
