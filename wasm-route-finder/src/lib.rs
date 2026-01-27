use wasm_bindgen::prelude::*;
use serde_json;
use serde_wasm_bindgen;
use std::collections::HashMap;
use std::sync::Mutex;
use once_cell::sync::Lazy;

#[derive(Clone)]
struct FastPool {
    id: String,
    token_a_id: String,
    token_b_id: String,
}

struct GlobalPools {
    pools: Vec<FastPool>,
    pools_by_token: HashMap<String, Vec<usize>>,
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
    *global = Some(GlobalPools { pools, pools_by_token });

    Ok(())
}

#[wasm_bindgen]
pub fn update_pools_fast(pools_js: JsValue) -> Result<(), JsValue> {
    let pools_data: Vec<serde_json::Value> = serde_wasm_bindgen::from_value(pools_js)?;

    let mut global = GLOBAL_POOLS.lock().unwrap();
    let mut pools_state = global.take().unwrap_or(GlobalPools {
        pools: Vec::new(),
        pools_by_token: HashMap::new(),
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
