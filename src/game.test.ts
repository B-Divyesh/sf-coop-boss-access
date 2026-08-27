import { describe, expect, it } from 'vitest';
import { cleanCode, formatClock, hasReadyTeam } from './game';

describe('game display helpers', () => {
  it('formats the three-minute clock', () => {
    expect(formatClock(180_000)).toBe('3:00');
    expect(formatClock(59_001)).toBe('1:00');
    expect(formatClock(0)).toBe('0:00');
  });

  it('normalizes room codes for phone entry', () => {
    expect(cleanCode(' a-b 2z! ')).toBe('AB2Z');
  });

  it('requires both complementary roles', () => {
    expect(hasReadyTeam([{ role: 'ward', connected: true }, { role: 'surge', connected: true }])).toBe(true);
    expect(hasReadyTeam([{ role: 'ward', connected: true }, { role: 'surge', connected: false }])).toBe(false);
  });
});
