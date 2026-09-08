import { describe, expect, it } from 'vitest'
import { BUST_UNITS, TEN_HALF_UNITS, fieldCardCount, fromHalfUnits, isBust, isTenHalf, loserIds, penaltyTotal, splitPenalty, totalHalfUnits } from './game'

describe('card values and totals', () => {
  it('represents A=1 and face cards=0.5 exactly in half-units', () => {
    expect(fromHalfUnits(2)).toBe(1)
    expect(fromHalfUnits(1)).toBe(0.5)
  })
  it('detects exactly 10.5 and BUST at 11+', () => {
    expect(TEN_HALF_UNITS).toBe(21)
    expect(BUST_UNITS).toBe(22)
    expect(isTenHalf(21)).toBe(true)
    expect(isTenHalf(20)).toBe(false)
    expect(isBust(21)).toBe(false)
    expect(isBust(22)).toBe(true)
    expect(isBust(27)).toBe(true)
  })
  it('sums only the selected player cards', () => {
    const cards = [{ player_id:'a', value_half_units:2 }, { player_id:'a', value_half_units:1 }, { player_id:'b', value_half_units:20 }]
    expect(totalHalfUnits(cards, 'a')).toBe(3)
  })
})

describe('table card count', () => {
  it.each([[2,5],[3,5],[4,6],[5,6],[6,7],[9,7]])('%i players -> %i field cards', (players, cards) => {
    expect(fieldCardCount(players)).toBe(cards)
  })
})

describe('loser calculation', () => {
  it('makes every busted player lose when any bust exists', () => {
    expect(loserIds([{ playerId:'a',totalHalfUnits:21 },{ playerId:'b',totalHalfUnits:22 },{ playerId:'c',totalHalfUnits:25 }])).toEqual(['b','c'])
  })
  it('uses the lowest total when nobody busts', () => {
    expect(loserIds([{ playerId:'a',totalHalfUnits:16 },{ playerId:'b',totalHalfUnits:19 },{ playerId:'c',totalHalfUnits:20 }])).toEqual(['a'])
  })
  it('keeps tied lowest players as joint losers', () => {
    expect(loserIds([{ playerId:'a',totalHalfUnits:16 },{ playerId:'b',totalHalfUnits:16 },{ playerId:'c',totalHalfUnits:20 }])).toEqual(['a','b'])
  })
})

describe('penalty', () => {
  it.each([[0,4],[1,8],[2,12],[3,16]])('%i declarations -> %i total sips', (declarations, expected) => expect(penaltyTotal(declarations)).toBe(expected))
  it('splits tied penalty to one decimal place', () => {
    expect(splitPenalty(1,2)).toBe(4)
    expect(splitPenalty(0,3)).toBe(1.3)
  })
})
