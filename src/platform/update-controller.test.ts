import { describe, expect, it, vi } from 'vitest';
import { createUpdateController, selfUpdateSupported, type UpdaterPort, type UpdateState } from './update-controller';

/** An updater that does what it is told, so a test can play the events */
function fakeUpdater() {
  const cb: Record<string, (...a: never[]) => void> = {};
  const port: UpdaterPort & { calls: string[] } = {
    calls: [],
    onAvailable: f => { cb.available = f; },
    onProgress: f => { cb.progress = f; },
    onDownloaded: f => { cb.downloaded = f; },
    onError: f => { cb.error = f; },
    check: vi.fn(async () => { port.calls.push('check'); }),
    download: vi.fn(async () => { port.calls.push('download'); }),
    quitAndInstall: vi.fn(() => { port.calls.push('install'); }),
  };
  return { port, fire: (name: string, ...a: unknown[]) => (cb[name] as unknown as (...x: unknown[]) => void)(...a) };
}

function setup(over: { self?: boolean; connected?: boolean; current?: string; release?: { version: string; url: string } | null } = {}) {
  const u = fakeUpdater();
  const states: UpdateState[] = [];
  let connected = over.connected ?? false;
  const c = createUpdateController({
    updater: over.self === false ? null : u.port,
    checkRelease: async () => (over.release === undefined ? null : over.release),
    releaseUrl: 'https://example.org/releases',
    currentVersion: over.current ?? '0.1.0',
    isConnected: () => connected,
    emit: s => states.push(s),
  });
  return { c, u, states, setConnected: (v: boolean) => { connected = v; }, last: () => states.at(-1) };
}

describe('selfUpdateSupported', () => {
  it('is on for Windows and for an AppImage, off for other Linux installs', () => {
    expect(selfUpdateSupported({ platform: 'win32', appImage: false, macSigned: false })).toBe(true);
    expect(selfUpdateSupported({ platform: 'linux', appImage: true, macSigned: false })).toBe(true);
    expect(selfUpdateSupported({ platform: 'linux', appImage: false, macSigned: false })).toBe(false);
  });

  it('is on for macOS only for a signed build, because the system refuses to replace an app that is not', () => {
    expect(selfUpdateSupported({ platform: 'darwin', appImage: false, macSigned: false })).toBe(false);
    expect(selfUpdateSupported({ platform: 'darwin', appImage: false, macSigned: true })).toBe(true);
  });
});

describe('an update the app can install itself', () => {
  it('offers it first, downloads only after the person said yes, and installs only after a second yes', async () => {
    const s = setup();
    const check = s.c.check();
    s.u.fire('available', '0.1.1');
    await check;
    expect(s.last()).toEqual({ stage: 'available', version: '0.1.1', self: true, url: 'https://example.org/releases' });
    expect(s.u.port.calls).toEqual(['check']);

    await s.c.download();
    expect(s.u.port.calls).toEqual(['check', 'download']);
    s.u.fire('progress', 40);
    expect(s.last()).toEqual({ stage: 'downloading', version: '0.1.1', percent: 40 });
    s.u.fire('downloaded', '0.1.1');
    expect(s.last()).toEqual({ stage: 'ready', version: '0.1.1' });
    expect(s.u.port.calls).not.toContain('install');

    s.c.install();
    expect(s.u.port.calls).toEqual(['check', 'download', 'install']);
  });

  it('does not download or install without the step before', async () => {
    const s = setup();
    await s.c.download();
    s.c.install();
    expect(s.u.port.calls).toEqual([]);
    const check = s.c.check();
    s.u.fire('available', '0.1.1');
    await check;
    s.c.install();
    expect(s.u.port.calls).toEqual(['check']);
  });

  it('never installs while connected to the treadmill, and says so; it installs after disconnecting', async () => {
    const s = setup({ connected: true });
    const check = s.c.check();
    s.u.fire('available', '0.1.1');
    await check;
    await s.c.download();
    s.u.fire('downloaded', '0.1.1');
    s.c.install();
    expect(s.u.port.calls).not.toContain('install');
    expect(s.last()).toEqual({ stage: 'blocked', version: '0.1.1' });
    s.setConnected(false);
    s.c.install();
    expect(s.u.port.calls).toContain('install');
  });

  it('ignores a version that is not newer, or that cannot be read', async () => {
    for (const v of ['0.1.0', '0.0.9', '0.2.0-rc.1', 'latest', '']) {
      const s = setup();
      const check = s.c.check();
      s.u.fire('available', v);
      await check;
      expect(s.states, v).toEqual([]);
    }
  });

  it('does not start over while a download runs or the update is waiting for the restart', async () => {
    const s = setup();
    const first = s.c.check();
    s.u.fire('available', '0.1.1');
    await first;
    await s.c.download();
    await s.c.check();
    expect(s.u.port.calls).toEqual(['check', 'download']);
    s.u.fire('downloaded', '0.1.1');
    await s.c.check();
    expect(s.u.port.calls).toEqual(['check', 'download']);
  });

  it('shows an error with the release page when the download fails, and a failed check is silent', async () => {
    const s = setup();
    const check = s.c.check();
    s.u.fire('available', '0.1.1');
    await check;
    await s.c.download();
    s.u.fire('error', new Error('network'));
    expect(s.last()).toEqual({ stage: 'error', version: '0.1.1', url: 'https://example.org/releases' });

    const quiet = setup();
    const p = quiet.c.check();
    quiet.u.fire('error', new Error('offline'));
    await p;
    expect(quiet.states).toEqual([]);
  });

  it('can try again after an error', async () => {
    const s = setup();
    const a = s.c.check();
    s.u.fire('available', '0.1.1');
    await a;
    await s.c.download();
    s.u.fire('error', new Error('x'));
    const again = s.c.check();
    s.u.fire('available', '0.1.1');
    await again;
    expect(s.last()).toMatchObject({ stage: 'available', version: '0.1.1' });
  });
});

describe('an update the app cannot install itself (macOS without a signature)', () => {
  it('only points to the release page, and never downloads or installs', async () => {
    const s = setup({ self: false, release: { version: '0.1.1', url: 'https://example.org/r/0.1.1' } });
    await s.c.check();
    expect(s.last()).toEqual({ stage: 'available', version: '0.1.1', self: false, url: 'https://example.org/r/0.1.1' });
    await s.c.download();
    s.c.install();
    expect(s.states).toHaveLength(1);
  });

  it('is quiet when there is nothing newer, or the release cannot be read', async () => {
    for (const release of [null, { version: '0.1.0', url: 'https://example.org/r' }, { version: 'weird', url: 'https://example.org/r' }]) {
      const s = setup({ self: false, release });
      await s.c.check();
      expect(s.states).toEqual([]);
    }
  });
});
