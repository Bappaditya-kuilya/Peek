import { describe, it, expect } from 'vitest';

const sources = import.meta.glob('./**/*.{js,jsx}', { query: '?raw', import: 'default' });

describe('no debug code in prod (bug3)', () => {
  it('has no console.log in web/src', async () => {
    for (const [path, load] of Object.entries(sources)) {
      const content = await load();
      expect(content, `${path} contains console.log`).not.toMatch(/console\.log/);
    }
  });

  it('has no window.__peekSession in web/src', async () => {
    for (const [path, load] of Object.entries(sources)) {
      const content = await load();
      expect(content, `${path} sets __peekSession`).not.toMatch(/__peekSession/);
    }
  });
});