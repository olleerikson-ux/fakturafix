/** Lista med sök där användaren väljer en artikel att lägga som rad på fakturan. */
import { formatSek, type Article } from '../core/index';
import { h } from './dom';
import { openModal } from './modal';

export function matchesArticle(article: Article, query: string): boolean {
  const q = query.trim().toLowerCase();
  return q === '' || article.description.toLowerCase().includes(q);
}

export function openArticlePicker(articles: Article[], onPick: (article: Article) => void): void {
  const search = h('input', { type: 'search', id: 'article-search', placeholder: 'Sök artikel', 'aria-label': 'Sök artikel' });
  const list = h('ul', { class: 'article-list' });

  const render = () => {
    const shown = articles.filter((a) => matchesArticle(a, search.value));
    list.replaceChildren(
      ...(shown.length === 0
        ? [h('li', { class: 'empty' }, articles.length === 0 ? 'Du har inga artiklar än. Lägg till dem under Artiklar.' : 'Inga artiklar matchar sökningen.')]
        : shown.map((a) =>
            h(
              'li',
              {},
              h(
                'button',
                {
                  type: 'button',
                  class: 'btn-secondary article-item',
                  onclick: () => {
                    modal.close();
                    onPick(a);
                  },
                },
                h('span', {}, a.description),
                h('span', { class: 'num' }, `${formatSek(a.unitPrice)} · ${a.vatRate} %`),
              ),
            ),
          )),
    );
  };
  search.addEventListener('input', render);

  const modal = openModal(
    [
      h('h2', { id: 'article-title' }, 'Lägg till från artikel'),
      search,
      list,
      h('div', { class: 'form-actions' }, h('button', { type: 'button', class: 'btn-secondary', onclick: () => modal.close() }, 'Stäng')),
    ],
    'article-title',
    () => search,
  );
  render();
}
