import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import type { User } from '@supabase/supabase-js'
import { PlayingCard } from '../../components/PlayingCard'
import { EffectsLayer } from '../../components/EffectsLayer'
import type { GameSettings } from '../../hooks/useGameSettings'
import { friendlyError, formatHalfUnits, formatNumber, isBust, isTenHalf, totalHalfUnits } from '../../lib/game'
import { supabase } from '../../lib/supabase'
import type { ConnectionState, FieldCard, GameEvent, GameResult, Player, PlayerCard, Room } from '../../lib/types'
import type { Toast } from '../home/HomeScreen'
import { ResultsScreen } from '../result/ResultsScreen'

export function GameRoom({
  room,
  players,
  fieldCards,
  playerCards,
  results,
  user,
  me,
  onlineUserIds,
  connection,
  latestEvent,
  settings,
  busy,
  setBusy,
  refresh,
  setToast,
  leaveRoom,
  onRules,
  onSettings,
}: {
  room: Room
  players: Player[]
  fieldCards: FieldCard[]
  playerCards: PlayerCard[]
  results: GameResult[]
  user: User
  me: Player | null
  onlineUserIds: Set<string>
  connection: ConnectionState
  latestEvent: GameEvent | null
  settings: GameSettings
  busy: boolean
  setBusy: (value: boolean) => void
  refresh: () => Promise<void>
  setToast: (toast: Toast) => void
  leaveRoom: () => void
  onRules: () => void
  onSettings: () => void
}) {
  const isHost = room.host_user_id === user.id
  const myTotalUnits = me ? totalHalfUnits(playerCards, me.id) : 0
  const busted = isBust(myTotalUnits)
  const canDeclare = isTenHalf(myTotalUnits) && !me?.declared_10_5
  const currentField = fieldCards.find((card) => card.is_revealed && !card.awarded_player_id && !card.trashed) ?? null
  const unrevealedCount = fieldCards.filter((card) => !card.is_revealed).length
  const resolvedCount = fieldCards.filter((card) => card.awarded_player_id || card.trashed).length
  const [bustKey, setBustKey] = useState(0)
  const previousBust = useRef(false)

  useEffect(() => {
    if (busted && !previousBust.current) setBustKey((value) => value + 1)
    previousBust.current = busted
  }, [busted])

  const run = async (fn: () => Promise<void>) => {
    if (busy) return
    setBusy(true)
    setToast(null)
    try {
      await fn()
      await refresh()
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setToast({ type: 'error', message: friendlyError(message) })
    } finally {
      setBusy(false)
    }
  }

  const copyCode = async () => {
    try {
      await navigator.clipboard?.writeText(room.code)
      setToast({ type: 'ok', message: 'ルームコードをコピーしました ✓' })
    } catch {
      setToast({ type: 'error', message: `ルームコード: ${room.code}` })
    }
  }

  const shareInvite = async () => {
    const inviteUrl = new URL(window.location.origin)
    inviteUrl.searchParams.set('room', room.code)
    const shareData = { title: '10.5 に参加', text: `10.5 のルーム ${room.code} に参加`, url: inviteUrl.toString() }
    try {
      if (navigator.share) {
        await navigator.share(shareData)
        return
      }
      await navigator.clipboard.writeText(inviteUrl.toString())
      setToast({ type: 'ok', message: '招待リンクをコピーしました ✓' })
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return
      setToast({ type: 'error', message: '招待リンクを共有できませんでした' })
    }
  }

  const header = (
    <RoomHeader
      code={room.code}
      connection={connection}
      onCopy={copyCode}
      onShare={shareInvite}
      onRules={onRules}
      onSettings={onSettings}
      onLeave={leaveRoom}
    />
  )

  if (room.phase === 'lobby') {
    return (
      <section className="room-wrap">
        {header}
        <div className="panel lobby-card">
          <div className="status-pill"><span className="live-dot" /> LOBBY</div>
          <h2>参加者を待っています</h2>
          <p>招待URLを共有するか、コード <strong data-testid="room-code">{room.code}</strong> を伝えてください。</p>
          <div className="player-list">
            {players.map((player, index) => (
              <div key={player.id} className="player-row player-enter" style={{ '--delay': `${index * 65}ms` } as CSSProperties}>
                <span className="avatar">{player.seat}</span>
                <span className="player-name-text">{player.name}</span>
                <span className={`presence-dot ${onlineUserIds.has(player.user_id) ? 'online' : ''}`} aria-label={onlineUserIds.has(player.user_id) ? 'オンライン' : 'オフライン'} />
                {player.user_id === room.host_user_id && <span className="mini-badge">HOST</span>}
              </div>
            ))}
          </div>
          {isHost ? (
            <button
              data-testid="start-game"
              className="primary-button hero-action"
              disabled={busy || players.length < 2}
              onClick={() => void run(async () => {
                const { error } = await supabase!.rpc('start_game', { p_room_id: room.id })
                if (error) throw error
              })}
            >
              {players.length < 2 ? '2人以上で開始できます' : busy ? 'カードを準備中…' : 'ゲーム開始'}
            </button>
          ) : (
            <div className="waiting"><span className="waiting-cards">▰ ▰ ▰</span> ホストが開始するまでお待ちください</div>
          )}
        </div>
      </section>
    )
  }

  if (room.phase === 'ended') {
    return (
      <section className="room-wrap">
        {header}
        <ResultsScreen room={room} players={players} cards={playerCards} results={results} onHome={leaveRoom} />
      </section>
    )
  }

  return (
    <section className="room-wrap">
      {header}
      <EffectsLayer event={latestEvent} settings={settings} bustKey={bustKey} />

      <section className={`my-status ${busted ? 'bust' : ''} ${me?.declared_10_5 ? 'declared' : ''}`}>
        <div>
          <span className="kicker">YOUR TOTAL</span>
          <div className="total-line"><strong key={myTotalUnits}>{formatHalfUnits(myTotalUnits)}</strong><small>/ 10.5</small></div>
        </div>
        {busted ? <div className="bust-label">BUST!</div> : me?.declared_10_5 ? <div className="declared-label">10.5<br />DECLARED</div> : <div className="safe-label">STAY<br />UNDER 11</div>}
      </section>

      {me && (
        <section className="panel hand-panel">
          <div className="section-heading">
            <div><span className="eyebrow">PRIVATE HAND</span><h2>あなたのカード</h2></div>
            <span>{playerCards.filter((card) => card.player_id === me.id).length}枚</span>
          </div>
          <div className="cards-row">
            {playerCards.filter((card) => card.player_id === me.id).map((card) => <PlayingCard key={card.id} card={card} className="hand-card-enter" />)}
          </div>
          <button
            data-testid="declare-ten-half"
            className={`declare-button ${canDeclare ? 'ready' : ''}`}
            disabled={busy || busted || !canDeclare}
            onClick={() => {
              if (!window.confirm('10.5を宣言しますか？ 最初のカードが全員に公開されます。')) return
              void run(async () => {
                const { error } = await supabase!.rpc('declare_ten_half', { p_room_id: room.id })
                if (error) throw error
              })
            }}
          >
            {me.declared_10_5 ? '✓ 10.5 宣言済み' : canDeclare ? '✦ 10.5 を宣言する' : '10.5で宣言できます'}
          </button>
          <p className="tiny-note">あなたの非公開カードとBUST状態は、公開条件を満たすまで他プレイヤーのAPIから取得できません。</p>
        </section>
      )}

      <section className="panel field-panel">
        <div className="section-heading">
          <div><span className="eyebrow">TABLE</span><h2>場のカード</h2></div>
          <span>{resolvedCount}/{fieldCards.length}</span>
        </div>

        {currentField && currentField.rank && currentField.suit ? (
          <div className="current-auction">
            <div className="auction-label"><span /> AUCTION NOW <span /></div>
            <div className="auction-card-wrap">
              <div className="auction-glow" />
              <PlayingCard card={currentField} large className="field-card-flip" />
            </div>
            <div className="auction-copy">口頭で競り上げ → 最後にホストが結果を記録</div>
            {isHost ? (
              <HostResolveAuction key={currentField.id} room={room} card={currentField} players={players} busy={busy} run={run} />
            ) : (
              <div className="waiting auction-wait"><span className="pulse-dot" /> オークション中…</div>
            )}
          </div>
        ) : (
          <div className="empty-field">
            <div className="mini-deck" aria-hidden="true"><i /><i /><i /></div>
            <strong>{unrevealedCount > 0 ? '次のカードをめくる準備ができました' : '場のカードはすべて終了しました'}</strong>
            <small>{unrevealedCount > 0 ? `残り ${unrevealedCount} 枚` : 'ホストがゲームを終了するとSHOWDOWNです'}</small>
          </div>
        )}

        {isHost && !currentField && unrevealedCount > 0 && (
          <button
            data-testid="reveal-field-card"
            className="primary-button"
            disabled={busy}
            onClick={() => void run(async () => {
              const { error } = await supabase!.rpc('reveal_next_field_card', { p_room_id: room.id })
              if (error) throw error
            })}
          >カードを公開</button>
        )}

        <div className="field-history">
          {fieldCards.filter((card) => card.awarded_player_id || card.trashed).map((card) => {
            const winner = players.find((player) => player.id === card.awarded_player_id)
            return (
              <div key={card.id} className="history-item">
                <span>{card.rank && card.suit ? `${card.rank}${card.suit}` : 'CARD'}</span>
                <span>{card.trashed ? 'TRASH' : `${winner?.name ?? '—'} · ${formatNumber(Number(card.sip_count ?? 0))}口`}</span>
              </div>
            )
          })}
        </div>
      </section>

      <section className="panel players-panel">
        <div className="section-heading">
          <div><span className="eyebrow">PLAYERS</span><h2>プレイヤー</h2></div>
          <span>10.5宣言 {room.declarations}人</span>
        </div>
        <div className="opponent-list">
          {players.map((player) => {
            const visibleCards = playerCards.filter((card) => card.player_id === player.id && (card.is_revealed_public || player.id === me?.id))
            const acquiredCount = playerCards.filter((card) => card.player_id === player.id && !card.is_initial).length
            const cardCount = player.id === me?.id ? visibleCards.length : 1 + acquiredCount
            return (
              <div key={player.id} className="opponent-row">
                <div className="opponent-name">
                  <span className="avatar">{player.seat}</span>
                  <div className="player-name-block">
                    <strong>{player.name}{player.id === me?.id ? '（あなた）' : ''}</strong>
                    <div className="mini-cards">
                      {visibleCards.map((card) => <span key={card.id}>{card.rank}{card.suit}</span>)}
                      {visibleCards.length === 0 && <span className="muted">🔒 非公開</span>}
                    </div>
                  </div>
                </div>
                <div className="player-meta">
                  <span className={`presence-dot ${onlineUserIds.has(player.user_id) ? 'online' : ''}`} />
                  {player.declared_10_5 && <span className="mini-badge yellow">10.5</span>}
                  {player.id !== me?.id && <span className="count-badge">{cardCount}枚</span>}
                </div>
              </div>
            )
          })}
        </div>
      </section>

      {isHost && (
        <section className="host-footer">
          <span className="host-only-label">HOST CONTROL</span>
          <button
            className="danger-button"
            disabled={busy}
            onClick={() => {
              if (!window.confirm('ゲームを終了して、全員のカードを公開しますか？')) return
              void run(async () => {
                const { error } = await supabase!.rpc('end_game', { p_room_id: room.id })
                if (error) throw error
              })
            }}
          >ゲームを終了してSHOWDOWN</button>
        </section>
      )}
    </section>
  )
}

function HostResolveAuction({ room, card, players, busy, run }: {
  room: Room
  card: FieldCard
  players: Player[]
  busy: boolean
  run: (fn: () => Promise<void>) => Promise<void>
}) {
  const [winner, setWinner] = useState(players[0]?.id ?? '')
  const [sips, setSips] = useState(1)
  const [tieMode, setTieMode] = useState(false)
  const [tieIds, setTieIds] = useState<string[]>([])

  useEffect(() => {
    if (!players.some((player) => player.id === winner)) setWinner(players[0]?.id ?? '')
  }, [players, winner])

  const tieNames = useMemo(() => players.filter((player) => tieIds.includes(player.id)).map((player) => player.name), [players, tieIds])

  const toggleTie = (playerId: string) => {
    setTieIds((current) => current.includes(playerId) ? current.filter((id) => id !== playerId) : [...current, playerId])
  }

  return (
    <div className="host-controls">
      <div className="auction-tools">
        <button
          type="button"
          className="countdown-button"
          disabled={busy}
          onClick={() => void run(async () => {
            const { error } = await supabase!.rpc('start_final_countdown', { p_room_id: room.id })
            if (error) throw error
          })}
        ><span>3 · 2 · 1</span> 最終オークション「せーの！」</button>
        <button type="button" className={`tie-button ${tieMode ? 'active' : ''}`} onClick={() => setTieMode((value) => !value)}>TIE BREAK</button>
      </div>

      {tieMode && (
        <div className="tie-picker">
          <span>同点だった人を選択</span>
          <div className="tie-chips">
            {players.map((player) => (
              <button key={player.id} type="button" className={tieIds.includes(player.id) ? 'selected' : ''} onClick={() => toggleTie(player.id)}>{player.name}</button>
            ))}
          </div>
          <button
            type="button"
            className="secondary-button"
            disabled={busy || tieIds.length < 2}
            onClick={() => void run(async () => {
              const { error } = await supabase!.rpc('start_tie_break', { p_room_id: room.id, p_player_ids: tieIds, p_min_sips: sips })
              if (error) throw error
            })}
          >{tieIds.length < 2 ? '2人以上選択してください' : `${tieNames.join('・')} で再オークション`}</button>
        </div>
      )}

      <div className="resolve-grid">
        <label>
          <span>最終獲得者</span>
          <select data-testid="auction-winner" value={winner} onChange={(event) => setWinner(event.target.value)}>
            {players.map((player) => <option key={player.id} value={player.id}>{player.name}</option>)}
          </select>
        </label>
        <label>
          <span>口数</span>
          <div className="stepper">
            <button type="button" aria-label="口数を減らす" onClick={() => setSips((value) => Math.max(0, value - 1))}>−</button>
            <input data-testid="auction-sips" type="number" min="0" step="1" value={sips} onChange={(event) => setSips(Math.max(0, Number(event.target.value) || 0))} />
            <button type="button" aria-label="口数を増やす" onClick={() => setSips((value) => value + 1)}>＋</button>
          </div>
        </label>
      </div>

      <button
        data-testid="award-card"
        className="primary-button"
        disabled={busy || !winner}
        onClick={() => void run(async () => {
          const { error } = await supabase!.rpc('award_field_card', {
            p_room_id: room.id,
            p_field_card_id: card.id,
            p_player_id: winner,
            p_sips: sips,
          })
          if (error) throw error
        })}
      >このプレイヤーが獲得</button>
      <button
        className="secondary-button"
        disabled={busy}
        onClick={() => void run(async () => {
          const { error } = await supabase!.rpc('trash_field_card', { p_room_id: room.id, p_field_card_id: card.id })
          if (error) throw error
        })}
      >誰も発言なし → TRASH</button>
    </div>
  )
}

function RoomHeader({ code, connection, onCopy, onShare, onRules, onSettings, onLeave }: {
  code: string
  connection: ConnectionState
  onCopy: () => void
  onShare: () => void
  onRules: () => void
  onSettings: () => void
  onLeave: () => void
}) {
  return (
    <header className="topbar room-topbar">
      <button className="code-button" onClick={onCopy} aria-label={`ルームコード ${code} をコピー`}><span>ROOM</span>{code}</button>
      <div className="connection-chip" title={connection === 'online' ? '接続中' : '再接続中'}><i className={connection} />{connection === 'online' ? 'LIVE' : '…'}</div>
      <div className="top-actions">
        <button className="ghost-button compact invite-button" onClick={onShare}>招待</button>
        <button className="ghost-button compact" onClick={onSettings} aria-label="演出設定">⚙︎</button>
        <button className="ghost-button compact" onClick={onRules} aria-label="ルール">📖</button>
        <button className="ghost-button compact" onClick={onLeave}>退出</button>
      </div>
    </header>
  )
}
