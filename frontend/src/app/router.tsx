import { createBrowserRouter } from 'react-router-dom';
import { HomePage } from '../features/catalogue/pages/home-page';
import { Layout } from './layout';

// Las rutas protegidas por rol (<ProtectedRoute roles>) se añaden en la Etapa 7
export const router = createBrowserRouter([
  {
    path: '/',
    element: <Layout />,
    children: [{ index: true, element: <HomePage /> }],
  },
]);
