/**
 * Gemensamma hjälpfunktioner för formulär: fält med kopplad etikett,
 * inläsning av värden och visning av valideringsfel.
 */
import { h } from './dom';

export type FieldErrors = Record<string, string>;

export interface FieldSpec {
  name: string;
  label: string;
  value?: string | undefined;
  type?: string;
  required?: boolean;
  autocomplete?: string;
  inputmode?: string;
  hint?: string;
}

/** Skapar ett textfält med <label>, valfri hjälptext och en plats för felmeddelande. */
export function textField(idPrefix: string, spec: FieldSpec): HTMLElement {
  const id = `${idPrefix}-${spec.name}`;
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const input = h('input', {
    id,
    name: spec.name,
    type: spec.type ?? 'text',
    value: spec.value ?? '',
    required: spec.required ?? false,
    autocomplete: spec.autocomplete,
    inputmode: spec.inputmode,
    'aria-describedby': spec.hint ? hintId : undefined,
  });
  return h(
    'div',
    { class: 'field' },
    h('label', { for: id }, spec.required ? `${spec.label} *` : spec.label),
    ...(spec.hint ? [h('small', { id: hintId, class: 'hint' }, spec.hint)] : []),
    input,
    h('p', { id: errorId, class: 'field-error', hidden: true }),
  );
}

/** Kryssruta med etikett. */
export function checkboxField(idPrefix: string, name: string, label: string, checked: boolean): HTMLElement {
  const id = `${idPrefix}-${name}`;
  return h(
    'div',
    { class: 'field field-checkbox' },
    h('input', { id, name, type: 'checkbox', checked }),
    h('label', { for: id }, label),
  );
}

/** Läser ett trimmat textvärde ur formuläret. */
export function readText(form: HTMLFormElement, name: string): string {
  const el = form.elements.namedItem(name);
  return el instanceof HTMLInputElement ? el.value.trim() : '';
}

/** Läser en kryssruta ur formuläret. */
export function readChecked(form: HTMLFormElement, name: string): boolean {
  const el = form.elements.namedItem(name);
  return el instanceof HTMLInputElement && el.checked;
}

/** Tom sträng blir undefined, så att valfria fält inte sparas som "". */
export function optional(value: string): string | undefined {
  return value === '' ? undefined : value;
}

/**
 * Visar felen vid respektive fält, rensar gamla fel och flyttar fokus
 * till det första felaktiga fältet. Returnerar true om det fanns fel.
 */
export function showErrors(form: HTMLFormElement, errors: FieldErrors): boolean {
  let first: HTMLInputElement | undefined;
  for (const input of form.querySelectorAll<HTMLInputElement>('input[name]')) {
    const errorEl = form.querySelector<HTMLElement>(`#${input.id}-error`);
    const message = errors[input.name];
    const hintId = form.querySelector(`#${input.id}-hint`) ? `${input.id}-hint` : '';
    if (message) {
      input.setAttribute('aria-invalid', 'true');
      input.setAttribute('aria-describedby', [hintId, `${input.id}-error`].filter(Boolean).join(' '));
      if (errorEl) {
        errorEl.textContent = message;
        errorEl.hidden = false;
      }
      first ??= input;
    } else {
      input.removeAttribute('aria-invalid');
      if (hintId) input.setAttribute('aria-describedby', hintId);
      else input.removeAttribute('aria-describedby');
      if (errorEl) {
        errorEl.textContent = '';
        errorEl.hidden = true;
      }
    }
  }
  first?.focus();
  return first !== undefined;
}

/** Postnummer: fem siffror, med eller utan mellanslag. */
export function isValidPostalCode(value: string): boolean {
  return /^\d{5}$/.test(value.replace(/\s+/g, ''));
}

/** Normaliserar postnummer till formen "123 45". */
export function formatPostalCode(value: string): string {
  const digits = value.replace(/\s+/g, '');
  return `${digits.slice(0, 3)} ${digits.slice(3)}`;
}

/** Enkel kontroll av e-postadress (något@något). */
export function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

