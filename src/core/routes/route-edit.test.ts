import { afterEach, describe, expect, it } from 'vitest';
import { setUnits } from '../../i18n/units';
import { editedRoute } from './route-edit';
import { ROUTE_DESCRIPTION_MAX, type Route } from './routes';
import { SAMPLE_TEXTS, sampleRoute } from './sample-route';

const base: Route = { ...sampleRoute('r1', 5), texts: undefined, description: 'Alt', defaultSpeed: 4 };

afterEach(() => setUnits('metric'));

describe('editedRoute', () => {
  it('takes the speed in km/h, with a comma too, and rounds it to 0.01', () => {
    expect(editedRoute(base, { speed: '5,5', description: 'Alt' }, 'de')).toMatchObject({ ok: true, route: { defaultSpeed: 5.5 } });
    expect(editedRoute(base, { speed: '4.123', description: 'Alt' }, 'en')).toMatchObject({ ok: true, route: { defaultSpeed: 4.12 } });
  });

  it('reads the speed in the units of the settings: mph in imperial', () => {
    setUnits('imperial');
    const r = editedRoute(base, { speed: '3', description: 'Alt' }, 'en');
    expect(r.ok && r.route.defaultSpeed).toBeCloseTo(4.83, 2);
  });

  it('removes the speed of its own when the field is empty', () => {
    const r = editedRoute(base, { speed: '  ', description: 'Alt' }, 'en');
    expect(r.ok && r.route.defaultSpeed).toBeUndefined();
  });

  it('refuses a speed that is not a number or outside the range', () => {
    for (const speed of ['abc', '0', '0.1', '25', '-3']) {
      expect(editedRoute(base, { speed, description: 'Alt' }, 'en'), speed).toEqual({ ok: false, reason: 'speed' });
    }
  });

  it('makes a changed description the person\'s own and drops it when it is cleared', () => {
    const changed = editedRoute(base, { speed: '4', description: 'Neu' }, 'en');
    expect(changed.ok && changed.route.description).toBe('Neu');
    const cleared = editedRoute(base, { speed: '4', description: '' }, 'en');
    expect(cleared.ok && cleared.route.description).toBeUndefined();
  });

  it('keeps the translations, which follow the language, when the field is left as shown', () => {
    const route = sampleRoute('r2', 5);
    const r = editedRoute(route, { speed: '', description: SAMPLE_TEXTS.de }, 'de');
    expect(r.ok && r.route.texts).toEqual(SAMPLE_TEXTS);
    expect(r.ok && r.route.description).toBeUndefined();
  });

  it('shortens a description that is too long', () => {
    const r = editedRoute(base, { speed: '4', description: 'x'.repeat(ROUTE_DESCRIPTION_MAX + 50) }, 'en');
    expect(r.ok && r.route.description).toHaveLength(ROUTE_DESCRIPTION_MAX);
  });

  it('refuses a route that does not pass the check, without a message of its own', () => {
    expect(editedRoute({ ...base, points: [] }, { speed: '4', description: 'Alt' }, 'en')).toEqual({ ok: false, reason: 'invalid' });
  });

  it('keeps everything else of the route', () => {
    const r = editedRoute(base, { speed: '4', description: 'Alt' }, 'en');
    expect(r.ok && r.route).toMatchObject({ id: 'r1', name: base.name, points: base.points });
  });
});
