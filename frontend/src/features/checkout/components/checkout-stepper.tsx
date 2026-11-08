import { useTranslation } from 'react-i18next';

const STEPS = ['delivery', 'payment', 'confirmation'] as const;

type StepState = 'done' | 'current' | 'todo';

const stateOf = (number: number, current: number): StepState => {
  if (number < current) return 'done';
  return number === current ? 'current' : 'todo';
};

const STYLES: Record<StepState, string> = {
  done: 'text-stone-600',
  current: 'font-medium text-stone-900',
  todo: 'text-stone-500',
};

/** Los tres pasos de la compra y en cuál va el cliente. Solo informa: cada paso se resuelve en su propia pantalla. */
export function CheckoutStepper({ current }: Readonly<{ current: 1 | 2 | 3 }>) {
  const { t } = useTranslation();
  return (
    <nav aria-label={t('checkout.steps.label')}>
      <ol className="flex flex-wrap items-center gap-2 text-sm">
        {STEPS.map((step, index) => {
          const state = stateOf(index + 1, current);
          return (
            <li key={step} className="flex items-center gap-2">
              <span
                aria-current={state === 'current' ? 'step' : undefined}
                className={STYLES[state]}
              >
                {t(`checkout.steps.${step}`)}
              </span>
              {index < STEPS.length - 1 ? (
                <span aria-hidden="true" className="text-stone-400">
                  ›
                </span>
              ) : null}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
