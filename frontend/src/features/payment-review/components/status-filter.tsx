/** Los estados que se pueden mirar, como botones de un grupo: el activo se marca con `aria-pressed` y con el color. */
export function StatusFilter<T extends string>({
  label,
  options,
  value,
  labelOf,
  onChange,
}: Readonly<{
  label: string;
  options: readonly T[];
  value: T;
  labelOf: (option: T) => string;
  onChange: (option: T) => void;
}>) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-2">
      {options.map((option) => (
        <button
          key={option}
          type="button"
          aria-pressed={option === value}
          onClick={() => {
            onChange(option);
          }}
          className={`min-h-11 rounded-control border px-4 text-sm font-medium transition ${
            option === value
              ? 'border-stone-900 bg-stone-900 text-white'
              : 'border-stone-300 bg-white text-stone-800 hover:bg-stone-100'
          }`}
        >
          {labelOf(option)}
        </button>
      ))}
    </div>
  );
}
