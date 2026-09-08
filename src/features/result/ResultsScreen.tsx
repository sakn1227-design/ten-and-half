import type { CSSProperties } from 'react'
import { formatHalfUnits, formatNumber } from '../../lib/game'
import type { GameResult, Player, PlayerCard, Room } from '../../lib/types'
import { PlayingCard } from '../../components/PlayingCard'

export function ResultsScreen({ room, players, cards, results, onHome }: {
  room: Room
  players: Player[]
  cards: PlayerCard[]
  results: GameResult[]
  onHome: () => void
}) {
  const sorted = [...results].sort((a, b) => Number(b.is_loser) - Number(a.is_loser) || b.total_half_units - a.total_half_units)
  const totalPenalty = 4 * (1 + room.declarations)

  return (
    <section className="results-wrap">
      <div className="result-hero panel showdown-panel">
        <div className="eyebrow">SHOWDOWN · GAME OVER</div>
        <h1>結果発表</h1>
        <div className="penalty-equation" aria-label={`基本4口、10.5宣言${room.declarations}人、合計${totalPenalty}口`}>
          <span>基本 <strong>4</strong></span>
          <b>＋</b>
          <span>10.5宣言 <strong>{room.declarations} × 4</strong></span>
          <b>＝</b>
          <span className="equation-total"><strong>{totalPenalty}</strong>口</span>
        </div>
      </div>

      <div className="result-list">
        {sorted.map((result, index) => {
          const player = players.find((item) => item.id === result.player_id)
          const playerHand = cards.filter((card) => card.player_id === result.player_id)
          return (
            <article key={result.player_id} className={`result-card ${result.is_loser ? 'loser' : ''}`} style={{ '--delay': `${index * 110}ms` } as CSSProperties}>
              <div className="result-topline">
                <div>
                  <span className="avatar">{player?.seat ?? '?'}</span>
                  <strong>{player?.name ?? 'Unknown'}</strong>
                </div>
                <div className="result-total">{formatHalfUnits(result.total_half_units)}</div>
              </div>
              <div className="result-hand">
                {playerHand.map((card) => <PlayingCard key={card.id} card={card} />)}
              </div>
              <div className="result-badges">
                {result.busted && <span className="bust-chip">BUST</span>}
                {player?.declared_10_5 && <span className="mini-badge yellow">10.5 宣言</span>}
                {result.is_loser && <span className="penalty-chip">LOSE · {formatNumber(Number(result.penalty_sips))}口</span>}
              </div>
            </article>
          )
        })}
      </div>
      <button className="primary-button" onClick={onHome}>ホームへ戻る</button>
    </section>
  )
}
