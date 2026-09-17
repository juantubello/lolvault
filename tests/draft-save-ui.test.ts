import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { DraftSaveActionView } from '@/components/scout/draft-record-actions';

function renderSaveAction(overrides: Partial<Parameters<typeof DraftSaveActionView>[0]> = {}) {
  return renderToStaticMarkup(createElement(DraftSaveActionView, {
    allies: '1-top,2-jungle,3-middle,4-bottom',
    clearHref: '/scout?tipo=draft',
    enemies: '6-top,7-jungle,8-middle',
    missingPicks: 3,
    pending: false,
    recordHref: '/scout?tipo=registro',
    risk: 'medium',
    state: {},
    ...overrides,
  }));
}

describe('acción de guardado del Draft', () => {
  it('queda deshabilitada y dice cuántos campeones faltan cuando el draft está incompleto', () => {
    const html = renderSaveAction();

    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>[\s\S]*Faltan 3 campeones[\s\S]*<\/button>/);
  });

  it('confirma el guardado y ofrece un acceso directo al Registro', () => {
    const html = renderSaveAction({ missingPicks: 0, state: { savedId: 42 } });

    expect(html).toContain('role="status"');
    expect(html).toContain('Guardado');
    expect(html).toContain('href="/scout?tipo=registro"');
    expect(html).toContain('Ver Registro');
  });
});
