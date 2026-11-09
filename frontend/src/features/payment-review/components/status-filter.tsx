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
    // El grupo es un fieldset con su leyenda: lo anuncian igual los lectores de pantalla y no hace falta un rol
    <fieldset className="m-0 flex min-w-0 flex-wrap gap-2 border-0 p-0">
      <legend className="sr-only">{label}</legend>
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
    </fieldset>
  );
}
