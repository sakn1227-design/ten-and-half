import { isRedSuit } from '../lib/game'

type CardFace = {
  rank: string | null
  suit: string | null
}

export function PlayingCard({ card, large = false, faceDown = false, className = '' }: {
  card?: CardFace
  large?: boolean
  faceDown?: boolean
  className?: string
}) {
  const suit = card?.suit ?? ''
  const rank = card?.rank ?? ''
  const red = isRedSuit(suit)

  return (
    <div
      className={`card-scene ${large ? 'large' : ''} ${className}`.trim()}
      aria-label={faceDown ? '裏向きのカード' : `${rank}${suit}`}
    >
      <div className={`playing-card-3d ${faceDown ? 'is-back' : 'is-front'} ${red ? 'red-card' : ''}`}>
        <div className="card-face card-front">
          <div className="corner-rank">{rank}<span>{suit}</span></div>
          <div className="center-suit">{suit}</div>
          <div className="corner-rank bottom">{rank}<span>{suit}</span></div>
        </div>
        <div className="card-face card-back" aria-hidden="true">
          <div className="back-frame">
            <span>10.5</span>
            <small>TEN & HALF</small>
          </div>
        </div>
      </div>
    </div>
  )
}
