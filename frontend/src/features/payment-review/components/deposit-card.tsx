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

/** El motivo con el que se rechaza el depósito: lo lee el cliente y puede enviar otro comprobante. */
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

/** Un dato del depósito con su nombre; no se dibuja si el servidor no lo trae. */
function Fact({ label, children }: Readonly<{ label: string; children: React.ReactNode }>) {
  return (
    <div>
      <dt className="text-stone-500">{label}</dt>
      <dd className="text-stone-900">{children}</dd>
    </div>
  );
}

/**
 * Lo que el cliente dijo que depositó, para compararlo con el banco. Avisa cuando el monto depositado no es el del pedido
 * (solo si todavía se puede resolver) y, en el historial, por qué se rechazó.
 */
function DepositFacts({ item, reviewable }: Readonly<{ item: DepositItem; reviewable: boolean }>) {
  const { t } = useTranslation();
  const deposited = item.depositedAmount ?? null;
  // Los dos montos llegan como texto decimal con dos cifras: la igualdad exacta es la misma que aplica el servidor
  const mismatch = deposited !== null && deposited !== item.amount;

  return (
    <>
      <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
        <Fact label={t('depositReview.orderAmount')}>
          <Price amount={item.amount} />
        </Fact>
        {deposited === null ? null : (
          <Fact label={t('depositReview.depositedAmount')}>
            <Price amount={deposited} />
          </Fact>
        )}
        {item.bankName === undefined ? null : (
          <Fact label={t('depositReview.bank')}>{item.bankName}</Fact>
        )}
        {item.referenceNumber ? (
          <Fact label={t('depositReview.reference')}>
            <span className="select-all font-mono">{item.referenceNumber}</span>
          </Fact>
        ) : null}
        {item.depositDate ? (
          <Fact label={t('depositReview.depositDate')}>{formatDateOnly(item.depositDate)}</Fact>
        ) : null}
      </dl>
      {mismatch && reviewable ? (
        <p role="note" className="rounded-card bg-amber-50 p-3 text-sm text-amber-900">
          {t('depositReview.mismatch')}
        </p>
      ) : null}
      {item.rejectionReason ? (
        <p className="text-sm text-stone-700">
          {t('depositReview.rejectedBecause', { reason: item.rejectionReason })}
        </p>
      ) : null}
    </>
  );
}

/** Abre el comprobante del pago en otra pestaña, con el error del servidor si no se pudo. */
function ProofButton({ idPayment, idProof }: Readonly<{ idPayment: number; idProof: number }>) {
  const { t } = useTranslation();
  const openProof = useOpenProof(idPayment, idProof);
  return (
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
  );
}

/** Las dos salidas de un depósito en revisión: aprobarlo o, con un motivo, rechazarlo. */
function ReviewActions({
  idPayment,
  onOutcome,
}: Readonly<{ idPayment: number; onOutcome: (outcome: string) => void }>) {
  const { t } = useTranslation();
  const approve = useApproveDeposit(idPayment);
  const [rejecting, setRejecting] = useState(false);

  if (rejecting) {
    return (
      <RejectForm
        idPayment={idPayment}
        onDone={onOutcome}
        onCancel={() => {
          setRejecting(false);
        }}
      />
    );
  }
  return (
    <>
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
      {approve.isError ? (
        <p role="alert" className="text-sm text-red-900">
          {errorMessage(approve.error)}
        </p>
      ) : null}
    </>
  );
}

/**
 * Un depósito de la cola: quién es, lo que dijo que depositó, el comprobante y las dos salidas. Solo el que está en revisión se
 * puede resolver; los demás son historial.
 */
export function DepositCard({
  item,
  onOutcome,
}: Readonly<{ item: DepositItem; onOutcome: (outcome: string) => void }>) {
  const { t } = useTranslation();
  const reviewable = item.statusName === 'UnderReview';

  return (
    <li className="space-y-4 rounded-card border border-stone-200 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-mono text-lg text-stone-900">{item.orderNumber}</p>
          <p className="text-sm text-stone-600">
            {item.customerName}
            {item.customerEmail ? ` · ${item.customerEmail}` : null}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {typeof item.ageHours === 'number' ? (
            <span className="text-sm text-stone-600">
              {t('depositReview.sent', { count: item.ageHours })}
            </span>
          ) : null}
          <Badge tone={TONES[item.statusName] ?? 'neutral'}>
            {t(`depositReview.statuses.${item.statusName}`)}
          </Badge>
        </div>
      </div>

      <DepositFacts item={item} reviewable={reviewable} />
      {typeof item.idPaymentProof === 'number' ? (
        <ProofButton idPayment={item.idPayment} idProof={item.idPaymentProof} />
      ) : null}
      {reviewable ? <ReviewActions idPayment={item.idPayment} onOutcome={onOutcome} /> : null}
    </li>
  );
}
