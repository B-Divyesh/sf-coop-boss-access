import type { Role, Room } from './types';

export const roleCopy: Record<Role, { label: string; symbol: string; build: string; share: string; instruction: string }> = {
  ward: {
    label: 'Ward',
    symbol: '⬡',
    build: 'Build ward',
    share: 'Share shield',
    instruction: 'Build to 40, then share a shield before the dragon hits.'
  },
  surge: {
    label: 'Surge',
    symbol: '✦',
    build: 'Build surge',
    share: 'Boost strikes',
    instruction: 'Build to 40, then boost every team strike against the dragon.'
  }
};

export function formatClock(milliseconds: number): string {
  const total = Math.max(0, Math.ceil(milliseconds / 1000));
  const minutes = Math.floor(total / 60);
  return `${minutes}:${String(total % 60).padStart(2, '0')}`;
}

export function cleanCode(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);
}

export function hasReadyTeam(players: { role: Role; connected: boolean }[]): boolean {
  return players.some((player) => player.connected && player.role === 'ward')
    && players.some((player) => player.connected && player.role === 'surge');
}

export function createDemoRoom(): Room {
  return {
    code: 'DEMO',
    phase: 'playing',
    boss_hp: 68,
    team_hp: 82,
    shield: 20,
    boost: 0,
    remaining_ms: 155_000,
    incoming_ms: 4_500,
    announcement: 'Mina is building a shield before the next hit',
    players: [
      { id: 'demo-ward', name: 'Mina', role: 'ward', meter: 30, connected: true },
      { id: 'demo-surge', name: 'Ivo', role: 'surge', meter: 40, connected: true }
    ]
  };
}

export function applyDemoAction(room: Room, role: Role, action: 'build' | 'share'): Room {
  const next = structuredClone(room);
  const player = next.players.find((candidate) => candidate.role === role);
  if (!player) return next;

  if (action === 'build') {
    player.meter = Math.min(100, player.meter + 10);
    next.announcement = `${player.name} built ${role} charge`;
  } else if (player.meter >= 40) {
    player.meter -= 40;
    if (role === 'ward') {
      next.shield = Math.min(100, next.shield + 28);
      next.announcement = `${player.name} shared a team shield`;
    } else {
      next.boost = Math.min(100, next.boost + 28);
      next.announcement = `${player.name} boosted every team strike`;
    }
  } else {
    next.announcement = `${player.name} needs 40 charge to share`;
  }
  return next;
}
