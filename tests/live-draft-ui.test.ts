import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { LiveDraftShortcutView } from '@/components/scout/live-draft-shortcut';

describe('atajo de partida en vivo', () => {
  it('sin key queda apagado, explica por qué y conserva la carga manual', () => {
    const html = renderToStaticMarkup(createElement(LiveDraftShortcutView, {
      availability: 'unconfigured',
      pending: false,
      players: '',
      risk: 'medium',
      state: { status: 'idle' },
    }));

    expect(html).toContain('Traer mi partida en vivo');
    expect(html).toMatch(/<button[^>]*disabled=""/);
    expect(html).toContain('API de Riot no está configurada');
    expect(html).toContain('cargando el draft a mano');
  });

  it('distingue Riot ID ausente de un error de key', () => {
    const noRiotId = renderToStaticMarkup(createElement(LiveDraftShortcutView, {
      availability: 'no-riot-id',
      pending: false,
      players: '',
      risk: 'medium',
      state: { status: 'idle' },
    }));
    const badKey = renderToStaticMarkup(createElement(LiveDraftShortcutView, {
      availability: 'available',
      pending: false,
      players: '',
      risk: 'medium',
      state: { status: 'invalid-key', message: 'La key de Riot no sirve o venció.' },
    }));

    expect(noRiotId).toContain('No cargaste tu Riot ID');
    expect(badKey).toContain('key de Riot no sirve o venció');
    expect(badKey).toContain('role="alert"');
  });
});
