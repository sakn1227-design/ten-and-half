export type Phase = 'lobby' | 'playing' | 'ended'

export type Room = {
  id: string
  code: string
  host_user_id: string
  phase: Phase
  declarations: number
  created_at: string
}

export type Player = {
  id: string
  room_id: string
  user_id: string
  name: string
  seat: number
  declared_10_5: boolean
  declared_at: string | null
  created_at: string
}

export type FieldCard = {
  id: string
  room_id: string
  sequence: number
  rank: string | null
  suit: string | null
  value_half_units: number | null
  is_revealed: boolean
  awarded_player_id: string | null
  sip_count: number | null
  trashed: boolean
  created_at: string
}

export type PlayerCard = {
  id: string
  room_id: string
  player_id: string
  owner_user_id: string
  rank: string
  suit: string
  value_half_units: number
  is_initial: boolean
  is_revealed_public: boolean
  source_field_card_id: string | null
  created_at: string
}

export type GameResult = {
  room_id: string
  player_id: string
  total_half_units: number
  busted: boolean
  is_loser: boolean
  penalty_sips: number
}

export type GameEventType =
  | 'game_started'
  | 'field_revealed'
  | 'final_countdown'
  | 'tie_break'
  | 'card_awarded'
  | 'card_trashed'
  | 'ten_half_declared'
  | 'game_ended'

export type GameEvent = {
  id: number
  room_id: string
  event_type: GameEventType
  payload: Record<string, unknown>
  created_at: string
}

export type ConnectionState = 'connecting' | 'online' | 'offline'
