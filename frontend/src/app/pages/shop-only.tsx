import { Navigate, Outlet } from 'react-router-dom';
import { isStaffRole, landingPath, useSession } from '../../shared/auth';

/**
 * Las pantallas de comprar (el catálogo, el carrito y el pago) son del visitante y del cliente. El personal no compra, así que
 * si llega a una por una dirección escrita a mano o un enlace viejo, vuelve a su panel.
 */
export function ShopOnly() {
  const { user } = useSession();
  if (isStaffRole(user?.role)) return <Navigate to={landingPath(user?.role)} replace />;
  return <Outlet />;
}
