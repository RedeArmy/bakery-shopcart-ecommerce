import { useMutation } from '@tanstack/react-query';
import { api, unwrap } from '../../../shared/api';
import { filenameOf, saveBlob } from '../../../shared/lib/download';
import { rangeParams } from '../model/dashboard';
import type { DashboardQuery } from '../model/dashboard';

export type ExportFormat = 'xlsx' | 'pdf';

/**
 * Descarga el reporte del período que se está viendo como Excel o PDF. Lo arma el servidor con los mismos datos que el panel (y
 * su caché); aquí solo se pide con la sesión y se entrega el archivo al navegador.
 */
export function useExportReport(query: DashboardQuery) {
  return useMutation({
    mutationFn: async (format: ExportFormat) => {
      const result = await api.GET('/api/v1/admin/dashboard/export', {
        params: {
          query: { format, ...rangeParams(query), granularity: query.granularity },
        },
        parseAs: 'blob',
      });
      const file = unwrap(result);
      saveBlob(
        file,
        filenameOf(result.response.headers.get('Content-Disposition'), `reporte-ventas.${format}`),
      );
    },
  });
}
