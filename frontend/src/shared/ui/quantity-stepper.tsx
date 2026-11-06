import { useTranslation } from 'react-i18next';

const BUTTON =
  'grid size-11 place-items-center text-lg text-stone-800 hover:bg-stone-100 disabled:cursor-not-allowed disabled:text-stone-400 disabled:hover:bg-transparent';

/** Selector de cantidad con botones de menos y más; no permite salir del rango, el servidor sigue siendo quien decide. */
export function QuantityStepper({
  label,
  value,
  min = 1,
  max,
  disabled = false,
  onChange,
}: Readonly<{
  label: string;
  value: number;
  min?: number;
  max: number;
  disabled?: boolean;
  onChange: (value: number) => void;
}>) {
  const { t } = useTranslation();
  return (
    <fieldset className="m-0 inline-flex min-w-0 items-center rounded-control border border-stone-300 bg-white p-0">
      <legend className="sr-only">{label}</legend>
      <button
        type="button"
        className={BUTTON}
        aria-label={t('cart.decrease')}
        disabled={disabled || value <= min}
        onClick={() => {
          onChange(value - 1);
        }}
      >
        −
      </button>
      <output aria-live="polite" className="min-w-10 text-center text-base tabular-nums">
        {value}
      </output>
      <button
        type="button"
        className={BUTTON}
        aria-label={t('cart.increase')}
        disabled={disabled || value >= max}
        onClick={() => {
          onChange(value + 1);
        }}
      >
        +
      </button>
    </fieldset>
  );
}
