import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { errorMessage } from '../../../shared/api';
import { formatDateOnly } from '../../../shared/lib/date';
import { ErrorState, LoadingSkeleton } from '../../../shared/ui/states';
import type { Branch } from '../../branches/hooks/use-branches';
import type { PaymentMethodsView } from '../hooks/use-checkout';

/** Lo que vale la entrega a domicilio en la elección; el resto son identificadores de sucursal. */
export const DELIVERY_CHOICE = 'delivery';

// Con más sucursales que estas, el resto queda detrás de «Ver las N sucursales»
const VISIBLE_BRANCHES = 3;

const MODE_BASE =
  'flex min-h-14 cursor-pointer flex-col justify-center rounded-full px-5 py-2 text-left transition peer-focus-visible:ring-2 peer-focus-visible:ring-accent peer-focus-visible:ring-offset-2 peer-disabled:cursor-not-allowed peer-disabled:opacity-50';

/** Uno de los dos botones: es un radio de verdad (teclado y lector de pantalla) con aspecto de botón. */
function ModeOption({
  checked,
  disabled = false,
  title,
  hint,
  onSelect,
}: Readonly<{
  checked: boolean;
  disabled?: boolean;
  title: string;
  hint: string;
  onSelect: () => void;
}>) {
  return (
    <label className="relative flex-1">
      <input
        type="radio"
        name="checkout-mode"
        className="peer sr-only"
        checked={checked}
        disabled={disabled}
        onChange={onSelect}
      />
      <span
        className={`${MODE_BASE} ${checked ? 'bg-stone-900 text-white' : 'text-stone-800 hover:bg-stone-100'}`}
      >
        <span className="font-medium">{title}</span>
        <span className={`text-sm ${checked ? 'text-stone-200' : 'text-stone-600'}`}>{hint}</span>
      </span>
    </label>
  );
}

/** Una sucursal para recoger: dónde está y cuándo atiende. Nunca pide una dirección de entrega. */
function BranchCard({
  branch,
  checked,
  onSelect,
}: Readonly<{ branch: Branch; checked: boolean; onSelect: () => void }>) {
  const { t } = useTranslation();
  return (
    <li>
      <label
        className={`flex cursor-pointer gap-3 border-b border-stone-200 p-4 last:border-b-0 ${checked ? 'bg-amber-50' : 'bg-white'}`}
      >
        <input
          type="radio"
          name="checkout-branch"
          className="mt-1 size-4 accent-accent"
          checked={checked}
          onChange={onSelect}
        />
        <span className="space-y-1 text-sm text-stone-700">
          <span className="block text-base font-medium text-stone-900">{branch.name}</span>
          <span className="block">
            {branch.line1}, {branch.municipality}, {branch.department}
          </span>
          {branch.phone ? (
            <span className="block">{t('checkout.fulfilment.phone', { phone: branch.phone })}</span>
          ) : null}
          {branch.openingHours ? (
            <span className="block text-stone-600">{branch.openingHours}</span>
          ) : null}
        </span>
      </label>
    </li>
  );
}

/** La lista de sucursales con su elección; a partir de la cuarta se despliega a petición. */
function BranchList({
  branches,
  choice,
  onChoice,
}: Readonly<{ branches: readonly Branch[]; choice: string; onChoice: (choice: string) => void }>) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  // La elegida siempre se ve, aunque esté más allá de las primeras
  const visible = expanded
    ? branches
    : branches.filter(
        (branch, index) => index < VISIBLE_BRANCHES || String(branch.idBranch) === choice,
      );
  return (
    <div className="space-y-3">
      <fieldset className="space-y-2">
        <legend className="text-lg text-stone-900">{t('checkout.fulfilment.branches')}</legend>
        <ul className="overflow-hidden rounded-card border border-stone-200">
          {visible.map((branch) => (
            <BranchCard
              key={branch.idBranch}
              branch={branch}
              checked={String(branch.idBranch) === choice}
              onSelect={() => {
                onChoice(String(branch.idBranch));
              }}
            />
          ))}
        </ul>
      </fieldset>
      {branches.length > VISIBLE_BRANCHES ? (
        <button
          type="button"
          aria-expanded={expanded}
          onClick={() => {
            setExpanded((current) => !current);
          }}
          className="min-h-11 rounded-full border border-stone-300 bg-white px-5 text-sm font-medium text-stone-800 hover:bg-stone-100"
        >
          {expanded
            ? t('checkout.fulfilment.showLess')
            : t('checkout.fulfilment.showAll', { count: branches.length })}
        </button>
      ) : null}
    </div>
  );
}

/**
 * Cómo recibe el cliente su pedido: dos botones (entrega a domicilio o recoger en sucursal) y, al recoger, las sucursales
 * activas para elegir. La fecha no se elige: la define el sistema y aquí se muestra como un estimado que puede variar unos días.
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
  const pickup = choice !== DELIVERY_CHOICE;
  const first = branches[0];
  const estimate = view?.estimatedDeliveryDate;
  const failed = branchesError !== null && branchesError !== undefined;

  return (
    <section aria-labelledby="checkout-fulfilment" className="space-y-4">
      <h2 id="checkout-fulfilment" className="text-2xl text-stone-900">
        {t('checkout.fulfilment.title')}
      </h2>
      {branchesLoading ? <LoadingSkeleton count={1} /> : null}
      {failed ? <ErrorState error={branchesError} /> : null}
      <div
        role="radiogroup"
        aria-label={t('checkout.fulfilment.mode')}
        className="flex max-w-xl flex-wrap gap-1 rounded-full border border-stone-300 bg-white p-1"
      >
        <ModeOption
          checked={!pickup}
          title={t('checkout.fulfilment.deliveryTitle')}
          hint={t('checkout.fulfilment.deliveryHint')}
          onSelect={() => {
            onChoice(DELIVERY_CHOICE);
          }}
        />
        <ModeOption
          checked={pickup}
          disabled={first === undefined}
          title={t('checkout.fulfilment.pickupTitle')}
          hint={t('checkout.fulfilment.pickupHint')}
          onSelect={() => {
            if (first !== undefined) onChoice(String(first.idBranch));
          }}
        />
      </div>
      {!branchesLoading && !failed && branches.length === 0 ? (
        <p className="text-sm text-stone-600">{t('checkout.fulfilment.pickupNone')}</p>
      ) : null}
      {pickup ? <BranchList branches={branches} choice={choice} onChoice={onChoice} /> : null}
      {viewLoading && view === undefined ? <LoadingSkeleton count={1} /> : null}
      {estimate === undefined ? null : (
        <p className="text-sm text-stone-600">
          {pickup
            ? t('checkout.fulfilment.estimatePickup', { date: formatDateOnly(estimate) })
            : t('checkout.fulfilment.estimateDelivery', { date: formatDateOnly(estimate) })}{' '}
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
