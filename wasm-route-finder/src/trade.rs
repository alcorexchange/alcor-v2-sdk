use crate::swap_math::{compute_swap_step, get_sqrt_ratio_at_tick, get_tick_at_sqrt_ratio};
use std::collections::{HashMap, BTreeMap};

#[derive(Debug, Clone)]
pub struct PoolData {
    pub id: u32,
    pub token_a_id: String,
    pub token_b_id: String,
    pub fee: u32,
    pub sqrt_price_x64: u128,
    pub liquidity: u128,
    pub tick_current: i32,
    pub ticks: BTreeMap<i32, TickData>, // Use BTreeMap for sorted ticks
    pub tick_spacing: i32,
}

#[derive(Debug, Clone)]
pub struct TickData {
    pub index: i32,
    pub liquidity_gross: u128,
    pub liquidity_net: i128,
    pub fee_growth_outside_a_x64: u128,
    pub fee_growth_outside_b_x64: u128,
    pub initialized: bool,
}

#[derive(Debug, Clone)]
pub struct SwapResult {
    pub amount_in: u128,
    pub amount_out: u128,
    pub sqrt_price_x64_after: u128,
    pub tick_after: i32,
}

#[derive(Debug, Clone)]
pub struct TradeResult {
    pub amount_in: u128,
    pub amount_out: u128,
    pub route: Vec<u32>, // Pool IDs
    pub price_impact: f64,
}

impl PoolData {
    /// Simulates a swap through this pool
    pub fn swap(
        &self,
        zero_for_one: bool,
        amount_specified: i128,
        sqrt_price_limit_x64: Option<u128>,
    ) -> SwapResult {
        web_sys::console::log_1(&format!(
            "swap: zero_for_one={}, amount_specified={}, ticks_count={}",
            zero_for_one, amount_specified, self.ticks.len()
        ).into());
        
        let sqrt_price_limit = sqrt_price_limit_x64.unwrap_or(if zero_for_one {
            get_sqrt_ratio_at_tick(-665454) + 1
        } else {
            get_sqrt_ratio_at_tick(665454) - 1
        });

        let exact_input = amount_specified >= 0;

        let mut state = SwapState {
            amount_specified_remaining: amount_specified,
            amount_calculated: 0i128,
            sqrt_price_x64: self.sqrt_price_x64,
            tick: self.tick_current,
            liquidity: self.liquidity,
        };

        let mut iteration_count = 0;
        const MAX_ITERATIONS: u32 = 1000;
        
        while iteration_count < MAX_ITERATIONS {
            // Check exit conditions
            if state.amount_specified_remaining == 0 || state.sqrt_price_x64 == sqrt_price_limit {
                break;
            }
            iteration_count += 1;
            
            if iteration_count <= 5 || iteration_count % 100 == 0 {
                web_sys::console::log_1(&format!("Iteration {}: amount_remaining={}, sqrt_price={}, tick={}", 
                    iteration_count, state.amount_specified_remaining, state.sqrt_price_x64, state.tick).into());
            }
            
            let (tick_next, initialized) = self.next_initialized_tick_within_one_word(
                state.tick,
                zero_for_one,
            );

            let tick_next = tick_next.max(-665454).min(665454);
            let sqrt_price_next_x64 = get_sqrt_ratio_at_tick(tick_next);

            let target_price = if (zero_for_one && sqrt_price_next_x64 < sqrt_price_limit)
                || (!zero_for_one && sqrt_price_next_x64 > sqrt_price_limit)
            {
                sqrt_price_limit
            } else {
                sqrt_price_next_x64
            };

            // Safely convert liquidity to u64
            let liquidity_u64 = if state.liquidity > u64::MAX as u128 {
                u64::MAX
            } else {
                state.liquidity as u64
            };
            
            // Safely convert amount_remaining to i64
            let amount_remaining_i64 = if state.amount_specified_remaining > i64::MAX as i128 {
                i64::MAX
            } else if state.amount_specified_remaining < i64::MIN as i128 {
                i64::MIN
            } else {
                state.amount_specified_remaining as i64
            };
            
            let (sqrt_price_x64_new, amount_in, amount_out, fee_amount) = compute_swap_step(
                state.sqrt_price_x64,
                target_price,
                liquidity_u64,
                amount_remaining_i64,
                self.fee,
            );
            
            if iteration_count <= 5 {
                web_sys::console::log_1(&format!(
                    "compute_swap_step result: sqrt_price_new={}, amount_in={}, amount_out={}, fee={}",
                    sqrt_price_x64_new, amount_in, amount_out, fee_amount
                ).into());
            }

            state.sqrt_price_x64 = sqrt_price_x64_new;

            if exact_input {
                state.amount_specified_remaining -= amount_in as i128 + fee_amount as i128;
                state.amount_calculated -= amount_out as i128;
            } else {
                state.amount_specified_remaining += amount_out as i128;
                state.amount_calculated += amount_in as i128 + fee_amount as i128;
            }
            
            if iteration_count <= 5 {
                web_sys::console::log_1(&format!(
                    "After update: amount_remaining={}, amount_calculated={}",
                    state.amount_specified_remaining, state.amount_calculated
                ).into());
            }

            // Cross tick if we reached the target
            if state.sqrt_price_x64 == sqrt_price_next_x64 {
                if initialized {
                    if let Some(tick_data) = self.get_tick(tick_next) {
                        let liquidity_net = if zero_for_one {
                            -tick_data.liquidity_net
                        } else {
                            tick_data.liquidity_net
                        };
                        
                        state.liquidity = add_liquidity_delta(state.liquidity, liquidity_net);
                    }
                }
                state.tick = if zero_for_one { tick_next - 1 } else { tick_next };
            } else if state.sqrt_price_x64 != target_price {
                state.tick = get_tick_at_sqrt_ratio(state.sqrt_price_x64);
            }
            
            // Exit loop if we've consumed all input
            if state.amount_specified_remaining == 0 {
                break;
            }
        }
        
        web_sys::console::log_1(&format!(
            "Swap loop finished. Iterations: {}, final amount_remaining: {}",
            iteration_count, state.amount_specified_remaining
        ).into());

        let (amount_a, amount_b) = if zero_for_one == exact_input {
            (
                (amount_specified - state.amount_specified_remaining).abs() as u128,
                state.amount_calculated.abs() as u128,
            )
        } else {
            (
                state.amount_calculated.abs() as u128,
                (amount_specified - state.amount_specified_remaining).abs() as u128,
            )
        };

        let result = SwapResult {
            amount_in: if zero_for_one { amount_a } else { amount_b },
            amount_out: if zero_for_one { amount_b } else { amount_a },
            sqrt_price_x64_after: state.sqrt_price_x64,
            tick_after: state.tick,
        };
        
        web_sys::console::log_1(&format!(
            "Swap result: amount_in={}, amount_out={}",
            result.amount_in, result.amount_out
        ).into());
        
        result
    }

    fn next_initialized_tick_within_one_word(
        &self,
        tick: i32,
        zero_for_one: bool,
    ) -> (i32, bool) {
        // For simplicity, just return the boundary ticks if no ticks in map
        if self.ticks.is_empty() {
            return if zero_for_one { (-665454, false) } else { (665454, false) };
        }
        
        if zero_for_one {
            // Search downwards - look for tick less than current
            for (&tick_index, _) in self.ticks.range(..tick).rev() {
                return (tick_index, true);
            }
            // No tick found, return minimum
            (-665454, false)
        } else {
            // Search upwards - look for tick greater than current
            for (&tick_index, _) in self.ticks.range((tick + 1)..) {
                return (tick_index, true);
            }
            // No tick found, return maximum
            (665454, false)
        }
    }

    fn get_tick(&self, tick: i32) -> Option<&TickData> {
        self.ticks.get(&tick)
    }
}

struct SwapState {
    amount_specified_remaining: i128,
    amount_calculated: i128,
    sqrt_price_x64: u128,
    tick: i32,
    liquidity: u128,
}

fn add_liquidity_delta(liquidity: u128, delta: i128) -> u128 {
    if delta < 0 {
        liquidity - delta.abs() as u128
    } else {
        liquidity + delta as u128
    }
}

/// Calculate output for a route (multiple pools)
pub fn calculate_route_output(
    pools: &HashMap<u32, PoolData>,
    route: &[u32],
    amount_in: u128,
    token_in: &str,
) -> Result<TradeResult, String> {
    if route.is_empty() {
        return Err("Route is empty".to_string());
    }
    
    let mut current_amount = amount_in;
    let mut current_token = token_in.to_string();
    
    for pool_id in route {
        let pool = pools.get(pool_id)
            .ok_or_else(|| format!("Pool {} not found in {} available pools", pool_id, pools.len()))?;
        
        let zero_for_one = pool.token_a_id == current_token;
        if !zero_for_one && pool.token_b_id != current_token {
            return Err(format!("Token mismatch in route at pool {}", pool_id));
        }
        
        let swap_result = pool.swap(zero_for_one, current_amount as i128, None);
        
        current_amount = swap_result.amount_out;
        current_token = if zero_for_one {
            pool.token_b_id.clone()
        } else {
            pool.token_a_id.clone()
        };
    }
    
    // Calculate simple price impact (could be more sophisticated)
    let price_impact = if amount_in > 0 {
        let _expected_out = current_amount; // In reality, would calculate mid-price output
        0.0 // Placeholder - would calculate actual impact
    } else {
        0.0
    };
    
    Ok(TradeResult {
        amount_in,
        amount_out: current_amount,
        route: route.to_vec(),
        price_impact,
    })
}

/// Batch calculate trades for multiple routes and amounts
pub fn calculate_trades_batch(
    pools: &HashMap<u32, PoolData>,
    routes: &[Vec<u32>],
    amounts: &[u128],
    token_in: &str,
) -> Vec<Result<TradeResult, String>> {
    let mut results = Vec::new();
    
    for route in routes {
        for &amount in amounts {
            results.push(calculate_route_output(pools, route, amount, token_in));
        }
    }
    
    results
}