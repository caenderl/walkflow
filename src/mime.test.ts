import { describe, expect, it } from 'vitest';
import { mimeFor } from './mime';

describe('mimeFor', () => {
  it('knows every kind of file the build emits', () => {
    expect(mimeFor('/a/index.html')).toBe('text/html; charset=utf-8');
    expect(mimeFor('/a/assets/index-1.js')).toBe('text/javascript; charset=utf-8');
    expect(mimeFor('/a/assets/index-1.css')).toBe('text/css; charset=utf-8');
    expect(mimeFor('/a/manifest.webmanifest')).toBe('application/manifest+json');
    expect(mimeFor('/a/favicon.svg')).toBe('image/svg+xml');
    expect(mimeFor('/a/icons/icon-192.png')).toBe('image/png');
    expect(mimeFor('/a/data.json')).toBe('application/json');
  });

  it('serves a .mjs file as JavaScript: a module worker is refused with any other type (the map worker is one)', () => {
    expect(mimeFor('/a/assets/maplibre-gl-worker-BrB25tGK.mjs')).toBe('text/javascript; charset=utf-8');
  });

  it('falls back to a generic type, also for a file without extension', () => {
    expect(mimeFor('/a/readme')).toBe('application/octet-stream');
    expect(mimeFor('/a/x.unknown')).toBe('application/octet-stream');
  });
});
