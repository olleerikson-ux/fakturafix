import { afterEach, describe, expect, it, vi } from 'vitest';
import { addDays, displayStatus, today } from './dates';
import type { Invoice, InvoiceStatus } from './types';

describe('addDays', () => {
  it('lägger till dagar inom en månad', () => {
    expect(addDays('2026-03-10', 5)).toBe('2026-03-15');
  });

  it('hanterar månadsskifte', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01');
  });

  it('hanterar årsskifte', () => {
    expect(addDays('2026-12-20', 30)).toBe('2027-01-19');
  });

  it('hanterar skottår', () => {
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2027-02-28', 1)).toBe('2027-03-01');
  });

  it('kan dra ifrån dagar', () => {
    expect(addDays('2027-01-01', -1)).toBe('2026-12-31');
  });

  it('påverkas inte av sommartid', () => {
    expect(addDays('2026-03-28', 2)).toBe('2026-03-30');
    expect(addDays('2026-10-24', 2)).toBe('2026-10-26');
  });

  it('kastar fel för ogiltiga datum', () => {
    expect(() => addDays('2026-02-30', 1)).toThrow();
    expect(() => addDays('20260101', 1)).toThrow();
  });
});

describe('today', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('ger lokalt datum som YYYY-MM-DD', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 0, 5, 23, 59));
    expect(today()).toBe('2026-01-05');
  });
});

describe('displayStatus', () => {
  function invoice(status: InvoiceStatus, dueDate = '2026-11-30'): Invoice {
    return {
      id: 'f1',
      number: 1001,
      customerId: 'k1',
      issueDate: '2026-11-01',
      dueDate,
      lines: [],
      ocr: '100164',
      status,
      createdAt: '2026-11-01T10:00:00.000Z',
    };
  }

  it('ger draft för utkast även efter förfallodatum', () => {
    expect(displayStatus(invoice('draft'), '2027-01-01')).toBe('draft');
  });

  it('ger paid för betalda fakturor även efter förfallodatum', () => {
    expect(displayStatus(invoice('paid'), '2027-01-01')).toBe('paid');
  });

  it('ger unpaid för skickad faktura till och med förfallodagen', () => {
    expect(displayStatus(invoice('sent'), '2026-11-29')).toBe('unpaid');
    expect(displayStatus(invoice('sent'), '2026-11-30')).toBe('unpaid');
  });

  it('ger overdue för skickad faktura efter förfallodagen', () => {
    expect(displayStatus(invoice('sent'), '2026-12-01')).toBe('overdue');
  });
});
