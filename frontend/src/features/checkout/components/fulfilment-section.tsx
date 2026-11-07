import { useTranslation } from 'react-i18next';
import { errorMessage } from '../../../shared/api';
import { formatDateOnly } from '../../../shared/lib/date';
import { SelectField } from '../../../shared/ui/fields';
import { ErrorState, LoadingSkeleton } from '../../../shared/ui/states';
import type { Branch } from '../../branches/hooks/use-branches';
import type { PaymentMethodsView } from '../hooks/use-checkout';

/** Lo que vale la opción de entrega a domicilio en el desplegable; el resto son identificadores de sucursal. */
export const DELIVERY_CHOICE = 'delivery';

/** Los datos de la sucursal elegida para recoger: dónde está y cuándo atiende. Sin dirección de entrega. */
function BranchDetails({ branch }: Readonly<{ branch: Branch }>) {
  const { t } = useTranslation();
  return (
    <div className="space-y-1 rounded-card border border-stone-200 bg-white p-4 text-sm text-stone-700">
      <p className="font-medium text-stone-900">{branch.name}</p>
      <p>
        {branch.line1}
        <br />
        {branch.municipality}, {branch.department}
      </p>
      {branch.phone ? <p>{t('checkout.fulfilment.phone', { phone: branch.phone })}</p> : null}
      {branch.openingHours ? <p className="text-stone-600">{branch.openingHours}</p> : null}
    </div>
  );
}

/**
 * Cómo recibe el cliente su pedido: un desplegable con la entrega a domicilio y las sucursales activas para recoger. La
 * fecha no se elige: la define el sistema y aquí se muestra como un estimado que puede variar unos días.
 */
export function FulfilmentSection({
  choice,
  onChoice,
  branches,
  branchesLoading,
  branchesError,
  view,
  viewLoading,
  viewError,
}: Readonly<{
  choice: string;
  onChoice: (choice: string) => void;
  branches: readonly Branch[];
  branchesLoading: boolean;
  branchesError: unknown;
  view: PaymentMethodsView | undefined;
  viewLoading: boolean;
  viewError: unknown;
}>) {
  const { t } = useTranslation();
  const picked = branches.find((branch) => String(branch.idBranch) === choice);
  const estimate = view?.estimatedDeliveryDate;

  return (
    <section aria-labelledby="checkout-fulfilment" className="space-y-3">
      <h2 id="checkout-fulfilment" className="text-2xl text-stone-900">
        {t('checkout.fulfilment.title')}
      </h2>
      {branchesLoading ? <LoadingSkeleton count={1} /> : null}
      {branchesError === null || branchesError === undefined ? null : (
        <ErrorState error={branchesError} />
      )}
      <div className="max-w-md">
        <SelectField
          label={t('checkout.fulfilment.label')}
          value={choice}
          onChange={(event) => {
            onChoice(event.target.value);
          }}
        >
          <option value={DELIVERY_CHOICE}>{t('checkout.fulfilment.delivery')}</option>
          {branches.length === 0 ? null : (
            <optgroup label={t('checkout.fulfilment.pickupGroup')}>
              {branches.map((branch) => (
                <option key={branch.idBranch} value={String(branch.idBranch)}>
                  {t('checkout.fulfilment.pickupAt', { name: branch.name })}
                </option>
              ))}
            </optgroup>
          )}
        </SelectField>
      </div>
      {picked === undefined ? null : <BranchDetails branch={picked} />}
      {viewLoading && view === undefined ? <LoadingSkeleton count={1} /> : null}
      {estimate === undefined ? null : (
        <p className="text-sm text-stone-600">
          {picked === undefined
            ? t('checkout.fulfilment.estimateDelivery', { date: formatDateOnly(estimate) })
            : t('checkout.fulfilment.estimatePickup', { date: formatDateOnly(estimate) })}{' '}
          {t('checkout.fulfilment.estimateNote')}
        </p>
      )}
      {viewError === null || viewError === undefined ? null : (
        <p role="alert" className="text-sm text-red-700">
          {errorMessage(viewError)}
        </p>
      )}
    </section>
  );
}
