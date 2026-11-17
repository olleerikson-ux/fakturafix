/**
 * Artikelregister (#/artiklar): sparade rader som kan läggas på fakturor.
 * Fakturaraderna är kopior, så att ändra eller ta bort en artikel påverkar inte befintliga fakturor.
 */
import { formatSek, newId, parseSek, VAT_RATES, type Article, type Store, type VatRate } from '../../core/index';
import { h } from '../dom';
import {
  errorMessage,
  type FieldErrors,
  optional,
  readText,
  selectField,
  showErrors,
  STORAGE_ERROR_HINT,
  textField,
} from '../form';

const ID_PREFIX = 'art';

export interface ArticleInput {
  description: string;
  unit: string;
  unitPrice: string;
  vatRate: string;
}

/** Validerar artikelformuläret. Tomt objekt betyder att allt är rätt. */
export function validateArticle(input: ArticleInput): FieldErrors {
  const errors: FieldErrors = {};
  if (!input.description) errors.description = 'Ange en beskrivning.';
  const price = parseSek(input.unitPrice);
  if (price === null) errors.unitPrice = 'Ange ett pris, t.ex. 1 250,00.';
  if (!VAT_RATES.some((rate) => String(rate) === input.vatRate)) errors.vatRate = 'Välj en momssats.';
  return errors;
}

function priceToInput(ore: number): string {
  const abs = Math.abs(ore);
  return `${ore < 0 ? '-' : ''}${Math.floor(abs / 100)},${String(abs % 100).padStart(2, '0')}`;
}

function toArticle(input: ArticleInput, existing: Article | undefined): Article {
  return {
    id: existing?.id ?? newId(),
    description: input.description,
    unit: optional(input.unit),
    unitPrice: parseSek(input.unitPrice) ?? 0,
    vatRate: Number(input.vatRate) as VatRate,
    createdAt: existing?.createdAt ?? new Date().toISOString(),
  };
}

function byDescription(a: Article, b: Article): number {
  return a.description.localeCompare(b.description, 'sv');
}

export function articlesView(root: HTMLElement, store: Store): void {
  let editing: Article | undefined;
  const status = h('div', { class: 'status', role: 'status', 'aria-live': 'polite' });
  const listSection = h('section', { class: 'card', 'aria-labelledby': `${ID_PREFIX}-list-title` });
  const formSection = h('section', { class: 'card', 'aria-labelledby': `${ID_PREFIX}-form-title` });

  const announce = (text: string, kind: 'ok' | 'error' = 'ok') => {
    status.replaceChildren(...(text ? [h('p', { class: `notice notice-${kind}` }, text)] : []));
  };

  const remove = (article: Article) => {
    if (!window.confirm(`Vill du ta bort artikeln ${article.description}? Befintliga fakturor påverkas inte.`)) return;
    try {
      store.deleteArticle(article.id);
    } catch (error) {
      announce(errorMessage(error, `Kunde inte ta bort artikeln. ${STORAGE_ERROR_HINT}`), 'error');
      return;
    }
    if (editing?.id === article.id) editing = undefined;
    renderList();
    renderForm();
    announce(`Artikeln ${article.description} är borttagen.`);
  };

  const renderList = () => {
    const articles = store.listArticles().sort(byDescription);
    const title = h('h2', { id: `${ID_PREFIX}-list-title` }, 'Artiklar');
    if (articles.length === 0) {
      listSection.replaceChildren(
        title,
        h('p', { class: 'empty' }, 'Du har inga artiklar än. Spara de rader du ofta fakturerar, så går fakturorna snabbare.'),
      );
      return;
    }
    const rows = articles.map((a) =>
      h(
        'tr',
        {},
        h('td', { 'data-label': 'Beskrivning' }, a.description),
        h('td', { 'data-label': 'Enhet' }, a.unit ?? '–'),
        h('td', { class: 'num', 'data-label': 'Á-pris' }, formatSek(a.unitPrice)),
        h('td', { class: 'num', 'data-label': 'Moms' }, `${a.vatRate} %`),
        h(
          'td',
          { class: 'actions' },
          h(
            'button',
            {
              type: 'button',
              class: 'btn-secondary',
              'aria-label': `Redigera ${a.description}`,
              onclick: () => {
                editing = a;
                announce('');
                renderForm();
                formSection.querySelector('input')?.focus();
              },
            },
            'Redigera',
          ),
          h('button', { type: 'button', class: 'btn-danger', 'aria-label': `Ta bort ${a.description}`, onclick: () => remove(a) }, 'Ta bort'),
        ),
      ),
    );
    listSection.replaceChildren(
      title,
      h(
        'table',
        { class: 'table' },
        h(
          'thead',
          {},
          h(
            'tr',
            {},
            h('th', { scope: 'col' }, 'Beskrivning'),
            h('th', { scope: 'col' }, 'Enhet'),
            h('th', { scope: 'col', class: 'num' }, 'Á-pris'),
            h('th', { scope: 'col', class: 'num' }, 'Moms'),
            h('th', { scope: 'col' }, h('span', { class: 'visually-hidden' }, 'Åtgärder')),
          ),
        ),
        h('tbody', {}, ...rows),
      ),
    );
  };

  const renderForm = () => {
    const a = editing;
    const field = (spec: Parameters<typeof textField>[1]) => textField(ID_PREFIX, spec);
    const form = h(
      'form',
      { novalidate: true, class: 'form' },
      h(
        'fieldset',
        {},
        h('legend', {}, 'Artikel'),
        field({ name: 'description', label: 'Beskrivning', value: a?.description, required: true }),
        field({ name: 'unit', label: 'Enhet', value: a?.unit, hint: 'T.ex. st eller tim' }),
        field({ name: 'unitPrice', label: 'Á-pris exkl. moms', value: a ? priceToInput(a.unitPrice) : '', required: true, inputmode: 'decimal', placeholder: 'kr' }),
        selectField(
          ID_PREFIX,
          { name: 'vatRate', label: 'Moms', value: String(a?.vatRate ?? 25), required: true },
          VAT_RATES.map((rate) => ({ value: String(rate), label: `${rate} %` })),
        ),
      ),
      h('p', { class: 'hint' }, 'Fält markerade med * är obligatoriska.'),
      h(
        'div',
        { class: 'form-actions' },
        h('button', { type: 'submit', class: 'btn-primary' }, a ? 'Spara ändringar' : 'Lägg till artikel'),
        ...(a
          ? [
              h(
                'button',
                {
                  type: 'button',
                  class: 'btn-secondary',
                  onclick: () => {
                    editing = undefined;
                    renderForm();
                  },
                },
                'Avbryt',
              ),
            ]
          : []),
      ),
    );
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const input: ArticleInput = {
        description: readText(form, 'description'),
        unit: readText(form, 'unit'),
        unitPrice: readText(form, 'unitPrice'),
        vatRate: readText(form, 'vatRate'),
      };
      if (showErrors(form, validateArticle(input))) {
        announce('');
        return;
      }
      const article = toArticle(input, editing);
      try {
        store.saveArticle(article);
      } catch (error) {
        announce(errorMessage(error, `Kunde inte spara artikeln. ${STORAGE_ERROR_HINT}`), 'error');
        return;
      }
      const wasEditing = editing !== undefined;
      editing = undefined;
      renderList();
      renderForm();
      announce(wasEditing ? `Ändringarna för ${article.description} är sparade.` : `Artikeln ${article.description} är tillagd.`);
    });
    formSection.replaceChildren(h('h2', { id: `${ID_PREFIX}-form-title` }, a ? `Redigera ${a.description}` : 'Lägg till artikel'), form);
  };

  root.replaceChildren(h('h1', {}, 'Artiklar'), status, listSection, formSection);
  renderList();
  renderForm();
}
