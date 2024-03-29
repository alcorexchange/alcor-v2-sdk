"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const jsbi_1 = __importDefault(require("jsbi"));
const internalConstants_1 = require("internalConstants");
const token_1 = require("../src/entities/token");
const currencyAmount_1 = require("../src/entities/fractions/currencyAmount");
const percent_1 = require("../src/entities/fractions/percent");
describe("CurrencyAmount", () => {
    const CONTRACT_ONE = "contracta";
    describe("constructor", () => {
        it("works", () => {
            const token = new token_1.Token(CONTRACT_ONE, 18, "ABC");
            const amount = currencyAmount_1.CurrencyAmount.fromRawAmount(token, 100);
            expect(amount.quotient).toEqual(jsbi_1.default.BigInt(100));
        });
    });
    describe("#quotient", () => {
        it("returns the amount after multiplication", () => {
            const token = new token_1.Token(CONTRACT_ONE, 18, "ABC");
            const amount = currencyAmount_1.CurrencyAmount.fromRawAmount(token, 100).multiply(new percent_1.Percent(15, 100));
            expect(amount.quotient).toEqual(jsbi_1.default.BigInt(15));
        });
    });
    it("token amount can be max uint256", () => {
        const amount = currencyAmount_1.CurrencyAmount.fromRawAmount(new token_1.Token(CONTRACT_ONE, 18, "ABC"), internalConstants_1.MaxUint256);
        expect(amount.quotient).toEqual(internalConstants_1.MaxUint256);
    });
    it("token amount cannot exceed max uint256", () => {
        expect(() => currencyAmount_1.CurrencyAmount.fromRawAmount(new token_1.Token(CONTRACT_ONE, 18, "ABC"), jsbi_1.default.add(internalConstants_1.MaxUint256, jsbi_1.default.BigInt(1)))).toThrow("AMOUNT");
    });
    it("token amount quotient cannot exceed max uint256", () => {
        expect(() => currencyAmount_1.CurrencyAmount.fromFractionalAmount(new token_1.Token(CONTRACT_ONE, 18, "ABC"), jsbi_1.default.add(jsbi_1.default.multiply(internalConstants_1.MaxUint256, jsbi_1.default.BigInt(2)), jsbi_1.default.BigInt(2)), jsbi_1.default.BigInt(2))).toThrow("AMOUNT");
    });
    it("token amount numerator can be gt. uint256 if denominator is gt. 1", () => {
        const amount = currencyAmount_1.CurrencyAmount.fromFractionalAmount(new token_1.Token(CONTRACT_ONE, 18, "ABC"), jsbi_1.default.add(internalConstants_1.MaxUint256, jsbi_1.default.BigInt(2)), 2);
        expect(amount.numerator).toEqual(jsbi_1.default.add(jsbi_1.default.BigInt(2), internalConstants_1.MaxUint256));
    });
    describe("#toFixed", () => {
        it("throws for decimals > currency.decimals", () => {
            const token = new token_1.Token(CONTRACT_ONE, 0, "CDE");
            const amount = currencyAmount_1.CurrencyAmount.fromRawAmount(token, 1000);
            expect(() => amount.toFixed(3)).toThrow("DECIMALS");
        });
        it("is correct for 0 decimals", () => {
            const token = new token_1.Token(CONTRACT_ONE, 0, "CDE");
            const amount = currencyAmount_1.CurrencyAmount.fromRawAmount(token, 123456);
            expect(amount.toFixed(0)).toEqual("123456");
        });
        it("is correct for 18 decimals", () => {
            const token = new token_1.Token(CONTRACT_ONE, 18, "ABC");
            const amount = currencyAmount_1.CurrencyAmount.fromRawAmount(token, 1e15);
            expect(amount.toFixed(9)).toEqual("0.001000000");
        });
    });
    describe("#toSignificant", () => {
        it("does not throw for sig figs > currency.decimals", () => {
            const token = new token_1.Token(CONTRACT_ONE, 0, "CDE");
            const amount = currencyAmount_1.CurrencyAmount.fromRawAmount(token, 1000);
            expect(amount.toSignificant(3)).toEqual("1000");
        });
        it("is correct for 0 decimals", () => {
            const token = new token_1.Token(CONTRACT_ONE, 0, "CDE");
            const amount = currencyAmount_1.CurrencyAmount.fromRawAmount(token, 123456);
            expect(amount.toSignificant(4)).toEqual("123400");
        });
        it("is correct for 18 decimals", () => {
            const token = new token_1.Token(CONTRACT_ONE, 18, "ABC");
            const amount = currencyAmount_1.CurrencyAmount.fromRawAmount(token, 1e15);
            expect(amount.toSignificant(9)).toEqual("0.001");
        });
    });
    describe("#toExact", () => {
        it("does not throw for sig figs > currency.decimals", () => {
            const token = new token_1.Token(CONTRACT_ONE, 0, "CDE");
            const amount = currencyAmount_1.CurrencyAmount.fromRawAmount(token, 1000);
            expect(amount.toExact()).toEqual("1000");
        });
        it("is correct for 0 decimals", () => {
            const token = new token_1.Token(CONTRACT_ONE, 0, "CDE");
            const amount = currencyAmount_1.CurrencyAmount.fromRawAmount(token, 123456);
            expect(amount.toExact()).toEqual("123456");
        });
        it("is correct for 18 decimals", () => {
            const token = new token_1.Token(CONTRACT_ONE, 18, "ABC");
            const amount = currencyAmount_1.CurrencyAmount.fromRawAmount(token, 123e13);
            expect(amount.toExact()).toEqual("0.00123");
        });
    });
});
