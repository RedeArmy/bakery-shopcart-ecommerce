import type { components } from '../../../shared/api/generated/schema';
import { ProductCard } from './product-card';

type ProductSummary = components['schemas']['ProductSummary'];

export function ProductGrid({ products }: Readonly<{ products: readonly ProductSummary[] }>) {
  return (
    <ul className="grid grid-cols-2 gap-x-4 gap-y-8 md:grid-cols-3 lg:grid-cols-4">
      {products.map((product) => (
        <li key={product.idProduct}>
          <ProductCard product={product} />
        </li>
      ))}
    </ul>
  );
}
