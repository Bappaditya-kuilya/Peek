import { describe, it, expect, beforeEach } from 'vitest';
import { recordIceEvent, getFailureRate, shouldWarnTurn } from './iceMonitor.js';

beforeEach(() => {
  localStorage.clear();
});

describe('iceMonitor', () => {
  it('returns 0 failure rate with no events', () => {
    expect(getFailureRate()).toBe(0);
    expect(shouldWarnTurn()).toBe(false);
  });

  it('tracks failure rate correctly', () => {
    for (let i = 0; i < 99; i++) recordIceEvent('connected');
    recordIceEvent('failed');

    expect(getFailureRate()).toBeCloseTo(0.01);
    expect(shouldWarnTurn()).toBe(false);
  });

  it('warns when failure rate exceeds 5%', () => {
    for (let i = 0; i < 18; i++) recordIceEvent('connected');
    for (let i = 0; i < 2; i++) recordIceEvent('failed');

    expect(getFailureRate()).toBeCloseTo(0.1);
    expect(shouldWarnTurn()).toBe(true);
  });

  it('persists events across calls', () => {
    recordIceEvent('connected');
    recordIceEvent('failed');
    expect(getFailureRate()).toBeCloseTo(0.5);
  });
});
