import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { errorMessage } from '../../../shared/api';
import type { components } from '../../../shared/api/generated/schema';
import { formatDateTime } from '../../../shared/lib/date';
import { formatMoney } from '../../../shared/lib/money/money';
import { Badge } from '../../../shared/ui/badge';
import { Button } from '../../../shared/ui/button';
import { TextField } from '../../../shared/ui/fields';
import { fieldError } from '../../auth/components/auth-layout';
import { useMarkRefund } from '../hooks/use-refunds';
import { referenceSchema } from '../model/refunds';
import type { ReferenceValues } from '../model/refunds';

type Refund = components['schemas']['Refund'];

const TONES = { Pending: 'warning', Processed: 'success', Failed: 'danger' } as const;

/** Pide la referencia de la transferencia con la que se devolvió el dinero y marca el reembolso como procesado. */
function ProcessForm({ refund, onClose }: Readonly<{ refund: Refund; onClose: () => void }>) {
  const { t } = useTranslation();
  const mark = useMarkRefund(refund.idRefund);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ReferenceValues>({
    resolver: zodResolver(referenceSchema),
    defaultValues: { reference: '' },
  });

  return (
    <form
      onSubmit={(event) =>
        void handleSubmit((values) => {
          mark.mutate(
            { status: 'Processed', externalReference: values.reference },
            { onSuccess: onClose },
          );
        })(event)
      }
      noValidate
      aria-label={t('refunds.processTitle')}
      className="space-y-3 rounded-card border border-stone-200 bg-stone-50 p-4"
    >
      <p className="text-sm text-stone-700">{t('refunds.processText')}</p>
      <TextField
        label={t('refunds.reference')}
        hint={t('refunds.referenceHint')}
        error={fieldError(t, errors.reference?.message)}
        {...register('reference')}
      />
      {mark.isError ? (
        <p role="alert" className="rounded-control bg-red-50 px-4 py-3 text-sm text-red-900">
          {errorMessage(mark.error)}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-3">
        <Button type="submit" loading={mark.isPending}>
          {t('refunds.processConfirm')}
        </Button>
        <Button variant="ghost" onClick={onClose}>
          {t('common.cancel')}
        </Button>
      </div>
    </form>
  );
}

/** Confirma que el reembolso no se pudo hacer: queda como fallido y se puede procesar después, cuando se logre. */
function FailConfirmation({ refund, onClose }: Readonly<{ refund: Refund; onClose: () => void }>) {
  const { t } = useTranslation();
  const mark = useMarkRefund(refund.idRefund);
  return (
    <section
      aria-label={t('refunds.failTitle')}
      className="space-y-3 rounded-card border border-red-200 bg-red-50 p-4"
    >
      <h4 className="text-lg text-red-900">{t('refunds.failTitle')}</h4>
      <p className="text-sm text-red-900">{t('refunds.failText')}</p>
      {mark.isError ? (
        <p role="alert" className="text-sm text-red-900">
          {errorMessage(mark.error)}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-3">
        <Button
          loading={mark.isPending}
          onClick={() => {
            mark.mutate({ status: 'Failed' }, { onSuccess: onClose });
          }}
        >
          {t('refunds.failConfirm')}
        </Button>
        <Button variant="ghost" onClick={onClose}>
          {t('refunds.failKeep')}
        </Button>
      </div>
    </section>
  );
}

/**
 * Un reembolso: de qué pedido es, cuánto hay que devolver y por qué, cuándo se pidió y en qué estado está. El dinero se devuelve
 * por fuera (una transferencia): aquí se marca como procesado con la referencia de esa transferencia, o como fallido si no se
 * pudo. Uno procesado ya no cambia; uno fallido todavía se puede procesar.
 */
export function RefundCard({ refund }: Readonly<{ refund: Refund }>) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<'view' | 'process' | 'fail'>('view');
  const close = () => {
    setMode('view');
  };
  const open = refund.status !== 'Processed';

  return (
    <li className="space-y-3 rounded-card border border-stone-200 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-lg text-stone-900">{formatMoney(refund.amountText)}</p>
          {refund.idOrder === undefined ? null : (
            <Link
              to={`/admin/orders/${String(refund.idOrder)}`}
              className="text-accent-strong underline"
            >
              {t('refunds.order', { number: refund.orderNumber ?? refund.idOrder })}
            </Link>
          )}
        </div>
        <Badge tone={TONES[refund.status]}>{t(`refunds.status.${refund.status}`)}</Badge>
      </div>
      {refund.reason ? <p className="text-sm text-stone-700">{refund.reason}</p> : null}
      <p className="text-sm text-stone-600">
        {refund.createdAt === undefined
          ? null
          : t('refunds.requested', { date: formatDateTime(refund.createdAt) })}
        {refund.processedAt
          ? ` · ${t('refunds.processedAt', { date: formatDateTime(refund.processedAt) })}`
          : null}
        {refund.externalReference
          ? ` · ${t('refunds.referenceIs', { reference: refund.externalReference })}`
          : null}
      </p>

      {open && mode === 'view' ? (
        <div className="flex flex-wrap gap-3">
          <Button
            onClick={() => {
              setMode('process');
            }}
          >
            {t('refunds.process')}
          </Button>
          {refund.status === 'Pending' ? (
            <Button
              variant="ghost"
              onClick={() => {
                setMode('fail');
              }}
            >
              {t('refunds.fail')}
            </Button>
          ) : null}
        </div>
      ) : null}
      {mode === 'process' ? <ProcessForm refund={refund} onClose={close} /> : null}
      {mode === 'fail' ? <FailConfirmation refund={refund} onClose={close} /> : null}
    </li>
  );
}
