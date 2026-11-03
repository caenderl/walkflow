import { describe, expect, it } from 'vitest';
import { sha256Hex } from './hash';
import { makeShareItem } from './item';

describe('makeShareItem', () => {
  it('adds the length and the hash of the text', async () => {
    const item = await makeShareItem({ id: 'a', kind: 'route', name: 'Loop', text: '{"x":"ä"}' });
    expect(item).toEqual({ id: 'a', kind: 'route', name: 'Loop', text: '{"x":"ä"}', chars: 9, sha256: await sha256Hex('{"x":"ä"}') });
  });

  it('keeps place, country and tags for the list, and leaves out what is empty', async () => {
    const full = await makeShareItem({ id: 'a', kind: 'workout', name: 'W', text: '{}', place: 'Hamburg', country: 'DE', tags: ['park'] });
    expect(full).toMatchObject({ place: 'Hamburg', country: 'DE', tags: ['park'] });
    const empty = await makeShareItem({ id: 'a', kind: 'workout', name: 'W', text: '{}', place: '', tags: [] });
    expect(empty).not.toHaveProperty('place');
    expect(empty).not.toHaveProperty('tags');
    expect(empty).not.toHaveProperty('country');
  });
});
