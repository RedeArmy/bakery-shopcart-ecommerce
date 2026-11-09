import type { components } from '../../../shared/api/generated/schema';

type CategoryNode = components['schemas']['CategoryNode'];

export interface CategoryChoice {
  id: number;
  /** Cómo se llama la categoría */
  name: string;
  /** 0 para una categoría principal; 1 o más para las que cuelgan de otra */
  depth: number;
}

const byName = (a: CategoryNode, b: CategoryNode): number =>
  a.name.localeCompare(b.name, 'es', { sensitivity: 'base' });

/**
 * El árbol de categorías en una lista para elegir una: ordenadas alfabéticamente y, bajo cada categoría, las suyas también por
 * orden alfabético, para que se vea de cuál cuelgan.
 */
export function categoryChoices(nodes: readonly CategoryNode[], depth = 0): CategoryChoice[] {
  return [...nodes]
    .sort(byName)
    .flatMap((node) => [
      { id: node.idCategory, name: node.name, depth },
      ...categoryChoices(node.children, depth + 1),
    ]);
}

/** El texto de una opción: las categorías que cuelgan de otra llevan una sangría para distinguirse. */
export const choiceLabel = (choice: CategoryChoice): string =>
  `${' '.repeat(choice.depth)}${choice.depth > 0 ? '↳ ' : ''}${choice.name}`;
