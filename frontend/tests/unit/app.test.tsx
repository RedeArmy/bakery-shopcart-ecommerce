// cspell:ignore Pastelería Bienvenido Ocurrió inesperado Intente nuevo
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppProviders } from '../../src/app/providers';
import { ErrorBoundary } from '../../src/app/error-boundary';
import { config } from '../../src/shared/config/env';
import '../../src/shared/i18n';

afterEach(cleanup);

function Boom(): never {
  throw new Error('render failure');
}

describe('application shell', () => {
  it('renders the layout and the home page through the browser router', async () => {
    render(<AppProviders />);
    expect(await screen.findByRole('heading', { level: 1 })).toHaveProperty(
      'textContent',
      'Bienvenido a Dulce Aroma',
    );
    expect(screen.getByText('Pastelería Dulce Aroma')).toBeDefined();
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
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );
    expect(screen.getByRole('alert').textContent).toBe(
      'Ocurrió un error inesperado. Intente de nuevo.',
    );
    expect(logged).toHaveBeenCalled();
    logged.mockRestore();
  });
});

describe('client configuration', () => {
  it('defaults the API base URL to the same-origin versioned path', () => {
    expect(config.apiBaseUrl).toBe('/api/v1');
  });
});
