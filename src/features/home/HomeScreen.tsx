import { useState, type FormEvent } from 'react'
import { supabase } from '../../lib/supabase'
import { friendlyError } from '../../lib/game'

export type Toast = { type: 'error' | 'ok'; message: string } | null

export function HomeScreen({ busy, onBusy, onJoin, setToast, onRules, onSettings }: {
  busy: boolean
  onBusy: (value: boolean) => void
  onJoin: (roomId: string, playerId: string) => void
  setToast: (toast: Toast) => void
  onRules: () => void
  onSettings: () => void
}) {
  const inviteCode = new URLSearchParams(window.location.search).get('room')?.trim().toUpperCase().slice(0, 6) ?? ''
  const [mode, setMode] = useState<'create' | 'join'>(() => inviteCode ? 'join' : 'create')
  const [name, setName] = useState('')
  const [code, setCode] = useState(inviteCode)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!supabase || busy) return
    if (!name.trim()) {
      setToast({ type: 'error', message: '名前を入力してください' })
      return
    }
    if (mode === 'join' && code.trim().length !== 6) {
      setToast({ type: 'error', message: '6桁のルームコードを入力してください' })
      return
    }

    onBusy(true)
    setToast(null)
    try {
      const request = mode === 'create'
        ? supabase.rpc('create_room', { p_name: name.trim() })
        : supabase.rpc('join_room', { p_code: code.trim().toUpperCase(), p_name: name.trim() })
      const { data, error } = await request
      if (error) throw error
      const row = Array.isArray(data) ? data[0] : data
      if (!row?.room_id || !row?.player_id) throw new Error('Room information missing')
      onJoin(row.room_id, row.player_id)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setToast({ type: 'error', message: friendlyError(message) })
    } finally {
      onBusy(false)
    }
  }

  return (
    <section className="home-wrap">
      <header className="topbar">
        <div className="brand-small">10.5</div>
        <div className="top-actions">
          <button className="ghost-button" onClick={onSettings} aria-label="演出設定">⚙︎</button>
          <button className="ghost-button" onClick={onRules}>📖 ルール</button>
        </div>
      </header>

      <div className="hero">
        <div className="eyebrow">TEN & HALF · PARTY CARD GAME</div>
        <h1>10.5</h1>
        <p>10.5に近づけ。11以上はBUST。<br />口頭オークションの熱量を、そのままスマホへ。</p>
        <div className="hero-deck" aria-hidden="true">
          <span /><span /><span />
        </div>
      </div>

      <div className="panel auth-panel">
        <div className="segmented" role="tablist" aria-label="参加方法">
          <button type="button" role="tab" aria-selected={mode === 'create'} className={mode === 'create' ? 'active' : ''} onClick={() => setMode('create')}>ゲームを作る</button>
          <button type="button" role="tab" aria-selected={mode === 'join'} className={mode === 'join' ? 'active' : ''} onClick={() => setMode('join')}>参加する</button>
        </div>

        <form onSubmit={submit} className="stack">
          <label>
            <span>ニックネーム</span>
            <input data-testid="player-name" value={name} maxLength={24} onChange={(event) => setName(event.target.value)} placeholder="例：たろう" autoComplete="nickname" />
          </label>
          {mode === 'join' && (
            <label>
              <span>ルームコード</span>
              <input data-testid="room-code-input" value={code} maxLength={6} onChange={(event) => setCode(event.target.value.toUpperCase().replace(/[^A-F0-9]/g, ''))} placeholder="A1B2C3" autoCapitalize="characters" autoComplete="off" inputMode="text" />
            </label>
          )}
          <button data-testid={mode === 'create' ? 'create-room' : 'join-room'} className="primary-button" disabled={busy}>
            {busy ? <><span className="button-loader" />接続中…</> : mode === 'create' ? 'ルームを作成' : '参加する'}
          </button>
        </form>
      </div>
      <p className="home-footnote">ログイン不要 · 招待URL対応 · リアルタイム同期</p>
    </section>
  )
}
