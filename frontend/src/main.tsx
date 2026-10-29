import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { AppProviders } from './app/providers';
import './index.css';
import './shared/i18n';

const container = document.getElementById('root');
if (container === null) throw new Error('Root element #root not found');

createRoot(container).render(
  <StrictMode>
    <AppProviders />
  </StrictMode>,
);
