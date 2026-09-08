import type { PlayerCard } from './types'

export const TEN_HALF_UNITS = 21
export const BUST_UNITS = 22

export const cardLabel = (rank: string, suit: string) => `${rank}${suit}`
export const isRedSuit = (suit: string) => suit === '♥' || suit === '♦'
export const fromHalfUnits = (units: number) => units / 2
export const formatHalfUnits = (units: number) => formatNumber(fromHalfUnits(units))

export const totalHalfUnits = (cards: Pick<PlayerCard, 'player_id' | 'value_half_units'>[], playerId: string) =>
  cards
    .filter((card) => card.player_id === playerId)
    .reduce((sum, card) => sum + Number(card.value_half_units), 0)

export const isTenHalf = (units: number) => units === TEN_HALF_UNITS
export const isBust = (units: number) => units >= BUST_UNITS

export const fieldCardCount = (playerCount: number) => {
  if (playerCount < 2) throw new Error('At least 2 players are required')
  if (playerCount <= 3) return 5
  if (playerCount <= 5) return 6
  return 7
}

export const penaltyTotal = (declarationCount: number) => 4 + Math.max(0, declarationCount) * 4

export type Score = { playerId: string; totalHalfUnits: number }

export const loserIds = (scores: Score[]) => {
  if (scores.length === 0) return []
  const busted = scores.filter((score) => isBust(score.totalHalfUnits))
  if (busted.length > 0) return busted.map((score) => score.playerId)
  const minimum = Math.min(...scores.map((score) => score.totalHalfUnits))
  return scores.filter((score) => score.totalHalfUnits === minimum).map((score) => score.playerId)
}

export const splitPenalty = (declarationCount: number, loserCount: number) => {
  if (loserCount <= 0) return 0
  return Math.round((penaltyTotal(declarationCount) / loserCount) * 10) / 10
}

export const formatNumber = (value: number) =>
  Number.isInteger(value) ? String(value) : value.toFixed(1)

export const friendlyError = (message: string) => {
  const normalized = message.toLowerCase()
  if (normalized.includes('room not found')) return 'ルームが見つかりませんでした'
  if (normalized.includes('already started')) return 'このゲームはすでに開始されています'
  if (normalized.includes('at least 2')) return '2人以上でゲームを開始してください'
  if (normalized.includes('host only')) return 'この操作はホストだけが実行できます'
  if (normalized.includes('resolve the current auction')) return '現在のオークション結果を先に確定してください'
  if (normalized.includes('not 10.5')) return '合計が10.5のときだけ宣言できます'
  if (normalized.includes('already resolved')) return 'このカードの結果はすでに確定しています'
  if (normalized.includes('authentication')) return '接続情報を確認して、もう一度お試しください'
  return '処理に失敗しました。通信状態を確認してもう一度お試しください'
}
