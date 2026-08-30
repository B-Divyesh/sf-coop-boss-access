import { describe, expect, it } from 'vitest';
import { applyDemoAction, cleanCode, createDemoRoom, formatClock, hasReadyTeam } from './game';

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

  it('resets the sample room and applies both role actions without changing the seed', () => {
    const seed = createDemoRoom();
    const wardBuilt = applyDemoAction(seed, 'ward', 'build');
    const shielded = applyDemoAction(wardBuilt, 'ward', 'share');
    const boosted = applyDemoAction(shielded, 'surge', 'share');

    expect(seed.players[0].meter).toBe(30);
    expect(wardBuilt.players[0].meter).toBe(40);
    expect(shielded.shield).toBe(48);
    expect(boosted.boost).toBe(28);
    expect(createDemoRoom()).toEqual(seed);
  });
});
