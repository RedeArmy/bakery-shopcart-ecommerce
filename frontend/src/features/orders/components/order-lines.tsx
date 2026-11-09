import { useTranslation } from 'react-i18next';
import type { components } from '../../../shared/api/generated/schema';
import { Price } from '../../../shared/ui/price';

type OrderDetail = components['schemas']['OrderDetail'];

/** Los productos del pedido: lo que se llevó, su mensaje y, si ya se devolvió algo, cuántas unidades. */
export function OrderLines({ lines }: Readonly<{ lines: OrderDetail['lines'] }>) {
  const { t } = useTranslation();
  return (
    <section aria-labelledby="order-lines" className="space-y-3">
      <h2 id="order-lines" className="text-2xl text-stone-900">
        {t('orders.lines')}
      </h2>
      <ul className="divide-y divide-stone-200 rounded-card border border-stone-200 bg-white">
        {lines.map((line) => (
          <li
            key={line.idOrderLine}
            className="flex flex-wrap items-start justify-between gap-3 p-4"
          >
            <div className="space-y-1">
              <p className="text-stone-900">{line.productName ?? line.sku}</p>
              {line.attributes ? <p className="text-sm text-stone-600">{line.attributes}</p> : null}
              {line.inscription ? (
                <p className="text-sm text-stone-700">
                  {t('orders.inscription', { text: line.inscription })}
                </p>
              ) : null}
              <p className="text-sm text-stone-600">
                {t('orders.quantity', { count: line.quantity })} · <Price amount={line.unitPrice} />
              </p>
              {line.returnedQuantity ? (
                <p className="text-sm text-stone-700">
                  {t('orders.returnedQuantity', { count: line.returnedQuantity })}
                </p>
              ) : null}
            </div>
            <Price amount={line.lineTotal} className="text-stone-900" />
          </li>
        ))}
      </ul>
    </section>
  );
}
