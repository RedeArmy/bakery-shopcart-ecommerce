// cspell:ignore Pastelería Ocurrió inesperado Intente nuevo Pasteles hornean celebración
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppProviders } from '../../src/app/providers';
import { ErrorBoundary } from '../../src/app/error-boundary';
import { config } from '../../src/shared/config/env';
import '../../src/shared/i18n';
import { installFakeApi, json } from './support/fake-api';
import { page } from './support/render';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function Boom(): never {
  throw new Error('render failure');
}

describe('application shell', () => {
  it('renders the layout and the home page through the browser router', async () => {
    installFakeApi({
      'GET /api/v1/categories': json([]),
      'GET /api/v1/products': json(page([])),
    });
    render(<AppProviders />);
    expect(await screen.findByRole('heading', { level: 1 })).toHaveProperty(
      'textContent',
      'Pasteles que se hornean para su celebración',
    );
    expect(screen.getAllByText('Pastelería').length).toBeGreaterThan(0);
  });
});

describe('error boundary', () => {
  it('renders its children when nothing fails', () => {
    render(
      <ErrorBoundary>
        <p>all good</p>
      </ErrorBoundary>,
    );
    expect(screen.getByText('all good')).toBeDefined();
  });

  it('shows the Spanish fallback and logs the error when a child throws', () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    // jsdom reporta como "Uncaught" el error que este componente lanza a propósito; se marca como atendido
    const handled = (event: ErrorEvent): void => {
      event.preventDefault();
    };
    window.addEventListener('error', handled);
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );
    expect(screen.getByRole('alert').textContent).toBe(
      'Ocurrió un error inesperado. Intente de nuevo.',
    );
    expect(logged).toHaveBeenCalled();
    window.removeEventListener('error', handled);
    logged.mockRestore();
  });
});

describe('client configuration', () => {
  it('defaults the API base URL to the same-origin versioned path', () => {
    expect(config.apiBaseUrl).toBe('/api/v1');
  });
});
