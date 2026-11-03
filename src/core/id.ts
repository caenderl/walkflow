// Ids of things the person creates (workouts, routes): time in base 36 plus a few random characters. Unique enough for one
// person's library; an import always gets a new one, so nothing from outside can take the place of something saved.

export function newId(now: number, random: () => number = Math.random): string {
  return `${now.toString(36)}-${Math.floor(random() * 36 ** 4).toString(36)}`;
}
