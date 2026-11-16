/**
 * Avrundar till närmaste heltal, med .5 bort från noll.
 *
 * Talet normaliseras först till 15 värdesiffror så att flyttalsfel som
 * 1.005 * 100 = 100.49999999999999 inte avrundas åt fel håll.
 */
export function roundHalfAwayFromZero(value: number): number {
  const normalized = Number(Math.abs(value).toPrecision(15));
  const rounded = Math.round(normalized);
  return value < 0 ? -rounded : rounded;
}
