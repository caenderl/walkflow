// What the training view is about: one workout, or one route, or nothing (free training: the person sets the speed). A
// workout or route is chosen in its own view ("Use"); the training view shows the choice and Start starts it.

export type Active = 'workout' | 'route' | null;

export const ACTIVE_STORAGE_KEY = 'walkflow.active';

/** What is stored; anything unknown means free training */
export const readActive = (raw: string | null): Active => (raw === 'workout' || raw === 'route' ? raw : null);
