import type { GameSettings } from '../hooks/useGameSettings'

export function SettingsSheet({ open, settings, onChange, onClose }: {
  open: boolean
  settings: GameSettings
  onChange: (patch: Partial<GameSettings>) => void
  onClose: () => void
}) {
  if (!open) return null
  return (
    <div className="modal-backdrop sheet-backdrop" onMouseDown={onClose} role="presentation">
      <section className="settings-sheet" onMouseDown={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-label="演出設定">
        <div className="sheet-handle" />
        <header>
          <div>
            <span className="eyebrow">GAME SETTINGS</span>
            <h2>演出設定</h2>
          </div>
          <button className="ghost-button compact" onClick={onClose}>完了</button>
        </header>
        <Toggle label="効果音" description="カウントダウンなどの短い効果音" checked={settings.sound} onChange={(sound) => onChange({ sound })} />
        <Toggle label="振動" description="対応端末で「せーの！」などを軽く振動" checked={settings.vibration} onChange={(vibration) => onChange({ vibration })} />
        <Toggle label="アニメーション軽減" description="パーティクル・揺れ・長い移動を抑えます" checked={settings.reducedMotion} onChange={(reducedMotion) => onChange({ reducedMotion })} />
      </section>
    </div>
  )
}

function Toggle({ label, description, checked, onChange }: { label: string; description: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <label className="setting-row">
      <span><strong>{label}</strong><small>{description}</small></span>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
    </label>
  )
}
