import { MaxUint128 } from 'internalConstants'
import JSBI from 'jsbi'
import { encodeSqrtRatioX64 } from 'utils/encodeSqrtRatioX64'
import { maxLiquidityForAmounts } from 'utils/maxLiquidityForAmounts'

describe('#maxLiquidityForAmounts', () => {
  describe('imprecise', () => {
    describe('price inside', () => {
      it('100 tokenA, 200 tokenB', () => {
        expect(
          maxLiquidityForAmounts(
            encodeSqrtRatioX64(1, 1),
            encodeSqrtRatioX64(100, 110),
            encodeSqrtRatioX64(110, 100),
            '100',
            '200',
            false
          )
        ).toEqual(JSBI.BigInt(2148))
      })

      it('100 tokenA, max tokenB', () => {
        expect(
          maxLiquidityForAmounts(
            encodeSqrtRatioX64(1, 1),
            encodeSqrtRatioX64(100, 110),
            encodeSqrtRatioX64(110, 100),
            '100',
            MaxUint128,
            false
          )
        ).toEqual(JSBI.BigInt(2148))
      })

      it('max tokenA, 200 tokenB', () => {
        expect(
          maxLiquidityForAmounts(
            encodeSqrtRatioX64(1, 1),
            encodeSqrtRatioX64(100, 110),
            encodeSqrtRatioX64(110, 100),
            MaxUint128,
            '200',
            false
          )
        ).toEqual(JSBI.BigInt(4297))
      })
    })

    describe('price below', () => {
      it('100 tokenA, 200 tokenB', () => {
        expect(
          maxLiquidityForAmounts(
            encodeSqrtRatioX64(99, 110),
            encodeSqrtRatioX64(100, 110),
            encodeSqrtRatioX64(110, 100),
            '100',
            '200',
            false
          )
        ).toEqual(JSBI.BigInt(1048))
      })

      it('100 tokenA, max tokenB', () => {
        expect(
          maxLiquidityForAmounts(
            encodeSqrtRatioX64(99, 110),
            encodeSqrtRatioX64(100, 110),
            encodeSqrtRatioX64(110, 100),
            '100',
            MaxUint128,
            false
          )
        ).toEqual(JSBI.BigInt(1048))
      })

      it('max tokenA, 200 tokenB', () => {
        expect(
          maxLiquidityForAmounts(
            encodeSqrtRatioX64(99, 110),
            encodeSqrtRatioX64(100, 110),
            encodeSqrtRatioX64(110, 100),
            MaxUint128,
            '200',
            false
          )
        ).toEqual(JSBI.BigInt('3568911573029623480160382055964570221102'))
      })
    })

    describe('price above', () => {
      it('100 tokenA, 200 tokenB', () => {
        expect(
          maxLiquidityForAmounts(
            encodeSqrtRatioX64(111, 100),
            encodeSqrtRatioX64(100, 110),
            encodeSqrtRatioX64(110, 100),
            '100',
            '200',
            false
          )
        ).toEqual(JSBI.BigInt(2097))
      })

      it('100 tokenA, max tokenB', () => {
        expect(
          maxLiquidityForAmounts(
            encodeSqrtRatioX64(111, 100),
            encodeSqrtRatioX64(100, 110),
            encodeSqrtRatioX64(110, 100),
            '100',
            MaxUint128,
            false
          )
        ).toEqual(JSBI.BigInt('3568911573029623480353853140008939060654'))
      })

      it('max tokenA, 200 tokenB', () => {
        expect(
          maxLiquidityForAmounts(
            encodeSqrtRatioX64(111, 100),
            encodeSqrtRatioX64(100, 110),
            encodeSqrtRatioX64(110, 100),
            MaxUint128,
            '200',
            false
          )
        ).toEqual(JSBI.BigInt(2097))
      })
    })
  })

  describe('precise', () => {
    describe('price inside', () => {
      it('100 tokenA, 200 tokenB', () => {
        expect(
          maxLiquidityForAmounts(
            encodeSqrtRatioX64(1, 1),
            encodeSqrtRatioX64(100, 110),
            encodeSqrtRatioX64(110, 100),
            '100',
            '200',
            true
          )
        ).toEqual(JSBI.BigInt(2148))
      })

      it('100 tokenA, max tokenB', () => {
        expect(
          maxLiquidityForAmounts(
            encodeSqrtRatioX64(1, 1),
            encodeSqrtRatioX64(100, 110),
            encodeSqrtRatioX64(110, 100),
            '100',
            MaxUint128,
            true
          )
        ).toEqual(JSBI.BigInt(2148))
      })

      it('max tokenA, 200 tokenB', () => {
        expect(
          maxLiquidityForAmounts(
            encodeSqrtRatioX64(1, 1),
            encodeSqrtRatioX64(100, 110),
            encodeSqrtRatioX64(110, 100),
            MaxUint128,
            '200',
            true
          )
        ).toEqual(JSBI.BigInt(4297))
      })
    })

    describe('price below', () => {
      it('100 tokenA, 200 tokenB', () => {
        expect(
          maxLiquidityForAmounts(
            encodeSqrtRatioX64(99, 110),
            encodeSqrtRatioX64(100, 110),
            encodeSqrtRatioX64(110, 100),
            '100',
            '200',
            true
          )
        ).toEqual(JSBI.BigInt(1048))
      })

      it('100 tokenA, max tokenB', () => {
        expect(
          maxLiquidityForAmounts(
            encodeSqrtRatioX64(99, 110),
            encodeSqrtRatioX64(100, 110),
            encodeSqrtRatioX64(110, 100),
            '100',
            MaxUint128,
            true
          )
        ).toEqual(JSBI.BigInt(1048))
      })

      it('max tokenA, 200 tokenB', () => {
        expect(
          maxLiquidityForAmounts(
            encodeSqrtRatioX64(99, 110),
            encodeSqrtRatioX64(100, 110),
            encodeSqrtRatioX64(110, 100),
            MaxUint128,
            '200',
            true
          )
        ).toEqual(JSBI.BigInt('3568911573029623480272463980731618558035'))
      })
    })

    describe('price above', () => {
      it('100 tokenA, 200 tokenB', () => {
        expect(
          maxLiquidityForAmounts(
            encodeSqrtRatioX64(111, 100),
            encodeSqrtRatioX64(100, 110),
            encodeSqrtRatioX64(110, 100),
            '100',
            '200',
            true
          )
        ).toEqual(JSBI.BigInt(2097))
      })

      it('100 tokenA, max tokenB', () => {
        expect(
          maxLiquidityForAmounts(
            encodeSqrtRatioX64(111, 100),
            encodeSqrtRatioX64(100, 110),
            encodeSqrtRatioX64(110, 100),
            '100',
            MaxUint128,
            true
          )
        ).toEqual(JSBI.BigInt('3568911573029623480353853140008939060654'))
      })

      it('max tokenA, 200 tokenB', () => {
        expect(
          maxLiquidityForAmounts(
            encodeSqrtRatioX64(111, 100),
            encodeSqrtRatioX64(100, 110),
            encodeSqrtRatioX64(110, 100),
            MaxUint128,
            '200',
            true
          )
        ).toEqual(JSBI.BigInt(2097))
      })
    })
  })
})
