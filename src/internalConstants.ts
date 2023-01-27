import JSBI from "jsbi";

// constants used internally but not expected to be used externally
export const NEGATIVE_ONE = JSBI.BigInt(-1);
export const ZERO = JSBI.BigInt(0);
export const ONE = JSBI.BigInt(1);

// used in liquidity amount math
export const Q32 = JSBI.exponentiate(JSBI.BigInt(2), JSBI.BigInt(32));
export const Q64 = JSBI.exponentiate(JSBI.BigInt(2), JSBI.BigInt(64));
export const Q96 = JSBI.exponentiate(JSBI.BigInt(2), JSBI.BigInt(96));
export const Q128 = JSBI.exponentiate(JSBI.BigInt(2), JSBI.BigInt(128));
export const Q192 = JSBI.exponentiate(JSBI.BigInt(2), JSBI.BigInt(192));
export const Q256 = JSBI.exponentiate(JSBI.BigInt(2), JSBI.BigInt(256));

export const MaxUint256 = JSBI.BigInt(
  "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"
);
export const MaxUint128 = JSBI.BigInt("0xffffffffffffffffffffffffffffffff");

// exports for external consumption
export type BigintIsh = JSBI | string | number;

/**
 * The default factory enabled fee amounts, denominated in hundredths of bips.
 */
export enum FeeAmount {
  LOW = 500,
  MEDIUM = 3000,
  HIGH = 10000,
}

export enum Rounding {
  ROUND_DOWN,
  ROUND_HALF_UP,
  ROUND_UP,
}

/**
 * The default factory tick spacings by fee amount.
 */
export const TICK_SPACINGS: { [amount in FeeAmount]: number } = {
  [FeeAmount.LOW]: 10,
  [FeeAmount.MEDIUM]: 60,
  [FeeAmount.HIGH]: 200,
};
