import { useTranslation } from 'react-i18next';
import { SelectField } from '../../../shared/ui/fields';
import { ORDER_STATUSES } from '../model/order-status';

/** El filtro por estado de una lista de pedidos: `null` es «todos» y el resto es la posición del estado en el catálogo. */
export function StatusFilter({
  status,
  onChange,
}: Readonly<{ status: number | null; onChange: (status: number | null) => void }>) {
  const { t } = useTranslation();
  return (
    <div className="w-full sm:w-64">
      <SelectField
        label={t('orders.filter')}
        value={status === null ? '' : String(status)}
        onChange={(event) => {
          onChange(event.target.value === '' ? null : Number(event.target.value));
        }}
      >
        <option value="">{t('orders.allStatuses')}</option>
        {ORDER_STATUSES.map((name, index) => (
          <option key={name} value={index + 1}>
            {t(`orders.status.${name}`)}
          </option>
        ))}
      </SelectField>
    </div>
  );
}
