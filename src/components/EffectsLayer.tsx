import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import type { GameEvent } from '../lib/types'
import type { GameSettings } from '../hooks/useGameSettings'
import { PlayingCard } from './PlayingCard'

type EffectState =
  | { kind: 'none' }
  | { kind: 'message'; eyebrow?: string; title: string; detail?: string; tone?: 'gold' | 'red' | 'blue'; card?: { rank: string; suit: string } }
  | { kind: 'countdown'; text: string }

function playTone(frequency: number, duration = 0.08) {
  try {
    const AudioContextCtor = window.AudioContext ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AudioContextCtor) return
    const context = new AudioContextCtor()
    const oscillator = context.createOscillator()
    const gain = context.createGain()
    oscillator.frequency.value = frequency
    gain.gain.setValueAtTime(0.05, context.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + duration)
    oscillator.connect(gain)
    gain.connect(context.destination)
    oscillator.start()
    oscillator.stop(context.currentTime + duration)
    setTimeout(() => void context.close(), Math.ceil(duration * 1000) + 100)
  } catch {
    // Autoplay restrictions are expected on some mobile browsers.
  }
}

export function EffectsLayer({ event, settings, bustKey }: { event: GameEvent | null; settings: GameSettings; bustKey: number }) {
  const [effect, setEffect] = useState<EffectState>({ kind: 'none' })
  const [effectId, setEffectId] = useState(0)

  const payload = useMemo(() => event?.payload ?? {}, [event])

  useEffect(() => {
    if (!bustKey) return
    setEffectId((value) => value + 1)
    setEffect({ kind: 'message', eyebrow: 'OVER 10.5', title: 'BUST!', detail: 'この状態はあなたにだけ見えています', tone: 'red' })
    if (settings.vibration && navigator.vibrate) navigator.vibrate([60, 35, 80])
    if (settings.sound) playTone(150, 0.16)
    const timer = window.setTimeout(() => setEffect({ kind: 'none' }), settings.reducedMotion ? 650 : 1050)
    return () => window.clearTimeout(timer)
  }, [bustKey, settings.reducedMotion, settings.sound, settings.vibration])

  useEffect(() => {
    if (!event) return
    const eventAge = Date.now() - Date.parse(event.created_at)
    if (Number.isFinite(eventAge) && eventAge > 7000) return
    setEffectId(event.id)
    const name = typeof payload.player_name === 'string' ? payload.player_name : ''
    const rank = typeof payload.rank === 'string' ? payload.rank : ''
    const suit = typeof payload.suit === 'string' ? payload.suit : ''

    if (event.event_type === 'final_countdown') {
      const steps = ['3', '2', '1', 'せーの！']
      const timers = steps.map((text, index) => window.setTimeout(() => {
        setEffect({ kind: 'countdown', text })
        if (settings.sound) playTone(index === 3 ? 760 : 420 + index * 70, index === 3 ? 0.16 : 0.07)
        if (index === 3 && settings.vibration && navigator.vibrate) navigator.vibrate(80)
      }, index * (settings.reducedMotion ? 300 : 430)))
      timers.push(window.setTimeout(() => setEffect({ kind: 'none' }), steps.length * (settings.reducedMotion ? 300 : 430) + 350))
      return () => timers.forEach(window.clearTimeout)
    }

    const show = (next: EffectState, ms: number) => {
      setEffect(next)
      const timer = window.setTimeout(() => setEffect({ kind: 'none' }), settings.reducedMotion ? Math.min(ms, 700) : ms)
      return () => window.clearTimeout(timer)
    }

    switch (event.event_type) {
      case 'game_started':
        return show({ kind: 'message', eyebrow: 'TEN & HALF', title: 'GAME START', detail: 'カードを配っています…', tone: 'gold' }, 1500)
      case 'field_revealed':
        return show({ kind: 'message', eyebrow: 'AUCTION', title: rank && suit ? `${rank}${suit}` : 'CARD OPEN', detail: 'オークション開始', tone: 'blue', card: rank && suit ? { rank, suit } : undefined }, 900)
      case 'ten_half_declared':
        if (settings.vibration && navigator.vibrate) navigator.vibrate([40, 35, 40])
        return show({ kind: 'message', eyebrow: `${name || 'PLAYER'} DECLARED`, title: '10.5', detail: '最初のカードが公開されました', tone: 'gold' }, 1800)
      case 'tie_break': {
        const names = Array.isArray(payload.player_names) ? payload.player_names.filter((item): item is string => typeof item === 'string') : []
        return show({ kind: 'message', eyebrow: 'FINAL AUCTION', title: 'TIE BREAK', detail: names.join(' × ') || '同点者だけで再オークション', tone: 'red' }, 1450)
      }
      case 'card_awarded':
        return show({ kind: 'message', eyebrow: 'CARD GET', title: name || '獲得！', detail: `${String(payload.sips ?? 0)}口`, tone: 'gold', card: rank && suit ? { rank, suit } : undefined }, 1050)
      case 'card_trashed':
        return show({ kind: 'message', eyebrow: 'NO BID', title: 'TRASH', detail: 'このカードは流れました', tone: 'blue' }, 900)
      case 'game_ended':
        return show({ kind: 'message', eyebrow: 'FINAL RESULT', title: 'SHOWDOWN', detail: '全員のカードを公開します', tone: 'gold' }, 1500)
      default:
        return
    }
  }, [event, payload, settings.reducedMotion, settings.sound, settings.vibration])

  if (effect.kind === 'none') return null

  if (effect.kind === 'countdown') {
    return (
      <div key={`${effectId}-${effect.text}`} className="effect-layer countdown-layer" aria-live="assertive">
        <div className="countdown-flash" />
        <strong>{effect.text}</strong>
      </div>
    )
  }

  return (
    <div key={effectId} className={`effect-layer message-effect tone-${effect.tone ?? 'blue'}`} aria-live="polite">
      <div className="effect-ring" />
      <div className="effect-copy">
        {effect.eyebrow && <span>{effect.eyebrow}</span>}
        <strong>{effect.title}</strong>
        {effect.detail && <small>{effect.detail}</small>}
      </div>
      {effect.card && <PlayingCard card={effect.card} large className="effect-card" />}
      {effect.tone === 'gold' && !settings.reducedMotion && <div className="spark-field" aria-hidden="true">{Array.from({ length: 12 }, (_, index) => <i key={index} style={{ '--i': index } as CSSProperties} />)}</div>}
    </div>
  )
}
