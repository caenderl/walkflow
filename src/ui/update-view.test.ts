import { describe, expect, it } from 'vitest';
import type { UpdateState } from '../platform/update-controller';
import { updateView } from './update-view';

const url = 'https://example.org/releases';

describe('the update banner', () => {
  it('offers the download when the app can install the update itself, and only the release page when it cannot', () => {
    const self = updateView({ stage: 'available', version: '0.1.1', self: true, url });
    expect(self.action).toBe('download');
    expect(self.text()).toContain('0.1.1');
    const manual = updateView({ stage: 'available', version: '0.1.1', self: false, url });
    expect(manual.action).toBe('open');
  });

  it('shows the progress without a button while it downloads', () => {
    const v = updateView({ stage: 'downloading', version: '0.1.1', percent: 42 });
    expect(v.text()).toContain('42');
    expect(v.action).toBeNull();
  });

  it('asks for the restart when the update is installed, and keeps asking when it was refused', () => {
    expect(updateView({ stage: 'ready', version: '0.1.1' }).action).toBe('install');
    const blocked = updateView({ stage: 'blocked', version: '0.1.1' });
    expect(blocked.action).toBe('install');
    expect(blocked.text()).not.toBe(updateView({ stage: 'ready', version: '0.1.1' }).text());
  });

  it('sends the person to the release page after an error', () => {
    expect(updateView({ stage: 'error', version: '0.1.1', url }).action).toBe('open');
  });

  it('has a text and a label for every state', () => {
    const states: UpdateState[] = [
      { stage: 'available', version: '1.0.0', self: true, url }, { stage: 'available', version: '1.0.0', self: false, url },
      { stage: 'downloading', version: '1.0.0', percent: 5 }, { stage: 'ready', version: '1.0.0' }, { stage: 'blocked', version: '1.0.0' },
      { stage: 'error', version: '1.0.0', url },
    ];
    for (const s of states) {
      const v = updateView(s);
      expect(v.text().length, s.stage).toBeGreaterThan(10);
      if (v.action) expect(v.label().length, s.stage).toBeGreaterThan(2);
    }
  });
});
