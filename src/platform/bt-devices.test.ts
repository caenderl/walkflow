import { describe, expect, it } from 'vitest';
import { chooserList, isUnnamedDevice } from './bt-devices';

const dev = (id: string, name: string) => ({ id, name });

describe('isUnnamedDevice', () => {
  it('recognises the placeholder Chromium makes up for a device without a name, in any language', () => {
    expect(isUnnamedDevice(dev('a', 'Unbekanntes oder nicht unterstütztes Gerät (0E:78:1A:50:9B:FE)'))).toBe(true);
    expect(isUnnamedDevice(dev('a', 'Unknown or Unsupported Device (44:42:A2:AE:1E:F6)'))).toBe(true);
    expect(isUnnamedDevice(dev('a', 'Appareil inconnu ou non pris en charge (c3:65:2b:e6:87:ed)'))).toBe(true);
    expect(isUnnamedDevice(dev('a', 'Unknown or Unsupported Device (9A015387-A288-4E1B-8C2F-1D3E5F708192)'))).toBe(true);
  });

  it('treats an empty name as unnamed', () => {
    expect(isUnnamedDevice(dev('a', ''))).toBe(true);
    expect(isUnnamedDevice(dev('a', '   '))).toBe(true);
  });

  it('keeps every device that has a name of its own', () => {
    expect(isUnnamedDevice(dev('a', 'sPad500-848'))).toBe(false);
    expect(isUnnamedDevice(dev('a', 'AirPods von Christof'))).toBe(false);
    expect(isUnnamedDevice(dev('a', 'Kettler (v2)'))).toBe(false);
  });
});

describe('chooserList', () => {
  const list = [
    dev('1', 'Unbekanntes oder nicht unterstütztes Gerät (0E:78:1A:50:9B:FE)'),
    dev('2', 'AirPods von Christof'),
    dev('3', 'Unbekanntes oder nicht unterstütztes Gerät (44:42:A2:AE:1E:F6)'),
    dev('4', 'sPad500-848'),
  ];

  it('shows the named devices first and says how many it hides', () => {
    const r = chooserList(list, null, false);
    expect(r.shown.map(d => d.id)).toEqual(['2', '4']);
    expect(r.hidden).toBe(2);
  });

  it('shows everything on request, named ones still first, nothing reordered otherwise', () => {
    const r = chooserList(list, null, true);
    expect(r.shown.map(d => d.id)).toEqual(['2', '4', '1', '3']);
    expect(r.hidden).toBe(2);
  });

  it('puts the device that was connected last at the top', () => {
    expect(chooserList(list, '4', false).shown.map(d => d.id)).toEqual(['4', '2']);
  });

  it('never hides the device that was connected last, even without a name', () => {
    const r = chooserList(list, '3', false);
    expect(r.shown.map(d => d.id)).toEqual(['3', '2', '4']);
    expect(r.hidden).toBe(1);
  });

  it('has nothing to hide when every device has a name, and copes with an empty list', () => {
    expect(chooserList([dev('2', 'x')], null, false)).toEqual({ shown: [dev('2', 'x')], hidden: 0 });
    expect(chooserList([], null, false)).toEqual({ shown: [], hidden: 0 });
  });
});
