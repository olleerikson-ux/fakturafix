/**
 * Acceptanstester: datum och fakturastatus.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { addDays, displayStatus, isValidIsoDate, today, type InvoiceStatus } from '../../src/core';
import { invoice } from './helpers';

describe('addDays', () => {
  it('lägger till dagar inom en månad', () => {
    expect(addDays('2026-03-01', 30)).toBe('2026-03-31');
  });

  it('hanterar månadsskifte', () => {
    expect(addDays('2026-01-15', 30)).toBe('2026-02-14');
    expect(addDays('2026-04-30', 1)).toBe('2026-05-01');
  });

  it('hanterar årsskifte åt båda hållen', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
  });

  it('hanterar skottår', () => {
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29');
    expect(addDays('2023-02-28', 1)).toBe('2023-03-01');
  });

  it('påverkas inte av sommartid', () => {
    expect(addDays('2026-03-28', 1)).toBe('2026-03-29');
    expect(addDays('2026-03-29', 1)).toBe('2026-03-30');
    expect(addDays('2026-10-25', 1)).toBe('2026-10-26');
  });

  it('noll dagar ger samma datum', () => {
    expect(addDays('2026-06-15', 0)).toBe('2026-06-15');
  });
});

describe('today', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('ger formatet YYYY-MM-DD', () => {
    expect(today()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('använder lokal tid, även sent på kvällen', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 4, 5, 23, 30));
    expect(today()).toBe('2026-05-05');
    vi.setSystemTime(new Date(2026, 0, 1, 0, 15));
    expect(today()).toBe('2026-01-01');
  });
});

describe('displayStatus', () => {
  const now = '2026-03-10';

  it('skickad faktura med förfallodatum igår är förfallen', () => {
    expect(displayStatus(invoice({ status: 'sent', dueDate: '2026-03-09' }), now)).toBe('overdue');
  });

  it('skickad faktura med förfallodatum igår relativt today() är förfallen', () => {
    const t = today();
    expect(displayStatus(invoice({ status: 'sent', dueDate: addDays(t, -1) }), t)).toBe('overdue');
  });

  it('skickad faktura som förfaller idag är obetald, inte förfallen', () => {
    expect(displayStatus(invoice({ status: 'sent', dueDate: now }), now)).toBe('unpaid');
  });

  it('skickad faktura som förfaller senare är obetald', () => {
    expect(displayStatus(invoice({ status: 'sent', dueDate: '2026-04-09' }), now)).toBe('unpaid');
  });

  it('betald faktura är betald även efter förfallodatum', () => {
    const paid = invoice({ status: 'paid', dueDate: '2026-03-01', paidDate: '2026-03-05' });
    expect(displayStatus(paid, now)).toBe('paid');
  });

  it('utkast är utkast även efter förfallodatum', () => {
    expect(displayStatus(invoice({ status: 'draft', dueDate: '2026-03-01' }), now)).toBe('draft');
  });

  it('jämför datum korrekt över månads- och årsskifte', () => {
    expect(displayStatus(invoice({ status: 'sent', dueDate: '2025-12-31' }), '2026-01-01')).toBe('overdue');
    expect(displayStatus(invoice({ status: 'sent', dueDate: '2026-01-01' }), '2025-12-31')).toBe('unpaid');
  });
});

describe('displayStatus: okänd status (issue #12)', () => {
  it('ger unpaid för en status som inte finns i kontraktet', () => {
    const odd = invoice({ status: 'skickad' as unknown as InvoiceStatus, dueDate: '2026-03-01' });
    expect(displayStatus(odd, '2026-03-10')).toBe('unpaid');
  });
});

describe('isValidIsoDate (issue #12)', () => {
  it('godtar giltiga datum på formen YYYY-MM-DD', () => {
    expect(isValidIsoDate('2026-03-10')).toBe(true);
    expect(isValidIsoDate('2026-12-31')).toBe(true);
    expect(isValidIsoDate('2026-01-01')).toBe(true);
  });

  it('hanterar skottår', () => {
    expect(isValidIsoDate('2024-02-29')).toBe(true);
    expect(isValidIsoDate('2028-02-29')).toBe(true);
    expect(isValidIsoDate('2027-02-29')).toBe(false);
    expect(isValidIsoDate('2100-02-29')).toBe(false);
    expect(isValidIsoDate('2000-02-29')).toBe(true);
  });

  it('avvisar datum som inte finns', () => {
    expect(isValidIsoDate('2026-02-30')).toBe(false);
    expect(isValidIsoDate('2026-04-31')).toBe(false);
    expect(isValidIsoDate('2026-13-01')).toBe(false);
    expect(isValidIsoDate('2026-00-10')).toBe(false);
    expect(isValidIsoDate('2026-01-00')).toBe(false);
  });

  it('avvisar fel format', () => {
    expect(isValidIsoDate('')).toBe(false);
    expect(isValidIsoDate('2026-1-5')).toBe(false);
    expect(isValidIsoDate('10/03/2026')).toBe(false);
    expect(isValidIsoDate('2026-03-10T00:00:00Z')).toBe(false);
    expect(isValidIsoDate(' 2026-03-10')).toBe(false);
    expect(isValidIsoDate('idag')).toBe(false);
  });

  it('alla datum som addDays ger är giltiga', () => {
    let d = '2027-12-25';
    for (let i = 0; i < 400; i++) {
      d = addDays(d, 1);
      expect(isValidIsoDate(d)).toBe(true);
    }
  });
});
