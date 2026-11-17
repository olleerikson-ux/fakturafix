import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Store } from '../../core/index';
import { openArticlePicker, matchesArticle } from '../article-picker';
import { createMemoryStore, fill } from '../test-utils';
import { articlesView, validateArticle } from './articles';

describe('validateArticle', () => {
  it('kräver beskrivning, pris och momssats', () => {
    expect(validateArticle({ description: 'Timme', unit: 'tim', unitPrice: '1 000,00', vatRate: '25' })).toEqual({});
    const errors = validateArticle({ description: '', unit: '', unitPrice: 'x', vatRate: '7' });
    expect(Object.keys(errors).sort()).toEqual(['description', 'unitPrice', 'vatRate']);
  });
});

describe('articlesView', () => {
  let root: HTMLElement;
  let store: Store;
  beforeEach(() => {
    root = document.createElement('div');
    document.body.append(root);
    store = createMemoryStore();
  });
  afterEach(() => {
    root.remove();
    document.body.replaceChildren();
    vi.restoreAllMocks();
  });

  it('lägger till, ändrar och tar bort en artikel', () => {
    articlesView(root, store);
    expect(root.textContent).toContain('inga artiklar');
    const form = root.querySelector('form') as HTMLFormElement;
    fill(form, 'description', 'Konsulttimme');
    fill(form, 'unit', 'tim');
    fill(form, 'unitPrice', '950');
    form.requestSubmit();
    expect(store.listArticles()).toHaveLength(1);
    expect(store.listArticles()[0]).toMatchObject({ description: 'Konsulttimme', unit: 'tim', unitPrice: 95000, vatRate: 25 });

    [...root.querySelectorAll('button')].find((b) => b.textContent === 'Redigera')?.click();
    const edit = root.querySelector('form') as HTMLFormElement;
    fill(edit, 'unitPrice', '1000');
    edit.requestSubmit();
    expect(store.listArticles()[0]?.unitPrice).toBe(100000);
    expect(store.listArticles()).toHaveLength(1);

    vi.spyOn(window, 'confirm').mockReturnValue(true);
    [...root.querySelectorAll('button')].find((b) => b.textContent === 'Ta bort')?.click();
    expect(store.listArticles()).toHaveLength(0);
  });
});

describe('artikelväljaren', () => {
  afterEach(() => document.body.replaceChildren());
  const articles = [
    { id: 'a1', description: 'Konsulttimme', unit: 'tim', unitPrice: 95000, vatRate: 25 as const, createdAt: '2026-01-01T00:00:00.000Z' },
    { id: 'a2', description: 'Bok', unitPrice: 20000, vatRate: 6 as const, createdAt: '2026-01-01T00:00:00.000Z' },
  ];

  it('söker och väljer en artikel', () => {
    const onPick = vi.fn();
    openArticlePicker(articles, onPick);
    const search = document.querySelector<HTMLInputElement>('#article-search');
    if (!search) throw new Error('Sökfältet saknas');
    search.value = 'bok';
    search.dispatchEvent(new Event('input'));
    expect(document.querySelectorAll('.article-item')).toHaveLength(1);
    document.querySelector<HTMLButtonElement>('.article-item')?.click();
    expect(onPick).toHaveBeenCalledWith(articles[1]);
    expect(document.querySelector('.modal')).toBeNull();
    expect(matchesArticle(articles[0]!, 'TIMME')).toBe(true);
  });
});
