
// constants used internally but not expected to be used externally
export const NEGATIVE_ONE = BigInt(-1);
export const ZERO = BigInt(0);
export const ONE = BigInt(1);

// used in liquidity amount math
export const Q32 = (BigInt(2) ** BigInt(32));
export const Q64 = (BigInt(2) ** BigInt(64));
export const Q96 = (BigInt(2) ** BigInt(96));
export const Q128 = (BigInt(2) ** BigInt(128));
export const Q192 = (BigInt(2) ** BigInt(192));
export const Q256 = (BigInt(2) ** BigInt(256));

export const MaxUint256 = BigInt(
  "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"
);
export const MaxUint128 = BigInt("0xffffffffffffffffffffffffffffffff");
export const MaxUint64 = BigInt("0xffffffffffffffff");

// exports for external consumption
export type BigintIsh = bigint | string | number;

export enum TradeType {
  EXACT_INPUT,
  EXACT_OUTPUT
}

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

// export const TICK_SPACINGS: { [amount in FeeAmount]: number } = {
//   [FeeAmount.LOW]: 4,
//   [FeeAmount.MEDIUM]: 10,
//   [FeeAmount.HIGH]: 50,
// };
