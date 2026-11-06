import { configure } from '@testing-library/react';

// Las pantallas se cargan con import() diferido: la primera vez de cada archivo cuesta más que el segundo de espera por defecto
configure({ asyncUtilTimeout: 5000 });
