import { useTranslation } from 'react-i18next';
import { Button } from '../../../shared/ui/button';
import { SelectField, TextField } from '../../../shared/ui/fields';
import { GRANULARITIES, PRESET_DAYS, activePreset, isReversed, lastDays } from '../model/dashboard';
import type { DashboardQuery, Granularity } from '../model/dashboard';

/**
 * El período del panel: tres preajustes de un clic, dos fechas para elegirlo a mano y cómo agrupar las ventas. Todo vive en la
 * dirección (lo decide el padre), así un enlace lleva al mismo panel. Sin fechas el servidor muestra los últimos 30 días.
 */
export function PeriodFilter({
  query,
  onChange,
}: Readonly<{ query: DashboardQuery; onChange: (next: DashboardQuery) => void }>) {
  const { t } = useTranslation();
  const preset = activePreset(query);
  const reversed = isReversed(query);

  return (
    <fieldset className="space-y-4 rounded-card border border-stone-200 bg-white p-5">
      <legend className="px-1 text-lg text-stone-900">{t('dashboard.period.title')}</legend>
      <div className="flex flex-wrap gap-2">
        {PRESET_DAYS.map((days) => (
          <Button
            key={days}
            variant={preset === days ? 'primary' : 'secondary'}
            aria-pressed={preset === days}
            onClick={() => {
              onChange({ ...query, ...lastDays(days) });
            }}
          >
            {t('dashboard.period.preset', { count: days })}
          </Button>
        ))}
        <Button
          variant="ghost"
          onClick={() => {
            onChange({ from: null, to: null, granularity: 'day' });
          }}
        >
          {t('dashboard.period.reset')}
        </Button>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <TextField
          label={t('dashboard.period.from')}
          type="date"
          value={query.from ?? ''}
          {...(query.to === null ? {} : { max: query.to })}
          onChange={(event) => {
            onChange({ ...query, from: event.target.value === '' ? null : event.target.value });
          }}
        />
        <TextField
          label={t('dashboard.period.to')}
          type="date"
          value={query.to ?? ''}
          {...(query.from === null ? {} : { min: query.from })}
          {...(reversed ? { error: t('dashboard.period.reversed') } : {})}
          onChange={(event) => {
            onChange({ ...query, to: event.target.value === '' ? null : event.target.value });
          }}
        />
        <SelectField
          label={t('dashboard.period.granularity')}
          value={query.granularity}
          onChange={(event) => {
            onChange({ ...query, granularity: event.target.value as Granularity });
          }}
        >
          {GRANULARITIES.map((item) => (
            <option key={item} value={item}>
              {t(`dashboard.period.${item}`)}
            </option>
          ))}
        </SelectField>
      </div>
      <p className="text-sm text-stone-600">{t('dashboard.period.hint')}</p>
    </fieldset>
  );
}
