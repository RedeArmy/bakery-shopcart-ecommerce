import type { components } from '../../../shared/api/generated/schema';
import { SelectField } from '../../../shared/ui/fields';
import { categoryChoices, choiceLabel } from '../model/categories';

type CategoryNode = components['schemas']['CategoryNode'];

/**
 * La lista desplegable con las categorías en orden alfabético (las que cuelgan de otra, debajo de ella) que usan las pantallas de
 * administración para elegir de cuál ver los productos. Sin elegir, `value` es nulo y se muestra el texto de `placeholder`.
 */
export function CategoryFilter({
  label,
  placeholder,
  value,
  categories,
  onChange,
}: Readonly<{
  label: string;
  placeholder: string;
  value: number | null;
  categories: readonly CategoryNode[];
  onChange: (category: number | null) => void;
}>) {
  return (
    <div className="w-full sm:w-80">
      <SelectField
        label={label}
        value={value === null ? '' : String(value)}
        onChange={(event) => {
          const id = Number(event.target.value);
          onChange(id > 0 ? id : null);
        }}
      >
        <option value="">{placeholder}</option>
        {categoryChoices(categories).map((choice) => (
          <option key={choice.id} value={choice.id}>
            {choiceLabel(choice)}
          </option>
        ))}
      </SelectField>
    </div>
  );
}
