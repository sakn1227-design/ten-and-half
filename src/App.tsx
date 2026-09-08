import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { RealtimeChannel, User } from '@supabase/supabase-js'
import { RulesModal } from './components/RulesModal'
import { SettingsSheet } from './components/SettingsSheet'
import { GameRoom } from './features/game/GameRoom'
import { HomeScreen, type Toast } from './features/home/HomeScreen'
import { useGameSettings } from './hooks/useGameSettings'
import { friendlyError } from './lib/game'
import { isConfigured, supabase } from './lib/supabase'
import type { ConnectionState, FieldCard, GameEvent, GameResult, Player, PlayerCard, Room } from './lib/types'

const ROOM_KEY = 'ten-half-room-id'
const PLAYER_KEY = 'ten-half-player-id'

type RoomSnapshot = {
  room: Room | null
  players: Player[]
  fieldCards: FieldCard[]
  playerCards: PlayerCard[]
  results: GameResult[]
  latestEvent: GameEvent | null
}

const emptySnapshot: RoomSnapshot = {
  room: null,
  players: [],
  fieldCards: [],
  playerCards: [],
  results: [],
  latestEvent: null,
}

function App() {
  const [user, setUser] = useState<User | null>(null)
  const [loadingAuth, setLoadingAuth] = useState(true)
  const [roomId, setRoomId] = useState<string | null>(() => localStorage.getItem(ROOM_KEY))
  const [playerId, setPlayerId] = useState<string | null>(() => localStorage.getItem(PLAYER_KEY))
  const [snapshot, setSnapshot] = useState<RoomSnapshot>(emptySnapshot)
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState<Toast>(null)
  const [rulesOpen, setRulesOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [connection, setConnection] = useState<ConnectionState>('connecting')
  const [onlineUserIds, setOnlineUserIds] = useState<Set<string>>(new Set())
  const { settings, update: updateSettings } = useGameSettings()
  const wasOffline = useRef(false)

  useEffect(() => {
    if (!isConfigured || !supabase) {
      setLoadingAuth(false)
      return
    }

    let mounted = true
    const boot = async () => {
      const { data } = await supabase.auth.getSession()
      let session = data.session
      if (!session) {
        const signed = await supabase.auth.signInAnonymously()
        if (signed.error) {
          if (mounted) setToast({ type: 'error', message: '匿名接続に失敗しました。Supabase設定を確認してください。' })
          if (mounted) setLoadingAuth(false)
          return
        }
        session = signed.data.session
      }
      if (mounted) {
        setUser(session?.user ?? null)
        setLoadingAuth(false)
      }
    }
    void boot()

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (mounted) setUser(session?.user ?? null)
    })

    return () => {
      mounted = false
      listener.subscription.unsubscribe()
    }
  }, [])

  const clearRoom = useCallback(() => {
    localStorage.removeItem(ROOM_KEY)
    localStorage.removeItem(PLAYER_KEY)
    setRoomId(null)
    setPlayerId(null)
    setSnapshot(emptySnapshot)
    setOnlineUserIds(new Set())
    setConnection('connecting')
    const url = new URL(window.location.href)
    if (url.searchParams.has('room')) {
      url.searchParams.delete('room')
      window.history.replaceState({}, '', url)
    }
  }, [])

  const refresh = useCallback(async () => {
    if (!supabase || !roomId || !user) return

    const [roomRes, playersRes, fieldRes, cardsRes, resultsRes, eventsRes] = await Promise.all([
      supabase.from('rooms').select('*').eq('id', roomId).maybeSingle(),
      supabase.from('players').select('*').eq('room_id', roomId).order('seat'),
      supabase.from('field_cards').select('*').eq('room_id', roomId).order('sequence'),
      supabase.from('player_cards').select('*').eq('room_id', roomId).order('created_at'),
      supabase.from('game_results').select('*').eq('room_id', roomId),
      supabase.from('game_events').select('*').eq('room_id', roomId).order('id', { ascending: false }).limit(1),
    ])

    if (roomRes.error || !roomRes.data) {
      if (roomRes.error) setToast({ type: 'error', message: friendlyError(roomRes.error.message) })
      clearRoom()
      return
    }

    const firstError = playersRes.error ?? fieldRes.error ?? cardsRes.error ?? resultsRes.error ?? eventsRes.error
    if (firstError) {
      setToast({ type: 'error', message: friendlyError(firstError.message) })
      return
    }

    setSnapshot({
      room: roomRes.data as Room,
      players: (playersRes.data ?? []) as Player[],
      fieldCards: (fieldRes.data ?? []) as FieldCard[],
      playerCards: (cardsRes.data ?? []) as PlayerCard[],
      results: (resultsRes.data ?? []) as GameResult[],
      latestEvent: (eventsRes.data?.[0] as GameEvent | undefined) ?? null,
    })
  }, [clearRoom, roomId, user])

  useEffect(() => {
    if (!roomId || !user || !supabase) return
    void refresh()

    let channel: RealtimeChannel | null = null
    channel = supabase
      .channel(`room:${roomId}`, { config: { presence: { key: user.id } } })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rooms', filter: `id=eq.${roomId}` }, () => void refresh())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'players', filter: `room_id=eq.${roomId}` }, () => void refresh())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'field_cards', filter: `room_id=eq.${roomId}` }, () => void refresh())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'player_cards', filter: `room_id=eq.${roomId}` }, () => void refresh())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'game_results', filter: `room_id=eq.${roomId}` }, () => void refresh())
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'game_events', filter: `room_id=eq.${roomId}` }, (payload) => {
        setSnapshot((current) => ({ ...current, latestEvent: payload.new as GameEvent }))
        void refresh()
      })
      .on('presence', { event: 'sync' }, () => {
        if (!channel) return
        setOnlineUserIds(new Set(Object.keys(channel.presenceState())))
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          setConnection('online')
          if (wasOffline.current) {
            setToast({ type: 'ok', message: '再接続しました ✓' })
            wasOffline.current = false
          }
          await channel?.track({ user_id: user.id, player_id: playerId, online_at: new Date().toISOString() })
          return
        }
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          setConnection('offline')
          wasOffline.current = true
        } else {
          setConnection('connecting')
        }
      })

    const handleOnline = () => {
      setConnection('connecting')
      void refresh()
    }
    const handleOffline = () => {
      setConnection('offline')
      wasOffline.current = true
      setToast({ type: 'error', message: '通信が切れました。再接続を待っています…' })
    }
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    document.addEventListener('visibilitychange', handleOnline)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
      document.removeEventListener('visibilitychange', handleOnline)
      if (channel) void supabase.removeChannel(channel)
    }
  }, [playerId, refresh, roomId, user])

  const me = useMemo(
    () => snapshot.players.find((player) => player.id === playerId) ?? snapshot.players.find((player) => player.user_id === user?.id) ?? null,
    [playerId, snapshot.players, user],
  )

  useEffect(() => {
    if (me && me.id !== playerId) {
      setPlayerId(me.id)
      localStorage.setItem(PLAYER_KEY, me.id)
    }
  }, [me, playerId])

  if (!isConfigured) return <SetupScreen />
  if (loadingAuth) return <Shell><LoadingState label="安全に接続しています…" /></Shell>
  if (!user) return <Shell><div className="center-card">匿名ログインに失敗しました。SupabaseのAnonymous Sign-Insを有効にしてください。</div></Shell>

  return (
    <Shell>
      {!roomId || !snapshot.room ? (
        <HomeScreen
          busy={busy}
          onBusy={setBusy}
          onJoin={(nextRoomId, nextPlayerId) => {
            localStorage.setItem(ROOM_KEY, nextRoomId)
            localStorage.setItem(PLAYER_KEY, nextPlayerId)
            setRoomId(nextRoomId)
            setPlayerId(nextPlayerId)
          }}
          setToast={setToast}
          onRules={() => setRulesOpen(true)}
          onSettings={() => setSettingsOpen(true)}
        />
      ) : (
        <GameRoom
          room={snapshot.room}
          players={snapshot.players}
          fieldCards={snapshot.fieldCards}
          playerCards={snapshot.playerCards}
          results={snapshot.results}
          latestEvent={snapshot.latestEvent}
          user={user}
          me={me}
          onlineUserIds={onlineUserIds}
          connection={connection}
          settings={settings}
          busy={busy}
          setBusy={setBusy}
          refresh={refresh}
          setToast={setToast}
          leaveRoom={clearRoom}
          onRules={() => setRulesOpen(true)}
          onSettings={() => setSettingsOpen(true)}
        />
      )}

      <RulesModal open={rulesOpen} onClose={() => setRulesOpen(false)} />
      <SettingsSheet open={settingsOpen} settings={settings} onChange={updateSettings} onClose={() => setSettingsOpen(false)} />
      <ToastView toast={toast} onClose={() => setToast(null)} />
    </Shell>
  )
}

function Shell({ children }: { children: ReactNode }) {
  return <main className="app-shell">{children}</main>
}

function LoadingState({ label }: { label: string }) {
  return (
    <div className="center-card">
      <div className="loading-cards" aria-hidden="true"><span /><span /><span /></div>
      <strong>{label}</strong>
    </div>
  )
}

function SetupScreen() {
  return (
    <Shell>
      <section className="hero setup-screen">
        <div className="eyebrow">10.5 · SETUP REQUIRED</div>
        <h1>10.5</h1>
        <p>Supabaseの接続情報を入れると、複数端末でリアルタイムに遊べます。</p>
        <div className="setup-card">
          <strong>1.</strong> <code>.env.example</code> を <code>.env.local</code> にコピー<br />
          <strong>2.</strong> Supabase URL / Publishable Keyを入力<br />
          <strong>3.</strong> <code>supabase/migrations/001_init.sql</code> をSQL Editorで実行<br />
          <strong>4.</strong> Authentication → Anonymous Sign-InsをON
        </div>
      </section>
    </Shell>
  )
}

function ToastView({ toast, onClose }: { toast: Toast; onClose: () => void }) {
  if (!toast) return null
  return <button className={`toast ${toast.type}`} onClick={onClose} aria-live="polite">{toast.message}</button>
}

export default App
