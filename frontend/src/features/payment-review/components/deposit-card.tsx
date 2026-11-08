import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { errorMessage } from '../../../shared/api';
import { formatDateOnly } from '../../../shared/lib/date';
import { Badge } from '../../../shared/ui/badge';
import { Button } from '../../../shared/ui/button';
import { TextField } from '../../../shared/ui/fields';
import { Price } from '../../../shared/ui/price';
import { fieldError } from '../../auth/components/auth-layout';
import {
  useApproveDeposit,
  useOpenProof,
  useRejectDeposit,
  type DepositItem,
} from '../hooks/use-payment-review';
import { rejectSchema, type RejectValues } from '../model/review';

const TONES: Partial<Record<string, 'warning' | 'neutral' | 'success' | 'danger'>> = {
  UnderReview: 'warning',
  Pending: 'neutral',
  Approved: 'success',
  Rejected: 'danger',
};

/** El motivo del rechazo: lo lee el cliente y puede enviar otro comprobante. */
function RejectForm({
  idPayment,
  onDone,
  onCancel,
}: Readonly<{ idPayment: number; onDone: (outcome: string) => void; onCancel: () => void }>) {
  const { t } = useTranslation();
  const reject = useRejectDeposit(idPayment);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<RejectValues>({
    resolver: zodResolver(rejectSchema),
    defaultValues: { reason: '' },
  });

  const submit = handleSubmit((values) => {
    reject.mutate(values.reason, { onSuccess: onDone });
  });

  return (
    <form
      onSubmit={(event) => {
        void submit(event);
      }}
      noValidate
      className="space-y-3 rounded-card border border-red-200 bg-red-50 p-4"
    >
      <TextField
        label={t('depositReview.rejectReason')}
        hint={t('depositReview.rejectReasonHint')}
        maxLength={250}
        error={fieldError(t, errors.reason?.message)}
        {...register('reason')}
      />
      {reject.isError ? (
        <p role="alert" className="text-sm text-red-900">
          {errorMessage(reject.error)}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-3">
        <Button type="submit" loading={reject.isPending}>
          {t('depositReview.rejectConfirm')}
        </Button>
        <Button variant="secondary" disabled={reject.isPending} onClick={onCancel}>
          {t('depositReview.cancel')}
        </Button>
      </div>
    </form>
  );
}

/**
 * Un depósito de la cola: lo que el cliente dijo que depositó, para compararlo con el banco, el comprobante y las dos salidas
 * (aprobar o rechazar con motivo). Solo el que está en revisión se puede resolver; los demás son historial.
 */
export function DepositCard({
  item,
  onOutcome,
}: Readonly<{ item: DepositItem; onOutcome: (outcome: string) => void }>) {
  const { t } = useTranslation();
  const approve = useApproveDeposit(item.idPayment);
  const openProof = useOpenProof(item.idPayment, item.idPaymentProof ?? 0);
  const [rejecting, setRejecting] = useState(false);

  const reviewable = item.statusName === 'UnderReview';
  const tone = TONES[item.statusName] ?? 'neutral';
  // Los dos montos llegan como texto decimal con dos cifras: la igualdad exacta es la misma que aplica el servidor
  const deposited = item.depositedAmount ?? null;
  const mismatch = deposited !== null && deposited !== item.amount;

  return (
    <li className="space-y-4 rounded-card border border-stone-200 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-mono text-lg text-stone-900">{item.orderNumber}</p>
          <p className="text-sm text-stone-600">
            {item.customerName}
            {item.customerEmail === undefined ? null : ` · ${item.customerEmail}`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {item.ageHours === undefined || item.ageHours === null ? null : (
            <span className="text-sm text-stone-600">
              {t('depositReview.sent', { count: item.ageHours })}
            </span>
          )}
          <Badge tone={tone}>{t(`depositReview.statuses.${item.statusName}`)}</Badge>
        </div>
      </div>

      <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
        <div>
          <dt className="text-stone-500">{t('depositReview.orderAmount')}</dt>
          <dd className="text-stone-900">
            <Price amount={item.amount} />
          </dd>
        </div>
        {deposited === null ? null : (
          <div>
            <dt className="text-stone-500">{t('depositReview.depositedAmount')}</dt>
            <dd className="text-stone-900">
              <Price amount={deposited} />
            </dd>
          </div>
        )}
        {item.bankName === undefined ? null : (
          <div>
            <dt className="text-stone-500">{t('depositReview.bank')}</dt>
            <dd className="text-stone-900">{item.bankName}</dd>
          </div>
        )}
        {item.referenceNumber === undefined || item.referenceNumber === null ? null : (
          <div>
            <dt className="text-stone-500">{t('depositReview.reference')}</dt>
            <dd className="select-all font-mono text-stone-900">{item.referenceNumber}</dd>
          </div>
        )}
        {item.depositDate === undefined || item.depositDate === null ? null : (
          <div>
            <dt className="text-stone-500">{t('depositReview.depositDate')}</dt>
            <dd className="text-stone-900">{formatDateOnly(item.depositDate)}</dd>
          </div>
        )}
      </dl>

      {mismatch && reviewable ? (
        <p role="note" className="rounded-card bg-amber-50 p-3 text-sm text-amber-900">
          {t('depositReview.mismatch')}
        </p>
      ) : null}
      {item.rejectionReason === undefined || item.rejectionReason === null ? null : (
        <p className="text-sm text-stone-700">
          {t('depositReview.rejectedBecause', { reason: item.rejectionReason })}
        </p>
      )}

      {item.idPaymentProof === undefined || item.idPaymentProof === null ? null : (
        <div className="space-y-2">
          <Button
            variant="secondary"
            loading={openProof.isPending}
            onClick={() => {
              openProof.mutate();
            }}
          >
            {t('depositReview.proof')}
          </Button>
          {openProof.isError ? (
            <p role="alert" className="text-sm text-red-900">
              {errorMessage(openProof.error)}
            </p>
          ) : null}
        </div>
      )}

      {reviewable && !rejecting ? (
        <div className="flex flex-wrap gap-3">
          <Button
            loading={approve.isPending}
            onClick={() => {
              approve.mutate(undefined, { onSuccess: onOutcome });
            }}
          >
            {t('depositReview.approve')}
          </Button>
          <Button
            variant="ghost"
            disabled={approve.isPending}
            onClick={() => {
              setRejecting(true);
            }}
          >
            {t('depositReview.reject')}
          </Button>
        </div>
      ) : null}
      {approve.isError ? (
        <p role="alert" className="text-sm text-red-900">
          {errorMessage(approve.error)}
        </p>
      ) : null}
      {reviewable && rejecting ? (
        <RejectForm
          idPayment={item.idPayment}
          onDone={onOutcome}
          onCancel={() => {
            setRejecting(false);
          }}
        />
      ) : null}
    </li>
  );
}
