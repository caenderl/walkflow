import { describe, expect, it, vi } from 'vitest';
import { askBeforeStart, readQuiet } from './quiet';

describe('readQuiet', () => {
  it('is off unless the stored value is exactly "1"', () => {
    expect(readQuiet(null)).toBe(false);
    expect(readQuiet('')).toBe(false);
    expect(readQuiet('0')).toBe(false);
    expect(readQuiet('true')).toBe(false);
    expect(readQuiet('11')).toBe(false);
    expect(readQuiet('1')).toBe(true);
  });
});

describe('askBeforeStart', () => {
  it('asks, and passes the answer on, as long as quiet mode is off', async () => {
    const yes = vi.fn(async () => true), no = vi.fn(async () => false);
    expect(await askBeforeStart(false, yes)).toBe(true);
    expect(await askBeforeStart(false, no)).toBe(false);
    expect(yes).toHaveBeenCalledOnce();
    expect(no).toHaveBeenCalledOnce();
  });

  it('does not ask in quiet mode and lets the start through', async () => {
    const ask = vi.fn(async () => false);
    expect(await askBeforeStart(true, ask)).toBe(true);
    expect(ask).not.toHaveBeenCalled();
  });

  it('a console command can insist on the question even in quiet mode', async () => {
    const ask = vi.fn(async () => false);
    expect(await askBeforeStart(true, ask, { always: true })).toBe(false);
    expect(ask).toHaveBeenCalledOnce();
  });
});
