/**
 * Kundregister (#/kunder): lista, lägg till, redigera och ta bort kunder.
 */
import { newId, type Customer, type Store } from '../../core/index';
import { h } from '../dom';
import {
  checkboxField,
  type FieldErrors,
  formatPostalCode,
  isSwedishCountry,
  isValidEmail,
  isValidPostalCode,
  optional,
  readChecked,
  readText,
  showErrors,
  STORAGE_ERROR_HINT,
  textField,
} from '../form';

const ID_PREFIX = 'kund';

/** Värdena i kundformuläret innan de blir en Customer. */
export interface CustomerInput {
  name: string;
  orgNumber: string;
  vatNumber: string;
  email: string;
  reference: string;
  reverseCharge?: boolean;
  street: string;
  postalCode: string;
  city: string;
  country: string;
}

/** Validerar kundformuläret. Returnerar fel per fältnamn (tomt objekt om allt är rätt). */
export function validateCustomer(input: CustomerInput): FieldErrors {
  const errors: FieldErrors = {};
  if (!input.name) errors.name = 'Ange kundens namn.';
  if (!input.street) errors.street = 'Ange gatuadress.';
  if (!input.postalCode) errors.postalCode = 'Ange postnummer.';
  else if (isSwedishCountry(input.country) && !isValidPostalCode(input.postalCode)) errors.postalCode = 'Svenska postnummer ska vara 5 siffror, t.ex. 123 45. Fyll i Land för utländska adresser.';
  if (!input.city) errors.city = 'Ange ort.';
  if (input.reverseCharge && !input.vatNumber) {
    errors.vatNumber = 'Omvänd skattskyldighet kräver kundens momsregistreringsnummer.';
  }
  if (input.email && !isValidEmail(input.email)) errors.email = 'Ange en giltig e-postadress.';
  return errors;
}

function readCustomerInput(form: HTMLFormElement): CustomerInput {
  return {
    name: readText(form, 'name'),
    orgNumber: readText(form, 'orgNumber'),
    vatNumber: readText(form, 'vatNumber'),
    email: readText(form, 'email'),
    reference: readText(form, 'reference'),
    reverseCharge: readChecked(form, 'reverseCharge'),
    street: readText(form, 'street'),
    postalCode: readText(form, 'postalCode'),
    city: readText(form, 'city'),
    country: readText(form, 'country'),
  };
}

function toCustomer(input: CustomerInput, existing: Customer | undefined): Customer {
  return {
    id: existing?.id ?? newId(),
    name: input.name,
    orgNumber: optional(input.orgNumber),
    vatNumber: optional(input.vatNumber),
    email: optional(input.email),
    reference: optional(input.reference),
    ...(input.reverseCharge ? { reverseCharge: true } : {}),
    address: {
      street: input.street,
      postalCode: isSwedishCountry(input.country) ? formatPostalCode(input.postalCode) : input.postalCode,
      city: input.city,
      country: optional(input.country),
    },
    createdAt: existing?.createdAt ?? new Date().toISOString(),
  };
}

function byName(a: Customer, b: Customer): number {
  return a.name.localeCompare(b.name, 'sv');
}

export function customersView(root: HTMLElement, store: Store): void {
  let editing: Customer | undefined;
  const status = h('div', { class: 'status', role: 'status', 'aria-live': 'polite' });
  const listSection = h('section', { class: 'card', 'aria-labelledby': `${ID_PREFIX}-list-title` });
  const formSection = h('section', { class: 'card', 'aria-labelledby': `${ID_PREFIX}-form-title` });

  const announce = (text: string, kind: 'ok' | 'error' = 'ok') => {
    status.replaceChildren(...(text ? [h('p', { class: `notice notice-${kind}` }, text)] : []));
  };

  const startEdit = (customer: Customer) => {
    editing = customer;
    announce('');
    renderForm();
    formSection.querySelector('input')?.focus();
  };

  const remove = (customer: Customer) => {
    const invoiceCount = store.listInvoices().filter((i) => i.customerId === customer.id).length;
    if (invoiceCount > 0) {
      const what = invoiceCount === 1 ? '1 faktura' : `${invoiceCount} fakturor`;
      announce(
        `${customer.name} kan inte tas bort eftersom kunden har ${what}. Kunduppgifterna behövs på fakturorna.`,
        'error',
      );
      return;
    }
    if (!window.confirm(`Vill du ta bort kunden ${customer.name}?`)) return;
    try {
      store.deleteCustomer(customer.id);
    } catch {
      announce(`Kunde inte ta bort ${customer.name}. ${STORAGE_ERROR_HINT}`, 'error');
      return;
    }
    if (editing?.id === customer.id) {
      editing = undefined;
      renderForm();
    }
    renderList();
    announce(`Kunden ${customer.name} är borttagen.`);
  };

  const renderList = () => {
    const customers = store.listCustomers().sort(byName);
    const title = h('h2', { id: `${ID_PREFIX}-list-title` }, 'Kundlista');
    if (customers.length === 0) {
      listSection.replaceChildren(
        title,
        h('p', { class: 'empty' }, 'Du har inga kunder än. Lägg till din första kund i formuläret nedan.'),
      );
      return;
    }
    const rows = customers.map((c) =>
      h(
        'tr',
        {},
        h('td', { 'data-label': 'Namn' }, c.name),
        h('td', { 'data-label': 'Org.nr' }, c.orgNumber ?? '–'),
        h('td', { 'data-label': 'Ort' }, c.address.city),
        h('td', { 'data-label': 'E-post' }, c.email ?? '–'),
        h(
          'td',
          { class: 'actions' },
          h(
            'button',
            { type: 'button', class: 'btn-secondary', 'aria-label': `Redigera ${c.name}`, onclick: () => startEdit(c) },
            'Redigera',
          ),
          h(
            'button',
            { type: 'button', class: 'btn-danger', 'aria-label': `Ta bort ${c.name}`, onclick: () => remove(c) },
            'Ta bort',
          ),
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
            h('th', { scope: 'col' }, 'Namn'),
            h('th', { scope: 'col' }, 'Org.nr'),
            h('th', { scope: 'col' }, 'Ort'),
            h('th', { scope: 'col' }, 'E-post'),
            h('th', { scope: 'col' }, h('span', { class: 'visually-hidden' }, 'Åtgärder')),
          ),
        ),
        h('tbody', {}, ...rows),
      ),
    );
  };

  const renderForm = () => {
    const c = editing;
    const field = (spec: Parameters<typeof textField>[1]) => textField(ID_PREFIX, spec);
    const form = h(
      'form',
      { novalidate: true, class: 'form' },
      h(
        'fieldset',
        {},
        h('legend', {}, 'Kunduppgifter'),
        field({ name: 'name', label: 'Namn', value: c?.name, required: true, autocomplete: 'organization' }),
        field({ name: 'orgNumber', label: 'Org.nr eller personnummer', value: c?.orgNumber, hint: 'T.ex. 556000-0000' }),
        field({ name: 'vatNumber', label: 'Momsregistreringsnummer', value: c?.vatNumber, hint: 'T.ex. SE556000000001' }),
        field({ name: 'email', label: 'E-post', type: 'email', value: c?.email, autocomplete: 'email' }),
        field({ name: 'reference', label: 'Er referens', value: c?.reference }),
        checkboxField(ID_PREFIX, 'reverseCharge', 'Omvänd skattskyldighet (företag i annat EU-land)', c?.reverseCharge ?? false),
        h('p', { class: 'hint' }, 'Fakturor till kunden får då 0 % moms och texten "Omvänd skattskyldighet". Kräver kundens momsregistreringsnummer.'),
      ),
      h(
        'fieldset',
        {},
        h('legend', {}, 'Adress'),
        field({ name: 'street', label: 'Gatuadress', value: c?.address.street, required: true, autocomplete: 'street-address' }),
        field({
          name: 'postalCode',
          label: 'Postnummer',
          value: c?.address.postalCode,
          required: true,
          hint: '5 siffror för svenska adresser',
          autocomplete: 'postal-code',
        }),
        field({ name: 'city', label: 'Ort', value: c?.address.city, required: true, autocomplete: 'address-level2' }),
        field({ name: 'country', label: 'Land', value: c?.address.country, hint: 'Lämna tomt för Sverige', autocomplete: 'country-name' }),
      ),
      h('p', { class: 'hint' }, 'Fält markerade med * är obligatoriska.'),
      h(
        'div',
        { class: 'form-actions' },
        h('button', { type: 'submit', class: 'btn-primary' }, c ? 'Spara ändringar' : 'Lägg till kund'),
        ...(c
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
      const input = readCustomerInput(form);
      if (showErrors(form, validateCustomer(input))) {
        announce('');
        return;
      }
      const customer = toCustomer(input, editing);
      try {
        store.saveCustomer(customer);
      } catch {
        announce(`Kunde inte spara kunden. ${STORAGE_ERROR_HINT}`, 'error');
        return;
      }
      const wasEditing = editing !== undefined;
      editing = undefined;
      renderList();
      renderForm();
      announce(wasEditing ? `Ändringarna för ${customer.name} är sparade.` : `Kunden ${customer.name} är tillagd.`);
    });
    formSection.replaceChildren(
      h('h2', { id: `${ID_PREFIX}-form-title` }, c ? `Redigera ${c.name}` : 'Lägg till kund'),
      form,
    );
  };

  root.replaceChildren(h('h1', {}, 'Kunder'), status, listSection, formSection);
  renderList();
  renderForm();
}
