import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { esGT } from './resources/es-GT';

// La tienda está en español de Guatemala; las claves son inglés británico (ADR-0024)
void i18n.use(initReactI18next).init({
  resources: { 'es-GT': { translation: esGT } },
  lng: 'es-GT',
  fallbackLng: 'es-GT',
  interpolation: { escapeValue: false },
});

export default i18n;
