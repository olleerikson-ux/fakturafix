import { roundHalfAwayFromZero } from './rounding';
import type { InvoiceLine, InvoiceTotals, Ore, VatRate } from './types';

/** Radbelopp exkl. moms i öre, avrundat till närmaste öre. */
export function lineNet(line: InvoiceLine): Ore {
  return roundHalfAwayFromZero(line.quantity * line.unitPrice);
}

/** Summerar radernas nettobelopp per momssats. */
function netByRate(lines: InvoiceLine[]): Map<VatRate, Ore> {
  const sums = new Map<VatRate, Ore>();
  for (const line of lines) {
    sums.set(line.vatRate, (sums.get(line.vatRate) ?? 0) + lineNet(line));
  }
  return sums;
}

/**
 * Summerar fakturarader: netto, moms per sats, öresavrundning och total.
 *
 * Momsen räknas på summan av raderna med samma sats (inte per rad) och
 * avrundas till närmaste öre. Totalen avrundas till hela kronor och
 * skillnaden redovisas i `rounding`.
 */
export function calculateTotals(lines: InvoiceLine[]): InvoiceTotals {
  let net = 0;
  let vat = 0;
  const vatByRate: Partial<Record<VatRate, Ore>> = {};

  for (const [rate, rateNet] of netByRate(lines)) {
    const rateVat = roundHalfAwayFromZero((rateNet * rate) / 100);
    vatByRate[rate] = rateVat;
    net += rateNet;
    vat += rateVat;
  }

  const exact = net + vat;
  const total = roundHalfAwayFromZero(exact / 100) * 100;
  return { net, vatByRate, vat, rounding: total - exact, total };
}
