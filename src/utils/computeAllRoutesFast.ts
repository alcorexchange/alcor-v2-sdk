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
 * Ultra-fast WASM route finder with persistent pool storage
 * Loads pools once and reuses for multiple queries
 */
export class WASMRouteFast {
  private initialized = false;
  private pools: Pool[] = [];
  private poolsMap: Map<string, Pool> = new Map();

  async initialize(pools: Pool[]): Promise<void> {
    await loadWasmModule();
    
    this.pools = pools;
    this.poolsMap.clear();
    
    // Build pool map for fast lookup
    for (const pool of pools) {
      this.poolsMap.set(String(pool.id), pool);
    }
    
    // Convert pools to minimal format for WASM
    const wasmPools = pools.map(pool => ({
      id: String(pool.id),
      token_a: { id: pool.tokenA.id },
      token_b: { id: pool.tokenB.id }
    }));
    
    // Initialize pools in WASM memory once
    wasmModule.init_pools_fast(wasmPools);
    this.initialized = true;
  }

  computeAllRoutes(
    tokenIn: Token,
    tokenOut: Token,
    maxHops: number
  ): Route<Token, Token>[] {
    if (!this.initialized) {
      throw new Error('WASMRouteFast not initialized. Call initialize() first.');
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
   * Update specific pools without full reinitialization
   */
  async updatePools(updatedPools: Pool[]): Promise<void> {
    // For now, reinitialize with all pools
    // In future, could implement partial updates
    const poolIds = new Set(updatedPools.map(p => String(p.id)));
    
    // Merge updated pools with existing ones
    const newPools = [...this.pools];
    for (let i = 0; i < newPools.length; i++) {
      if (poolIds.has(String(newPools[i].id))) {
        const updated = updatedPools.find(p => String(p.id) === String(newPools[i].id));
        if (updated) {
          newPools[i] = updated;
        }
      }
    }
    
    await this.initialize(newPools);
  }

  /**
   * Benchmark function to measure pure computation time
   */
  benchmarkCompute(
    tokenIn: Token,
    tokenOut: Token,
    maxHops: number,
    iterations: number = 100
  ): { totalTime: number; avgTime: number; routesFound: number } {
    if (!this.initialized) {
      throw new Error('WASMRouteFast not initialized. Call initialize() first.');
    }
    
    const start = performance.now();
    let routesFound = 0;
    
    for (let i = 0; i < iterations; i++) {
      const routes = wasmModule.compute_routes_fast(
        tokenIn.id,
        tokenOut.id,
        maxHops
      );
      routesFound = routes.length;
    }
    
    const totalTime = performance.now() - start;
    
    return {
      totalTime,
      avgTime: totalTime / iterations,
      routesFound
    };
  }
}

/**
 * Standalone fast computation for one-off use
 */
export async function computeAllRoutesFast(
  tokenIn: Token,
  tokenOut: Token,
  pools: Pool[],
  maxHops: number
): Promise<Route<Token, Token>[]> {
  const finder = new WASMRouteFast();
  await finder.initialize(pools);
  return finder.computeAllRoutes(tokenIn, tokenOut, maxHops);
}