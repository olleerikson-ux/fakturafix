import type { Ore } from './types';

/**
 * Tusentalsavgränsare i formaterade belopp. Vi använder ett vanligt
 * mellanslag (U+0020) för att resultatet ska vara lätt att jämföra i tester
 * och kopiera. Gränssnittet kan använda CSS `white-space: nowrap` om ett
 * belopp inte får brytas.
 */
const THOUSANDS_SEPARATOR = ' ';

/** Formaterar öre som svensk valuta, t.ex. 123450 -> "1 234,50 kr". */
export function formatSek(ore: Ore): string {
  const sign = ore < 0 ? '-' : '';
  const absolute = Math.abs(Math.trunc(ore));
  const kronor = Math.floor(absolute / 100);
  const oren = absolute % 100;
  const groupedKronor = String(kronor).replace(/\B(?=(\d{3})+(?!\d))/g, THOUSANDS_SEPARATOR);
  return `${sign}${groupedKronor},${String(oren).padStart(2, '0')} kr`;
}

const SEK_PATTERN = /^(-?)(\d+)(?:[.,](\d{1,2}))?$/;

/**
 * Tolkar inmatning som "1 234,50", "1234.5" eller "1234,5 kr" till öre.
 * Mellanslag (även hårda) ignoreras och ett avslutande "kr" är tillåtet.
 * Fler än två decimaler, flera decimaltecken eller annan text ger null.
 */
export function parseSek(input: string): Ore | null {
  const compact = input
    .trim()
    .replace(/\s*kr\.?$/i, '')
    .replace(/[\s  ]/g, '');
  const match = SEK_PATTERN.exec(compact);
  if (!match) return null;

  const [, sign = '', whole = '0', fraction = ''] = match;
  const ore = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  if (!Number.isSafeInteger(ore)) return null;
  return sign === '-' && ore !== 0 ? -ore : ore;
}
