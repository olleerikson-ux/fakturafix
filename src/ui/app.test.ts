import { describe, expect, it } from 'vitest';
import { startApp } from './app';

describe('startApp', () => {
  it('ritar navigering och startvyn', () => {
    const root = document.createElement('div');
    startApp(root);
    expect(root.querySelector('nav')?.textContent).toContain('Kunder');
    expect(root.querySelector('main h1')?.textContent).toBe('Översikt');
  });
});
