use wasm_bindgen::prelude::*;
use serde_json;
use serde_wasm_bindgen;
use std::collections::{HashMap, BTreeMap};
use std::sync::Mutex;
use once_cell::sync::Lazy;

mod u256;
mod swap_math;
mod trade;

use trade::{PoolData, TickData, calculate_route_output, calculate_trades_batch};

#[derive(Clone)]
struct FastPool {
    id: String,
    token_a_id: String,
    token_b_id: String,
}

struct GlobalPools {
    pools: Vec<FastPool>,
    pools_by_token: HashMap<String, Vec<usize>>,
    full_pools: HashMap<u32, PoolData>, // For swap calculations
}

static GLOBAL_POOLS: Lazy<Mutex<Option<GlobalPools>>> = Lazy::new(|| Mutex::new(None));

#[wasm_bindgen]
pub fn init_pools_fast(pools_js: JsValue) -> Result<(), JsValue> {
    let pools_data: Vec<serde_json::Value> = serde_wasm_bindgen::from_value(pools_js)?;
    
    let mut pools = Vec::with_capacity(pools_data.len());
    let mut pools_by_token: HashMap<String, Vec<usize>> = HashMap::new();
    
    for (idx, pool_data) in pools_data.iter().enumerate() {
        let id = pool_data["id"].as_str().unwrap_or("").to_string();
        let token_a_id = pool_data["token_a"]["id"].as_str().unwrap_or("").to_string();
        let token_b_id = pool_data["token_b"]["id"].as_str().unwrap_or("").to_string();
        
        let pool = FastPool {
            id: id.clone(),
            token_a_id: token_a_id.clone(),
            token_b_id: token_b_id.clone(),
        };
        
        pools.push(pool);
        
        // Build index
        pools_by_token.entry(token_a_id).or_insert_with(Vec::new).push(idx);
        pools_by_token.entry(token_b_id).or_insert_with(Vec::new).push(idx);
    }
    
    let mut global = GLOBAL_POOLS.lock().unwrap();
    *global = Some(GlobalPools { 
        pools, 
        pools_by_token,
        full_pools: HashMap::new() 
    });
    
    Ok(())
}

#[wasm_bindgen]
pub fn update_pools_fast(pools_js: JsValue) -> Result<(), JsValue> {
    let pools_data: Vec<serde_json::Value> = serde_wasm_bindgen::from_value(pools_js)?;
    
    let mut global = GLOBAL_POOLS.lock().unwrap();
    let mut pools_state = global.take().unwrap_or(GlobalPools {
        pools: Vec::new(),
        pools_by_token: HashMap::new(),
        full_pools: HashMap::new(),
    });
    
    // Create a map of existing pools for fast lookup
    let mut existing_pools: HashMap<String, usize> = HashMap::new();
    for (idx, pool) in pools_state.pools.iter().enumerate() {
        existing_pools.insert(pool.id.clone(), idx);
    }
    
    // Update existing pools and add new ones
    for pool_data in pools_data.iter() {
        let id = pool_data["id"].as_str().unwrap_or("").to_string();
        let token_a_id = pool_data["token_a"]["id"].as_str().unwrap_or("").to_string();
        let token_b_id = pool_data["token_b"]["id"].as_str().unwrap_or("").to_string();
        
        let new_pool = FastPool {
            id: id.clone(),
            token_a_id: token_a_id.clone(),
            token_b_id: token_b_id.clone(),
        };
        
        if let Some(&idx) = existing_pools.get(&id) {
            // Update existing pool
            pools_state.pools[idx] = new_pool;
        } else {
            // Add new pool
            let idx = pools_state.pools.len();
            pools_state.pools.push(new_pool);
            existing_pools.insert(id, idx);
        }
    }
    
    // Rebuild the index
    pools_state.pools_by_token.clear();
    for (idx, pool) in pools_state.pools.iter().enumerate() {
        pools_state.pools_by_token
            .entry(pool.token_a_id.clone())
            .or_insert_with(Vec::new)
            .push(idx);
        pools_state.pools_by_token
            .entry(pool.token_b_id.clone())
            .or_insert_with(Vec::new)
            .push(idx);
    }
    
    *global = Some(pools_state);
    Ok(())
}

#[wasm_bindgen]
pub fn compute_routes_fast(
    token_in_id: String,
    token_out_id: String,
    max_hops: usize,
) -> Result<JsValue, JsValue> {
    let global = GLOBAL_POOLS.lock().unwrap();
    let pools_data = global.as_ref().ok_or_else(|| JsValue::from_str("Pools not initialized"))?;
    
    let mut routes = Vec::new();
    let mut current_path = Vec::new();
    let mut used_pools = vec![false; pools_data.pools.len()];
    
    dfs_fast(
        &token_in_id,
        &token_out_id,
        &mut current_path,
        &mut used_pools,
        &mut routes,
        max_hops,
        &pools_data.pools,
        &pools_data.pools_by_token,
    );
    
    // Return only pool IDs to minimize serialization
    let route_ids: Vec<Vec<String>> = routes.iter()
        .map(|route| route.iter().map(|&idx| pools_data.pools[idx].id.clone()).collect())
        .collect();
    
    Ok(serde_wasm_bindgen::to_value(&route_ids)?)
}

fn dfs_fast(
    current_token_id: &str,
    target_token_id: &str,
    current_path: &mut Vec<usize>,
    used_pools: &mut Vec<bool>,
    routes: &mut Vec<Vec<usize>>,
    max_hops: usize,
    pools: &[FastPool],
    pools_by_token: &HashMap<String, Vec<usize>>,
) {
    if current_path.len() > max_hops {
        return;
    }
    
    if !current_path.is_empty() {
        let last_pool_idx = current_path[current_path.len() - 1];
        let last_pool = &pools[last_pool_idx];
        
        if last_pool.token_a_id == target_token_id || last_pool.token_b_id == target_token_id {
            routes.push(current_path.clone());
            return;
        }
    }
    
    if let Some(pool_indices) = pools_by_token.get(current_token_id) {
        for &pool_idx in pool_indices {
            if used_pools[pool_idx] {
                continue;
            }
            
            let pool = &pools[pool_idx];
            let next_token_id = if pool.token_a_id == current_token_id {
                &pool.token_b_id
            } else {
                &pool.token_a_id
            };
            
            current_path.push(pool_idx);
            used_pools[pool_idx] = true;
            
            dfs_fast(
                next_token_id,
                target_token_id,
                current_path,
                used_pools,
                routes,
                max_hops,
                pools,
                pools_by_token,
            );
            
            current_path.pop();
            used_pools[pool_idx] = false;
        }
    }
}

#[wasm_bindgen]
pub fn clear_pools() {
    let mut global = GLOBAL_POOLS.lock().unwrap();
    *global = None;
}

#[wasm_bindgen]
pub fn get_pool_count() -> usize {
    let global = GLOBAL_POOLS.lock().unwrap();
    global.as_ref().map(|p| p.pools.len()).unwrap_or(0)
}

#[wasm_bindgen]
pub fn init_pools_with_data(pools_js: JsValue) -> Result<(), JsValue> {
    let pools_data: Vec<serde_json::Value> = serde_wasm_bindgen::from_value(pools_js)?;
    
    let mut pools = Vec::with_capacity(pools_data.len());
    let mut pools_by_token: HashMap<String, Vec<usize>> = HashMap::new();
    let mut full_pools: HashMap<u32, PoolData> = HashMap::new();
    
    for (idx, pool_data) in pools_data.iter().enumerate() {
        let id = pool_data["id"].as_str().unwrap_or("").to_string();
        let id_num = id.parse::<u32>().unwrap_or(0);
        let token_a_id = pool_data["token_a"]["id"].as_str().unwrap_or("").to_string();
        let token_b_id = pool_data["token_b"]["id"].as_str().unwrap_or("").to_string();
        
        // Create fast pool for routing
        let pool = FastPool {
            id: id.clone(),
            token_a_id: token_a_id.clone(),
            token_b_id: token_b_id.clone(),
        };
        
        pools.push(pool);
        
        // Build index
        pools_by_token.entry(token_a_id.clone()).or_insert_with(Vec::new).push(idx);
        pools_by_token.entry(token_b_id.clone()).or_insert_with(Vec::new).push(idx);
        
        // Create full pool data if swap data is provided
        if let (Some(fee), Some(sqrt_price), Some(liquidity), Some(tick)) = (
            pool_data["fee"].as_u64(),
            pool_data["sqrtPriceX64"].as_str(),
            pool_data["liquidity"].as_str(),
            pool_data["tickCurrent"].as_i64(),
        ) {
            let sqrt_price_x64 = sqrt_price.parse::<u128>().unwrap_or(0);
            let liquidity_val = liquidity.parse::<u128>().unwrap_or(0);
            
            // Parse ticks if provided
            let mut ticks = BTreeMap::new();
            if let Some(ticks_array) = pool_data["ticks"].as_array() {
                for tick in ticks_array {
                    let index = tick["id"].as_i64().or_else(|| tick["index"].as_i64());
                    let liquidity_net = tick["liquidityNet"].as_str()
                        .or_else(|| tick["liquidity_net"].as_str());
                    let liquidity_gross = tick["liquidityGross"].as_str()
                        .or_else(|| tick["liquidity_gross"].as_str());
                    
                    if let (Some(idx), Some(net)) = (index, liquidity_net) {
                        let tick_data = TickData {
                            index: idx as i32,
                            liquidity_gross: liquidity_gross
                                .and_then(|s| s.parse::<u128>().ok())
                                .unwrap_or(0),
                            liquidity_net: net.parse::<i128>().unwrap_or(0),
                            fee_growth_outside_a_x64: 0, // Would need to parse from data
                            fee_growth_outside_b_x64: 0,
                            initialized: true,
                        };
                        ticks.insert(idx as i32, tick_data);
                    }
                }
            }
            
            let tick_spacing = match fee {
                100 => 1,
                500 => 10,
                3000 => 60,
                10000 => 200,
                _ => 60,
            };
            
            let pool_data = PoolData {
                id: id_num,
                token_a_id: token_a_id.clone(),
                token_b_id: token_b_id.clone(),
                fee: fee as u32,
                sqrt_price_x64,
                liquidity: liquidity_val,
                tick_current: tick as i32,
                ticks,
                tick_spacing: tick_spacing as i32,
            };
            
            full_pools.insert(id_num, pool_data);
        }
    }
    
    let mut global = GLOBAL_POOLS.lock().unwrap();
    *global = Some(GlobalPools { pools, pools_by_token, full_pools });
    
    Ok(())
}

#[wasm_bindgen]
pub fn calculate_trade_output(
    route_pool_ids: Vec<u32>,
    amount_in: String,
    token_in_id: String,
) -> Result<JsValue, JsValue> {
    let global = GLOBAL_POOLS.lock().unwrap();
    let pools_data = global.as_ref().ok_or_else(|| JsValue::from_str("Pools not initialized"))?;
    
    let amount = amount_in.parse::<u128>()
        .map_err(|_| JsValue::from_str("Invalid amount"))?;
    
    let result = calculate_route_output(
        &pools_data.full_pools,
        &route_pool_ids,
        amount,
        &token_in_id,
    ).map_err(|e| JsValue::from_str(&e))?;
    
    Ok(serde_wasm_bindgen::to_value(&serde_json::json!({
        "amountIn": result.amount_in.to_string(),
        "amountOut": result.amount_out.to_string(),
        "route": result.route,
        "priceImpact": result.price_impact,
    }))?)
}

#[wasm_bindgen]
pub fn calculate_trades_for_routes(
    routes_js: JsValue,
    amounts_js: JsValue,
    token_in_id: String,
) -> Result<JsValue, JsValue> {
    let global = GLOBAL_POOLS.lock().unwrap();
    let pools_data = global.as_ref().ok_or_else(|| JsValue::from_str("Pools not initialized"))?;
    
    let routes: Vec<Vec<u32>> = serde_wasm_bindgen::from_value(routes_js)?;
    let amounts_str: Vec<String> = serde_wasm_bindgen::from_value(amounts_js)?;
    
    let amounts: Vec<u128> = amounts_str.iter()
        .filter_map(|a| a.parse::<u128>().ok())
        .collect();
    
    let results = calculate_trades_batch(
        &pools_data.full_pools,
        &routes,
        &amounts,
        &token_in_id,
    );
    
    let json_results: Vec<serde_json::Value> = results.iter().map(|r| {
        match r {
            Ok(trade) => serde_json::json!({
                "success": true,
                "amountIn": trade.amount_in.to_string(),
                "amountOut": trade.amount_out.to_string(),
                "route": trade.route,
                "priceImpact": trade.price_impact,
            }),
            Err(e) => serde_json::json!({
                "success": false,
                "error": e,
            }),
        }
    }).collect();
    
    Ok(serde_wasm_bindgen::to_value(&json_results)?)
}