import type { Role } from './types';

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
