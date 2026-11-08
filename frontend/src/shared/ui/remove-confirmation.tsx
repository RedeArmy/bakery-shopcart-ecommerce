import { errorMessage } from '../api/error-message';
import { Button } from './button';

/**
 * Confirmación de quitar algo en la administración: dice qué pasará, deja confirmar o conservar y muestra el error si el
 * servidor no lo permite. Quien la usa decide qué hace confirmar y cuándo se cierra.
 */
export function RemoveConfirmation({
  title,
  text,
  confirmLabel,
  keepLabel,
  pending,
  error,
  onConfirm,
  onKeep,
}: Readonly<{
  title: string;
  text: string;
  confirmLabel: string;
  keepLabel: string;
  pending: boolean;
  error: unknown;
  onConfirm: () => void;
  onKeep: () => void;
}>) {
  return (
    <section
      aria-label={title}
      className="space-y-3 rounded-card border border-red-200 bg-red-50 p-4"
    >
      <h4 className="text-lg text-red-900">{title}</h4>
      <p className="text-sm text-red-900">{text}</p>
      {error === null || error === undefined ? null : (
        <p role="alert" className="text-sm text-red-900">
          {errorMessage(error)}
        </p>
      )}
      <div className="flex flex-wrap gap-3">
        <Button loading={pending} onClick={onConfirm}>
          {confirmLabel}
        </Button>
        <Button variant="secondary" disabled={pending} onClick={onKeep}>
          {keepLabel}
        </Button>
      </div>
    </section>
  );
}
