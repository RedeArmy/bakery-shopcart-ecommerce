import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useState } from 'react';
import type { ChangeEvent } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { errorMessage } from '../../../shared/api';
import { todayText } from '../../../shared/lib/date';
import { Button } from '../../../shared/ui/button';
import { TextField } from '../../../shared/ui/fields';
import { fieldError } from '../../auth/components/auth-layout';
import { useUploadProof } from '../hooks/use-payment';
import { proofFileProblem, proofSchema } from '../model/schemas';
import type { ProofValues } from '../model/schemas';

/**
 * Comprobante del depósito: la referencia del banco, la fecha, el monto depositado y el archivo (foto o PDF). El tipo y el
 * tamaño se avisan antes de enviar solo por comodidad; el servidor revisa el archivo de verdad. El monto viene sugerido con
 * el del pedido y el cliente lo confirma: si no coincide, el servidor lo rechaza.
 */
export function ProofForm({ idOrder, amount }: Readonly<{ idOrder: number; amount: string }>) {
  const { t } = useTranslation();
  const upload = useUploadProof(idOrder);
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ProofValues>({
    resolver: zodResolver(proofSchema),
    defaultValues: { referenceNumber: '', depositDate: todayText(), depositedAmount: amount },
  });

  // La vista previa solo existe para imágenes y se libera al cambiar de archivo o salir
  useEffect(() => {
    if (file === null || !file.type.startsWith('image/')) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => {
      URL.revokeObjectURL(url);
    };
  }, [file]);

  const choose = (event: ChangeEvent<HTMLInputElement>): void => {
    const chosen = event.target.files?.[0] ?? null;
    setFile(chosen);
    setFileError(chosen === null ? null : proofFileProblem(chosen));
  };

  const submit = handleSubmit((values) => {
    const problem = proofFileProblem(file);
    setFileError(problem);
    if (problem !== null || file === null) return;
    upload.mutate({ file, ...values });
  });

  return (
    <section
      aria-labelledby="proof-form"
      className="space-y-4 rounded-card border border-stone-200 bg-white p-5"
    >
      <div>
        <h2 id="proof-form" className="text-2xl text-stone-900">
          {t('payment.proof.title')}
        </h2>
        <p className="mt-1 text-sm text-stone-600">{t('payment.proof.intro')}</p>
      </div>
      <form onSubmit={(event) => void submit(event)} noValidate className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-3">
          <TextField
            label={t('payment.proof.reference')}
            error={fieldError(t, errors.referenceNumber?.message)}
            {...register('referenceNumber')}
          />
          <TextField
            label={t('payment.proof.date')}
            type="date"
            error={fieldError(t, errors.depositDate?.message)}
            {...register('depositDate')}
          />
          <TextField
            label={t('payment.proof.amount')}
            inputMode="decimal"
            error={fieldError(t, errors.depositedAmount?.message)}
            {...register('depositedAmount')}
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="proof-file" className="block text-sm font-medium text-stone-800">
            {t('payment.proof.file')}
          </label>
          <input
            id="proof-file"
            type="file"
            accept="image/jpeg,image/png,application/pdf"
            onChange={choose}
            aria-invalid={fileError === null ? undefined : true}
            className="block w-full text-sm text-stone-700 file:mr-4 file:min-h-11 file:rounded-control file:border file:border-stone-300 file:bg-white file:px-4 file:text-sm file:text-stone-900"
          />
          <p className="text-sm text-stone-600">{t('payment.proof.fileHint')}</p>
          {fileError === null ? null : (
            <p role="alert" className="text-sm text-red-700">
              {t(fileError)}
            </p>
          )}
          {preview === null ? null : (
            <img
              src={preview}
              alt={t('payment.proof.previewAlt')}
              className="mt-2 max-h-56 rounded-control border border-stone-200"
            />
          )}
        </div>
        {upload.isError ? (
          <p role="alert" className="rounded-control bg-red-50 px-4 py-3 text-sm text-red-900">
            {errorMessage(upload.error)}
          </p>
        ) : null}
        <Button type="submit" loading={upload.isPending}>
          {t('payment.proof.send')}
        </Button>
      </form>
    </section>
  );
}
