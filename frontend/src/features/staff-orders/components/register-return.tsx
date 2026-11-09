import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { errorMessage } from '../../../shared/api';
import { Button } from '../../../shared/ui/button';
import { TextField } from '../../../shared/ui/fields';
import type { useRegisterReturn } from '../hooks/use-staff-orders';
import { REASON_MAX, buildReturn, pendingReturn } from '../model/staff-orders';
import type { ReturnProblem, ReturnableLine } from '../model/staff-orders';

interface Line extends ReturnableLine {
  productName?: string;
  sku?: string;
}

/**
 * La devolución de un pedido entregado, total o parcial: cuántas unidades de cada línea y el motivo. Las unidades que ya se
 * devolvieron no se pueden pedir otra vez. El reembolso lo calcula el servidor (la última unidad cierra la línea al centavo). La
 * mutación la trae la página y no vive aquí: al devolverse todo, el estado del pedido hace desaparecer este formulario y una
 * mutación de un componente desmontado pierde sus avisos.
 */
export function RegisterReturn({
  lines,
  register,
}: Readonly<{ lines: readonly Line[]; register: ReturnType<typeof useRegisterReturn> }>) {
  const { t } = useTranslation();
  const [opened, setOpened] = useState(false);
  const [reason, setReason] = useState('');
  const [quantities, setQuantities] = useState<Record<number, string>>({});
  const [problem, setProblem] = useState<ReturnProblem | null>(null);

  const open = lines.filter((line) => pendingReturn(line) > 0);
  if (open.length === 0) return null;

  if (!opened) {
    return (
      <Button
        variant="secondary"
        className="w-full"
        onClick={() => {
          setOpened(true);
        }}
      >
        {t('staffOrders.return.open')}
      </Button>
    );
  }

  const submit = (): void => {
    const draft = buildReturn(open, quantities, reason);
    if (!draft.ok) {
      setProblem(draft.problem);
      return;
    }
    setProblem(null);
    register.mutate(draft.body, {
      onSuccess: () => {
        setQuantities({});
        setReason('');
      },
    });
  };

  return (
    <section
      aria-labelledby="register-return"
      className="space-y-4 rounded-card border border-stone-200 bg-white p-4"
    >
      <h2 id="register-return" className="text-lg text-stone-900">
        {t('staffOrders.return.title')}
      </h2>
      <p className="text-sm text-stone-600">{t('staffOrders.return.intro')}</p>
      <ul className="space-y-3">
        {open.map((line) => (
          <li key={line.idOrderLine} className="space-y-1">
            <TextField
              label={line.productName ?? line.sku ?? String(line.idOrderLine)}
              hint={t('staffOrders.return.pending', { count: pendingReturn(line) })}
              type="number"
              inputMode="numeric"
              min={0}
              max={pendingReturn(line)}
              value={quantities[line.idOrderLine] ?? ''}
              onChange={(event) => {
                setQuantities({ ...quantities, [line.idOrderLine]: event.target.value });
              }}
            />
          </li>
        ))}
      </ul>
      <TextField
        label={t('staffOrders.return.reason')}
        maxLength={REASON_MAX}
        value={reason}
        onChange={(event) => {
          setReason(event.target.value);
        }}
      />
      {problem === null ? null : (
        <p role="alert" className="text-sm text-red-900">
          {t(`staffOrders.return.problems.${problem}`)}
        </p>
      )}
      {register.isError ? (
        <p role="alert" className="text-sm text-red-900">
          {errorMessage(register.error)}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-3">
        <Button loading={register.isPending} onClick={submit}>
          {t('staffOrders.return.confirm')}
        </Button>
        <Button
          variant="secondary"
          disabled={register.isPending}
          onClick={() => {
            setOpened(false);
            setProblem(null);
            register.reset();
          }}
        >
          {t('staffOrders.return.close')}
        </Button>
      </div>
    </section>
  );
}
