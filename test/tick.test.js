"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const tickMath_1 = require("utils/tickMath");
const tick_1 = require("entities/tick");
describe("Tick", () => {
    describe("constructor", () => {
        it("throws if tick is below min tick", () => {
            expect(() => new tick_1.Tick({
                index: tickMath_1.TickMath.MIN_TICK - 1,
                liquidityGross: 0,
                liquidityNet: 0,
            })).toThrow("TICK");
        });
        it("throws if tick is above max tick", () => {
            expect(() => new tick_1.Tick({
                index: tickMath_1.TickMath.MAX_TICK + 1,
                liquidityGross: 0,
                liquidityNet: 0,
            })).toThrow("TICK");
        });
    });
});
