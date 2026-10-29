import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import i18n from '../shared/i18n';

interface State {
  hasError: boolean;
}

/** Última red de seguridad: un error de renderizado no deja la pantalla en blanco. */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  override state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Unhandled rendering error', error, info.componentStack);
  }

  override render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div role="alert" className="p-8 text-center">
          {i18n.t('errors.unexpected')}
        </div>
      );
    }
    return this.props.children;
  }
}
