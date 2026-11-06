import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useSession } from '../shared/auth';
import type { Role } from '../shared/auth';
import { LoadingSkeleton } from '../shared/ui/states';
import { ForbiddenPage } from './pages/forbidden-page';
import { routeAccess } from './route-access';

/** Protege un grupo de rutas: espera la sesión, manda a iniciar sesión (recordando adónde iba) o niega por rol. */
export function ProtectedRoute({ roles }: Readonly<{ roles?: readonly Role[] }>) {
  const session = useSession();
  const location = useLocation();
  const access = routeAccess(session, roles);

  if (access === 'wait') return <LoadingSkeleton />;
  if (access === 'login') {
    return (
      <Navigate to="/login" replace state={{ from: `${location.pathname}${location.search}` }} />
    );
  }
  if (access === 'forbidden') return <ForbiddenPage />;
  return <Outlet />;
}
