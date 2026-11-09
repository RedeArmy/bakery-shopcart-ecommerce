import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { components } from '../../../shared/api/generated/schema';
import { formatMoney } from '../../../shared/lib/money/money';
import { Button } from '../../../shared/ui/button';
import { Price } from '../../../shared/ui/price';
import { periodLabel, plotValue } from '../model/dashboard';
import type { Granularity, Metric } from '../model/dashboard';

type SalesPoint = components['schemas']['SalesPoint'];

const METRICS: readonly Metric[] = ['amount', 'orders'];

// El acento de la marca (el del tema, en index.css): una barra de SVG no lee las clases de Tailwind
const BAR_FILL = '#9f1239';

/**
 * Las ventas de cada período como barras, del monto o del número de pedidos. La altura de una barra es solo un dibujo: lo que se
 * lee (en el aviso y en la tabla) es el texto que dicta el API. La tabla de abajo trae los mismos datos para quien no ve la gráfica.
 */
export function SalesChart({
  points,
  granularity,
}: Readonly<{ points: readonly SalesPoint[]; granularity: Granularity }>) {
  const { t } = useTranslation();
  const [metric, setMetric] = useState<Metric>('amount');
  const label = (start: string): string =>
    granularity === 'week'
      ? t('dashboard.sales.weekOf', { date: periodLabel(start, granularity) })
      : periodLabel(start, granularity);
  const data = points.map((point) => ({
    label: periodLabel(point.periodStart, granularity),
    value: metric === 'amount' ? plotValue(point.net) : point.orders,
    net: point.net,
    orders: point.orders,
  }));

  return (
    <div className="space-y-4">
      <div role="group" aria-label={t('dashboard.sales.metric')} className="flex gap-2">
        {METRICS.map((item) => (
          <Button
            key={item}
            variant={metric === item ? 'primary' : 'secondary'}
            aria-pressed={metric === item}
            onClick={() => {
              setMetric(item);
            }}
          >
            {t(`dashboard.sales.${item}`)}
          </Button>
        ))}
      </div>
      <figure
        role="img"
        aria-label={t('dashboard.sales.chartLabel', {
          metric: t(`dashboard.sales.${metric}`).toLowerCase(),
          granularity: t(`dashboard.period.${granularity}`).toLowerCase(),
        })}
        className="h-64 w-full"
      >
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="label" tickLine={false} fontSize={12} />
            <YAxis
              tickLine={false}
              axisLine={false}
              fontSize={12}
              width={48}
              allowDecimals={false}
            />
            <Tooltip
              formatter={(_value, _name, item) => {
                const datum = item.payload as { net: string; orders: number };
                return metric === 'amount' ? formatMoney(datum.net) : String(datum.orders);
              }}
            />
            <Bar dataKey="value" fill={BAR_FILL} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </figure>
      <details className="text-sm">
        <summary className="min-h-11 cursor-pointer py-2 text-stone-700">
          {t('dashboard.sales.showData')}
        </summary>
        <div className="max-h-72 overflow-auto">
          <table className="w-full text-left">
            <thead className="sticky top-0 bg-white text-stone-600">
              <tr>
                <th scope="col" className="py-2 pr-4 font-medium">
                  {t('dashboard.sales.period')}
                </th>
                <th scope="col" className="py-2 pr-4 text-right font-medium">
                  {t('dashboard.sales.ordersColumn')}
                </th>
                <th scope="col" className="py-2 text-right font-medium">
                  {t('dashboard.sales.netColumn')}
                </th>
              </tr>
            </thead>
            <tbody>
              {points.map((point) => (
                <tr key={point.periodStart} className="border-t border-stone-100">
                  <th scope="row" className="py-2 pr-4 font-normal text-stone-800">
                    {label(point.periodStart)}
                  </th>
                  <td className="py-2 pr-4 text-right tabular-nums">{point.orders}</td>
                  <td className="py-2 text-right">
                    <Price amount={point.net} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
