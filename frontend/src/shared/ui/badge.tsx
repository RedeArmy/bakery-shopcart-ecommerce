import type { ReactNode } from 'react';

type Tone = 'neutral' | 'accent' | 'warning' | 'danger' | 'success';

// El color solo refuerza el significado; el texto de la insignia siempre lo dice con palabras
const TONES: Record<Tone, string> = {
  neutral: 'bg-stone-100 text-stone-700',
  accent: 'bg-accent-soft text-accent-strong',
  warning: 'bg-amber-100 text-amber-900',
  danger: 'bg-red-100 text-red-900',
  success: 'bg-emerald-100 text-emerald-900',
};

export function Badge({
  tone = 'neutral',
  children,
}: Readonly<{ tone?: Tone; children: ReactNode }>) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${TONES[tone]}`}
    >
      {children}
    </span>
  );
}
