import { useEffect, useState } from 'react'

export type GameSettings = {
  sound: boolean
  vibration: boolean
  reducedMotion: boolean
}

const KEY = 'ten-half-settings-v1'

const getInitial = (): GameSettings => {
  const systemReduced = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<GameSettings>
    return {
      sound: saved.sound ?? false,
      vibration: saved.vibration ?? true,
      reducedMotion: saved.reducedMotion ?? Boolean(systemReduced),
    }
  } catch {
    return { sound: false, vibration: true, reducedMotion: Boolean(systemReduced) }
  }
}

export function useGameSettings() {
  const [settings, setSettings] = useState<GameSettings>(getInitial)

  useEffect(() => {
    localStorage.setItem(KEY, JSON.stringify(settings))
    document.documentElement.dataset.reduceMotion = settings.reducedMotion ? 'true' : 'false'
  }, [settings])

  const update = (patch: Partial<GameSettings>) => setSettings((current) => ({ ...current, ...patch }))
  return { settings, update }
}
