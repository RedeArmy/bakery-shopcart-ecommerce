import { useEffect, useId, useRef } from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from './button';

/**
 * Una ventana emergente modal con el elemento nativo `<dialog>`: el navegador pone el fondo, atrapa el foco y cierra con Escape.
 * Se muestra mientras existe; quien la usa decide cuándo quitarla (`onClose`). En un entorno sin `showModal` (las pruebas) se
 * abre sin modalidad para que el contenido siga a la vista.
 */
export function Modal({
  title,
  onClose,
  children,
}: Readonly<{ title: string; onClose: () => void; children: ReactNode }>) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (dialog === null || dialog.open) return;
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
  }, []);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={(event) => {
        // Escape: se cierra por el padre, que es quien conoce el estado
        event.preventDefault();
        onClose();
      }}
      className="m-auto max-h-[92dvh] w-[calc(100%-2rem)] max-w-3xl overflow-y-auto rounded-card border border-stone-200 bg-white p-0 shadow-xl backdrop:bg-stone-900/50"
    >
      <div className="space-y-4 p-5">
        <div className="flex items-start justify-between gap-4">
          <h2 id={titleId} className="text-2xl text-stone-900">
            {title}
          </h2>
          <Button variant="ghost" onClick={onClose}>
            {t('common.close')}
          </Button>
        </div>
        {children}
      </div>
    </dialog>
  );
}
