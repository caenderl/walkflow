// Views via the URL hash (#history, #workouts, #routes, #community). The full controls only belong to the training view; every other view
// shows a stop bar while a treadmill is connected, so Stop is always in reach. style.css reads the
// data-view and data-stop attributes on <html>.

export type View = 'training' | 'history' | 'workouts' | 'routes' | 'community';
/** In the order of the navigation */
export const VIEWS: readonly View[] = ['training', 'workouts', 'routes', 'community', 'history'];

export type StopPlacement = 'controls' | 'bar' | 'none';

export const viewFromHash = (hash: string): View =>
  hash === '#history' ? 'history' : hash === '#workouts' ? 'workouts' : hash === '#routes' ? 'routes' : hash === '#community' ? 'community' : 'training';

/** Training: the controls (disabled without a connection). Elsewhere: the stop bar while connected. */
export function stopPlacement(view: View, connected: boolean): StopPlacement {
  if (view === 'training') return 'controls';
  return connected ? 'bar' : 'none';
}

export function setupViews(onChange: (v: View) => void) {
  let current: View | null = null;
  const apply = () => {
    const v = viewFromHash(location.hash);
    document.documentElement.dataset.view = v;
    for (const a of document.querySelectorAll<HTMLAnchorElement>('.views a')) {
      if (a.dataset.view === v) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    }
    if (current !== null && current !== v) window.scrollTo({ top: 0 });
    current = v;
    onChange(v);
  };
  window.addEventListener('hashchange', apply);
  apply();
}
