// cspell:disable
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { Disclosure } from '../../src/shared/ui/disclosure';

afterEach(cleanup);

describe('Disclosure', () => {
  it('starts closed, with the title as a button that says it is collapsed and the content hidden', () => {
    render(
      <Disclosure id="demo" title="Dirección de entrega" summary="Casa · Ana">
        <p>Contenido</p>
      </Disclosure>,
    );
    const toggle = screen.getByRole('button', { name: 'Dirección de entrega' });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(toggle.getAttribute('aria-controls')).toBe('demo-panel');
    // El resumen de lo elegido se ve aunque esté cerrada
    expect(screen.getByText('Casa · Ana')).toBeDefined();
    expect(screen.getByText('Contenido').closest('[hidden]')).not.toBeNull();
  });

  it('opens and closes with the button, and the title stays a heading', async () => {
    const user = userEvent.setup();
    render(
      <Disclosure id="demo" title="Dirección de entrega">
        <p>Contenido</p>
      </Disclosure>,
    );
    expect(screen.getByRole('heading', { name: 'Dirección de entrega' })).toBeDefined();
    const toggle = screen.getByRole('button', { name: 'Dirección de entrega' });

    await user.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByText('Contenido').closest('[hidden]')).toBeNull();

    await user.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(screen.getByText('Contenido').closest('[hidden]')).not.toBeNull();
  });

  it('can start open', () => {
    render(
      <Disclosure id="demo" title="Personalización" defaultOpen>
        <p>Contenido</p>
      </Disclosure>,
    );
    expect(
      screen.getByRole('button', { name: 'Personalización' }).getAttribute('aria-expanded'),
    ).toBe('true');
    expect(screen.getByText('Contenido').closest('[hidden]')).toBeNull();
  });

  it('keeps what was typed inside when it is collapsed, because the content stays mounted', async () => {
    const user = userEvent.setup();
    render(
      <Disclosure id="demo" title="Mensaje" defaultOpen>
        <input aria-label="Texto" />
      </Disclosure>,
    );
    await user.type(screen.getByLabelText('Texto'), 'Feliz cumpleaños');
    await user.click(screen.getByRole('button', { name: 'Mensaje' }));
    await user.click(screen.getByRole('button', { name: 'Mensaje' }));
    expect(screen.getByLabelText<HTMLInputElement>('Texto').value).toBe('Feliz cumpleaños');
  });
});
