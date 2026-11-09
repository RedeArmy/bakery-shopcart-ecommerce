import { useSession } from '../../../shared/auth';
import { AdminDashboard } from './admin-dashboard';
import { OperatorDashboard } from './operator-dashboard';

/**
 * El panel de quien atiende la tienda. Cada rol ve el suyo: el administrador, las ventas y los reportes (RF-08); el operador, lo
 * que hay que atender ahora. La ruta ya está protegida para ambos; los reportes los vuelve a exigir el servidor.
 */
export function DashboardPage() {
  const { user } = useSession();
  return user?.role === 'Administrator' ? <AdminDashboard /> : <OperatorDashboard />;
}
