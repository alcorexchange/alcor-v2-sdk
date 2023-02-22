"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const percent_1 = require("entities/fractions/percent");
describe("Percent", () => {
    describe("constructor", () => {
        it("defaults to 1 denominator", () => {
            expect(new percent_1.Percent(1)).toEqual(new percent_1.Percent(1, 1));
        });
    });
    describe("#add", () => {
        it("returns a percent", () => {
            expect(new percent_1.Percent(1, 100).add(new percent_1.Percent(2, 100))).toEqual(new percent_1.Percent(3, 100));
        });
        it("different denominators", () => {
            expect(new percent_1.Percent(1, 25).add(new percent_1.Percent(2, 100))).toEqual(new percent_1.Percent(150, 2500));
        });
    });
    describe("#subtract", () => {
        it("returns a percent", () => {
            expect(new percent_1.Percent(1, 100).subtract(new percent_1.Percent(2, 100))).toEqual(new percent_1.Percent(-1, 100));
        });
        it("different denominators", () => {
            expect(new percent_1.Percent(1, 25).subtract(new percent_1.Percent(2, 100))).toEqual(new percent_1.Percent(50, 2500));
        });
    });
    describe("#multiply", () => {
        it("returns a percent", () => {
            expect(new percent_1.Percent(1, 100).multiply(new percent_1.Percent(2, 100))).toEqual(new percent_1.Percent(2, 10000));
        });
        it("different denominators", () => {
            expect(new percent_1.Percent(1, 25).multiply(new percent_1.Percent(2, 100))).toEqual(new percent_1.Percent(2, 2500));
        });
    });
    describe("#divide", () => {
        it("returns a percent", () => {
            expect(new percent_1.Percent(1, 100).divide(new percent_1.Percent(2, 100))).toEqual(new percent_1.Percent(100, 200));
        });
        it("different denominators", () => {
            expect(new percent_1.Percent(1, 25).divide(new percent_1.Percent(2, 100))).toEqual(new percent_1.Percent(100, 50));
        });
    });
    describe("#toSignificant", () => {
        it("returns the value scaled by 100", () => {
            expect(new percent_1.Percent(154, 10000).toSignificant(3)).toEqual("1.54");
        });
    });
    describe("#toFixed", () => {
        it("returns the value scaled by 100", () => {
            expect(new percent_1.Percent(154, 10000).toFixed(2)).toEqual("1.54");
        });
    });
});
