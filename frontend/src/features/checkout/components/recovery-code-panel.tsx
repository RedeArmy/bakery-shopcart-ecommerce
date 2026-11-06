import { useTranslation } from 'react-i18next';
import { errorMessage } from '../../../shared/api';
import { Button } from '../../../shared/ui/button';
import { useIssueRecoveryCode } from '../hooks/use-guest-checkout';

/** El código se escribe en dos mitades de cinco para que se copie y se dicte sin equivocarse. */
const grouped = (code: string): string => `${code.slice(0, 5)}-${code.slice(5)}`;

/**
 * Código con el que el invitado recupera su pedido desde otro dispositivo (con su correo). El servidor lo entrega una sola
 * vez y guarda solo su hash; un código nuevo reemplaza al anterior, por eso se pide con un botón y no solo al cargar.
 */
export function RecoveryCodePanel() {
  const { t } = useTranslation();
  const issue = useIssueRecoveryCode();
  return (
    <section
      aria-labelledby="checkout-recovery"
      className="space-y-3 rounded-card border border-stone-200 bg-white p-4"
    >
      <h2 id="checkout-recovery" className="font-display text-xl text-stone-900">
        {t('checkout.recovery.title')}
      </h2>
      <p className="text-sm text-stone-600">{t('checkout.recovery.text')}</p>
      {issue.data === undefined ? null : (
        <div className="space-y-1">
          <p className="text-xs font-medium uppercase tracking-widest text-stone-500">
            {t('checkout.recovery.yourCode')}
          </p>
          <output className="block select-all font-mono text-2xl tracking-widest text-stone-900">
            {grouped(issue.data)}
          </output>
        </div>
      )}
      {issue.isError ? (
        <p role="alert" className="text-sm text-red-700">
          {errorMessage(issue.error)}
        </p>
      ) : null}
      <Button
        variant="secondary"
        loading={issue.isPending}
        onClick={() => {
          issue.mutate();
        }}
      >
        {issue.data === undefined
          ? t('checkout.recovery.generate')
          : t('checkout.recovery.regenerate')}
      </Button>
    </section>
  );
}
