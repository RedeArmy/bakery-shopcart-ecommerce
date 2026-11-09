import { Navigate } from 'react-router-dom';
import { HomePage } from '../../features/catalogue/pages/home-page';
import { isStaffRole, landingPath, useSession } from '../../shared/auth';

/**
 * El inicio: la tienda para el visitante y el cliente. El personal no compra, así que entrar al inicio (el logo, una dirección
 * escrita a mano) lo lleva a su panel.
 */
export function HomeRoute() {
  const { user } = useSession();
  if (isStaffRole(user?.role)) return <Navigate to={landingPath(user?.role)} replace />;
  return <HomePage />;
}
