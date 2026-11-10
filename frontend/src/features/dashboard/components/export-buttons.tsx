import { useTranslation } from 'react-i18next';
import { errorMessage } from '../../../shared/api';
import { Button } from '../../../shared/ui/button';
import { useExportReport } from '../hooks/use-export-report';
import type { ExportFormat } from '../hooks/use-export-report';
import type { DashboardQuery } from '../model/dashboard';

const FORMATS: readonly ExportFormat[] = ['xlsx', 'pdf'];

/**
 * Los dos archivos del reporte del período que se está viendo: Excel (una hoja por reporte, con los importes como números) y PDF.
 * Con un período al revés no hay nada que exportar y los botones se apagan; si el servidor rechaza la descarga se dice por qué.
 */
export function ExportButtons({
  query,
  disabled,
}: Readonly<{ query: DashboardQuery; disabled: boolean }>) {
  const { t } = useTranslation();
  const exporting = useExportReport(query);
  const current = exporting.isPending ? exporting.variables : null;

  return (
    <section aria-label={t('dashboard.export.title')} className="space-y-2">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm text-stone-700">{t('dashboard.export.title')}</span>
        {FORMATS.map((format) => (
          <Button
            key={format}
            variant="secondary"
            disabled={disabled || exporting.isPending}
            loading={current === format}
            onClick={() => {
              exporting.mutate(format);
            }}
          >
            {t(`dashboard.export.${format}`)}
          </Button>
        ))}
      </div>
      {exporting.isError ? (
        <p role="alert" className="text-sm text-red-900">
          {t('dashboard.export.failed')} {errorMessage(exporting.error)}
        </p>
      ) : null}
    </section>
  );
}
