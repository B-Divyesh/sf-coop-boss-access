export type Role = 'ward' | 'surge';
export type Phase = 'lobby' | 'playing' | 'won' | 'lost';

export interface Player {
  id: string;
  name: string;
  role: Role;
  meter: number;
  connected: boolean;
}

export interface Room {
  code: string;
  phase: Phase;
  boss_hp: number;
  team_hp: number;
  shield: number;
  boost: number;
  remaining_ms: number;
  incoming_ms: number;
  announcement: string;
  players: Player[];
}

export type ServerEvent =
  | { type: 'state'; room: Room }
  | { type: 'error'; message: string; recoverable: boolean }
  | { type: 'room_closed'; message: string };
