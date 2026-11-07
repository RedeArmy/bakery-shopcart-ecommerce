import { useState } from 'react';
import type { ReactNode } from 'react';
import { ChevronDownIcon } from './icons';

/**
 * Sección desplegable. El título es un botón dentro de su encabezado (`aria-expanded` y `aria-controls`), y el resumen de
 * lo elegido queda a la vista aunque esté cerrada. El contenido se conserva montado mientras está cerrado (`hidden`), así lo
 * que se escribió no se pierde al plegarla.
 */
export function Disclosure({
  id,
  title,
  summary,
  defaultOpen = false,
  children,
}: Readonly<{
  id: string;
  title: string;
  /** Lo que ya se eligió o una pista; se ve con la sección cerrada */
  summary?: string | undefined;
  defaultOpen?: boolean;
  children: ReactNode;
}>) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="rounded-card border border-stone-200 bg-white">
      <div className="px-4 py-3">
        <h2 className="text-xl text-stone-900">
          <button
            type="button"
            id={`${id}-button`}
            aria-expanded={open}
            aria-controls={`${id}-panel`}
            onClick={() => {
              setOpen((current) => !current);
            }}
            className="flex min-h-11 w-full items-center justify-between gap-4 text-left font-display"
          >
            <span>{title}</span>
            <ChevronDownIcon
              className={`shrink-0 stroke-current transition ${open ? 'rotate-180' : ''}`}
            />
          </button>
        </h2>
        {summary === undefined || summary === '' ? null : (
          <p className="text-sm text-stone-600">{summary}</p>
        )}
      </div>
      <div
        id={`${id}-panel`}
        aria-labelledby={`${id}-button`}
        hidden={!open}
        className="space-y-4 border-t border-stone-200 p-4"
      >
        {children}
      </div>
    </section>
  );
}
