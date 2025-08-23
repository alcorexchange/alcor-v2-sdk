import { Token, Pool, Route } from '../entities';

// WASM imports - lazy loaded
let wasmModule: any = null;

async function loadWasmModule() {
  if (!wasmModule) {
    try {
      wasmModule = await import('../../wasm-route-finder/pkg/wasm_route_finder.js');
    } catch (error) {
      console.error('Failed to load WASM module:', error);
      throw new Error('WASM module not available');
    }
  }
  return wasmModule;
}

/**
 * Fast WASM route finder with persistent pool storage
 * Pools are loaded once and can be updated dynamically
 */
export class WASMRouteFinder {
  private initialized = false;
  private poolsMap: Map<string, Pool> = new Map();

  /**
   * Initialize with pools - loads them into WASM memory
   */
  async initialize(pools: Pool[]): Promise<void> {
    await loadWasmModule();
    
    // Build pool map for fast lookup
    this.poolsMap.clear();
    for (const pool of pools) {
      this.poolsMap.set(String(pool.id), pool);
    }
    
    // Convert pools to minimal format for WASM
    const wasmPools = pools.map(pool => ({
      id: String(pool.id),
      token_a: { id: pool.tokenA.id },
      token_b: { id: pool.tokenB.id }
    }));
    
    // Initialize pools in WASM memory
    wasmModule.init_pools_fast(wasmPools);
    this.initialized = true;
  }

  /**
   * Update pools (add new or update existing)
   * @param pools - Array of pools to update/add
   */
  async updatePools(pools: Pool[]): Promise<void> {
    if (!this.initialized) {
      await this.initialize(pools);
      return;
    }

    await loadWasmModule();
    
    // Update local map
    for (const pool of pools) {
      this.poolsMap.set(String(pool.id), pool);
    }
    
    // Convert to WASM format
    const wasmPools = pools.map(pool => ({
      id: String(pool.id),
      token_a: { id: pool.tokenA.id },
      token_b: { id: pool.tokenB.id }
    }));
    
    // Update pools in WASM
    wasmModule.update_pools_fast(wasmPools);
  }

  /**
   * Compute all routes between two tokens
   */
  computeAllRoutes(
    tokenIn: Token,
    tokenOut: Token,
    maxHops: number
  ): Route<Token, Token>[] {
    if (!this.initialized) {
      throw new Error('WASMRouteFinder not initialized. Call initialize() first.');
    }
    
    // Call WASM with just token IDs - no pool serialization
    const routePoolIds = wasmModule.compute_routes_fast(
      tokenIn.id,
      tokenOut.id,
      maxHops
    );
    
    // Convert pool IDs back to Route objects
    return routePoolIds.map((poolIds: string[]) => {
      const routePools = poolIds.map(poolId => {
        const pool = this.poolsMap.get(poolId);
        if (!pool) {
          throw new Error(`Pool not found: ${poolId}`);
        }
        return pool;
      });
      
      return new Route(routePools, tokenIn, tokenOut);
    });
  }

  /**
   * Get the number of pools currently loaded
   */
  getPoolCount(): number {
    if (!this.initialized) {
      return 0;
    }
    return wasmModule.get_pool_count();
  }

  /**
   * Clear all pools from memory
   */
  clear(): void {
    if (this.initialized) {
      wasmModule.clear_pools();
      this.poolsMap.clear();
      this.initialized = false;
    }
  }
}

/**
 * Convenience function for one-off route computation
 */
export async function computeAllRoutesWASM(
  tokenIn: Token,
  tokenOut: Token,
  pools: Pool[],
  maxHops: number
): Promise<Route<Token, Token>[]> {
  const finder = new WASMRouteFinder();
  await finder.initialize(pools);
  const routes = finder.computeAllRoutes(tokenIn, tokenOut, maxHops);
  finder.clear(); // Clean up after one-off use
  return routes;
}