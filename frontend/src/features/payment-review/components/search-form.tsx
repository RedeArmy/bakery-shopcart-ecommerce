import type { FormEvent } from 'react';
import { Button } from '../../../shared/ui/button';

/**
 * La búsqueda de las pantallas de revisión: un texto (número de pedido, nombre o correo) que el servidor busca tal cual. El campo
 * toma el texto de la dirección (`value`), así se ve lo que se está filtrando aunque se llegue con un enlace.
 */
export function SearchForm({
  id,
  label,
  placeholder,
  submitLabel,
  value,
  onSearch,
}: Readonly<{
  id: string;
  label: string;
  placeholder: string;
  submitLabel: string;
  value: string;
  onSearch: (text: string) => void;
}>) {
  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const text = new FormData(event.currentTarget).get('q');
    onSearch(typeof text === 'string' ? text.trim() : '');
  };

  return (
    <form role="search" onSubmit={submit} className="flex flex-wrap items-end gap-3">
      <div className="min-w-0 flex-1 space-y-1.5 sm:max-w-md">
        <label htmlFor={id} className="block text-sm font-medium text-stone-800">
          {label}
        </label>
        {/* Con `key` el campo vuelve a tomar el texto de la dirección cuando esta cambia */}
        <input
          id={id}
          key={value}
          name="q"
          type="search"
          maxLength={100}
          defaultValue={value}
          placeholder={placeholder}
          className="block min-h-11 w-full rounded-control border border-stone-300 bg-white px-3 text-base text-stone-900 placeholder:text-stone-400"
        />
      </div>
      <Button type="submit">{submitLabel}</Button>
    </form>
  );
}
