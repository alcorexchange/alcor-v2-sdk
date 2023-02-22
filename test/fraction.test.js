"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const jsbi_1 = __importDefault(require("jsbi"));
const fraction_1 = require("entities/fractions/fraction");
describe("Fraction", () => {
    describe("#quotient", () => {
        it("floor division", () => {
            expect(new fraction_1.Fraction(jsbi_1.default.BigInt(8), jsbi_1.default.BigInt(3)).quotient).toEqual(jsbi_1.default.BigInt(2)); // one below
            expect(new fraction_1.Fraction(jsbi_1.default.BigInt(12), jsbi_1.default.BigInt(4)).quotient).toEqual(jsbi_1.default.BigInt(3)); // exact
            expect(new fraction_1.Fraction(jsbi_1.default.BigInt(16), jsbi_1.default.BigInt(5)).quotient).toEqual(jsbi_1.default.BigInt(3)); // one above
        });
    });
    describe("#remainder", () => {
        it("returns fraction after divison", () => {
            expect(new fraction_1.Fraction(jsbi_1.default.BigInt(8), jsbi_1.default.BigInt(3)).remainder).toEqual(new fraction_1.Fraction(jsbi_1.default.BigInt(2), jsbi_1.default.BigInt(3)));
            expect(new fraction_1.Fraction(jsbi_1.default.BigInt(12), jsbi_1.default.BigInt(4)).remainder).toEqual(new fraction_1.Fraction(jsbi_1.default.BigInt(0), jsbi_1.default.BigInt(4)));
            expect(new fraction_1.Fraction(jsbi_1.default.BigInt(16), jsbi_1.default.BigInt(5)).remainder).toEqual(new fraction_1.Fraction(jsbi_1.default.BigInt(1), jsbi_1.default.BigInt(5)));
        });
    });
    describe("#invert", () => {
        it("flips num and denom", () => {
            expect(new fraction_1.Fraction(jsbi_1.default.BigInt(5), jsbi_1.default.BigInt(10)).invert().numerator).toEqual(jsbi_1.default.BigInt(10));
            expect(new fraction_1.Fraction(jsbi_1.default.BigInt(5), jsbi_1.default.BigInt(10)).invert().denominator).toEqual(jsbi_1.default.BigInt(5));
        });
    });
    describe("#add", () => {
        it("multiples denoms and adds nums", () => {
            expect(new fraction_1.Fraction(jsbi_1.default.BigInt(1), jsbi_1.default.BigInt(10)).add(new fraction_1.Fraction(jsbi_1.default.BigInt(4), jsbi_1.default.BigInt(12)))).toEqual(new fraction_1.Fraction(jsbi_1.default.BigInt(52), jsbi_1.default.BigInt(120)));
        });
        it("same denom", () => {
            expect(new fraction_1.Fraction(jsbi_1.default.BigInt(1), jsbi_1.default.BigInt(5)).add(new fraction_1.Fraction(jsbi_1.default.BigInt(2), jsbi_1.default.BigInt(5)))).toEqual(new fraction_1.Fraction(jsbi_1.default.BigInt(3), jsbi_1.default.BigInt(5)));
        });
    });
    describe("#subtract", () => {
        it("multiples denoms and subtracts nums", () => {
            expect(new fraction_1.Fraction(jsbi_1.default.BigInt(1), jsbi_1.default.BigInt(10)).subtract(new fraction_1.Fraction(jsbi_1.default.BigInt(4), jsbi_1.default.BigInt(12)))).toEqual(new fraction_1.Fraction(jsbi_1.default.BigInt(-28), jsbi_1.default.BigInt(120)));
        });
        it("same denom", () => {
            expect(new fraction_1.Fraction(jsbi_1.default.BigInt(3), jsbi_1.default.BigInt(5)).subtract(new fraction_1.Fraction(jsbi_1.default.BigInt(2), jsbi_1.default.BigInt(5)))).toEqual(new fraction_1.Fraction(jsbi_1.default.BigInt(1), jsbi_1.default.BigInt(5)));
        });
    });
    describe("#lessThan", () => {
        it("correct", () => {
            expect(new fraction_1.Fraction(jsbi_1.default.BigInt(1), jsbi_1.default.BigInt(10)).lessThan(new fraction_1.Fraction(jsbi_1.default.BigInt(4), jsbi_1.default.BigInt(12)))).toBe(true);
            expect(new fraction_1.Fraction(jsbi_1.default.BigInt(1), jsbi_1.default.BigInt(3)).lessThan(new fraction_1.Fraction(jsbi_1.default.BigInt(4), jsbi_1.default.BigInt(12)))).toBe(false);
            expect(new fraction_1.Fraction(jsbi_1.default.BigInt(5), jsbi_1.default.BigInt(12)).lessThan(new fraction_1.Fraction(jsbi_1.default.BigInt(4), jsbi_1.default.BigInt(12)))).toBe(false);
        });
    });
    describe("#equalTo", () => {
        it("correct", () => {
            expect(new fraction_1.Fraction(jsbi_1.default.BigInt(1), jsbi_1.default.BigInt(10)).equalTo(new fraction_1.Fraction(jsbi_1.default.BigInt(4), jsbi_1.default.BigInt(12)))).toBe(false);
            expect(new fraction_1.Fraction(jsbi_1.default.BigInt(1), jsbi_1.default.BigInt(3)).equalTo(new fraction_1.Fraction(jsbi_1.default.BigInt(4), jsbi_1.default.BigInt(12)))).toBe(true);
            expect(new fraction_1.Fraction(jsbi_1.default.BigInt(5), jsbi_1.default.BigInt(12)).equalTo(new fraction_1.Fraction(jsbi_1.default.BigInt(4), jsbi_1.default.BigInt(12)))).toBe(false);
        });
    });
    describe("#greaterThan", () => {
        it("correct", () => {
            expect(new fraction_1.Fraction(jsbi_1.default.BigInt(1), jsbi_1.default.BigInt(10)).greaterThan(new fraction_1.Fraction(jsbi_1.default.BigInt(4), jsbi_1.default.BigInt(12)))).toBe(false);
            expect(new fraction_1.Fraction(jsbi_1.default.BigInt(1), jsbi_1.default.BigInt(3)).greaterThan(new fraction_1.Fraction(jsbi_1.default.BigInt(4), jsbi_1.default.BigInt(12)))).toBe(false);
            expect(new fraction_1.Fraction(jsbi_1.default.BigInt(5), jsbi_1.default.BigInt(12)).greaterThan(new fraction_1.Fraction(jsbi_1.default.BigInt(4), jsbi_1.default.BigInt(12)))).toBe(true);
        });
    });
    describe("#multiplty", () => {
        it("correct", () => {
            expect(new fraction_1.Fraction(jsbi_1.default.BigInt(1), jsbi_1.default.BigInt(10)).multiply(new fraction_1.Fraction(jsbi_1.default.BigInt(4), jsbi_1.default.BigInt(12)))).toEqual(new fraction_1.Fraction(jsbi_1.default.BigInt(4), jsbi_1.default.BigInt(120)));
            expect(new fraction_1.Fraction(jsbi_1.default.BigInt(1), jsbi_1.default.BigInt(3)).multiply(new fraction_1.Fraction(jsbi_1.default.BigInt(4), jsbi_1.default.BigInt(12)))).toEqual(new fraction_1.Fraction(jsbi_1.default.BigInt(4), jsbi_1.default.BigInt(36)));
            expect(new fraction_1.Fraction(jsbi_1.default.BigInt(5), jsbi_1.default.BigInt(12)).multiply(new fraction_1.Fraction(jsbi_1.default.BigInt(4), jsbi_1.default.BigInt(12)))).toEqual(new fraction_1.Fraction(jsbi_1.default.BigInt(20), jsbi_1.default.BigInt(144)));
        });
    });
    describe("#divide", () => {
        it("correct", () => {
            expect(new fraction_1.Fraction(jsbi_1.default.BigInt(1), jsbi_1.default.BigInt(10)).divide(new fraction_1.Fraction(jsbi_1.default.BigInt(4), jsbi_1.default.BigInt(12)))).toEqual(new fraction_1.Fraction(jsbi_1.default.BigInt(12), jsbi_1.default.BigInt(40)));
            expect(new fraction_1.Fraction(jsbi_1.default.BigInt(1), jsbi_1.default.BigInt(3)).divide(new fraction_1.Fraction(jsbi_1.default.BigInt(4), jsbi_1.default.BigInt(12)))).toEqual(new fraction_1.Fraction(jsbi_1.default.BigInt(12), jsbi_1.default.BigInt(12)));
            expect(new fraction_1.Fraction(jsbi_1.default.BigInt(5), jsbi_1.default.BigInt(12)).divide(new fraction_1.Fraction(jsbi_1.default.BigInt(4), jsbi_1.default.BigInt(12)))).toEqual(new fraction_1.Fraction(jsbi_1.default.BigInt(60), jsbi_1.default.BigInt(48)));
        });
    });
    describe("#asFraction", () => {
        it("returns an equivalent but not the same reference fraction", () => {
            const f = new fraction_1.Fraction(1, 2);
            expect(f.asFraction).toEqual(f);
            expect(f === f.asFraction).toEqual(false);
        });
    });
});
