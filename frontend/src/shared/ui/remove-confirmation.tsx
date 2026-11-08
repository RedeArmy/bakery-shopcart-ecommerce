import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { errorMessage } from '../api/error-message';
import { Button } from './button';

/** Los tres momentos de una tarjeta de administración: verla, editarla o confirmar que se quita. */
export function useCardMode() {
  const [mode, setMode] = useState<'view' | 'edit' | 'remove'>('view');
  return {
    mode,
    edit: () => {
      setMode('edit');
    },
    remove: () => {
      setMode('remove');
    },
    close: () => {
      setMode('view');
    },
  };
}

interface Deactivation {
  isPending: boolean;
  error: unknown;
  mutate: (variables: undefined, options: { onSuccess: () => void }) => void;
}

/**
 * Confirmación de quitar algo en la administración: dice qué pasará, deja confirmar o conservar y muestra el error si el
 * servidor no lo permite. Los textos salen de `<prefix>.removeTitle`, `removeText`, `removeConfirm` y `removeKeep`; al
 * lograrse, la confirmación se cierra.
 */
export function RemoveConfirmation({
  prefix,
  deactivation,
  onClose,
}: Readonly<{ prefix: string; deactivation: Deactivation; onClose: () => void }>) {
  const { t } = useTranslation();
  const failed = deactivation.error !== null && deactivation.error !== undefined;
  return (
    <section
      aria-label={t(`${prefix}.removeTitle`)}
      className="space-y-3 rounded-card border border-red-200 bg-red-50 p-4"
    >
      <h4 className="text-lg text-red-900">{t(`${prefix}.removeTitle`)}</h4>
      <p className="text-sm text-red-900">{t(`${prefix}.removeText`)}</p>
      {failed ? (
        <p role="alert" className="text-sm text-red-900">
          {errorMessage(deactivation.error)}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-3">
        <Button
          loading={deactivation.isPending}
          onClick={() => {
            deactivation.mutate(undefined, { onSuccess: onClose });
          }}
        >
          {t(`${prefix}.removeConfirm`)}
        </Button>
        <Button variant="secondary" disabled={deactivation.isPending} onClick={onClose}>
          {t(`${prefix}.removeKeep`)}
        </Button>
      </div>
    </section>
  );
}
