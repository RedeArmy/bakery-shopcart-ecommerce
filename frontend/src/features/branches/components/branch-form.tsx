import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { errorMessage } from '../../../shared/api';
import { Button } from '../../../shared/ui/button';
import { TextField } from '../../../shared/ui/fields';
import { fieldError } from '../../auth/components/auth-layout';
import { useCreateBranch, useUpdateBranch } from '../hooks/use-branches';
import type { Branch } from '../hooks/use-branches';
import { EMPTY_BRANCH, branchSchema } from '../model/schemas';
import type { BranchValues } from '../model/schemas';

const valuesOf = (branch: Branch): BranchValues => ({
  name: branch.name,
  line1: branch.line1,
  municipality: branch.municipality,
  department: branch.department,
  phone: branch.phone ?? '',
  openingHours: branch.openingHours ?? '',
});

/**
 * Alta o edición de una sucursal, con los mismos campos. Sin `branch` crea una nueva; con ella edita la que se muestra.
 * Las reglas (nombre único entre las activas, solo un administrador) las decide el servidor y su respuesta se muestra.
 */
export function BranchForm({
  branch,
  onDone,
  onCancel,
}: Readonly<{ branch?: Branch; onDone: () => void; onCancel?: () => void }>) {
  const { t } = useTranslation();
  const create = useCreateBranch();
  const update = useUpdateBranch(branch?.idBranch ?? 0);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<BranchValues>({
    resolver: zodResolver(branchSchema),
    defaultValues: branch === undefined ? EMPTY_BRANCH : valuesOf(branch),
  });

  const mutation = branch === undefined ? create : update;
  const field = (name: keyof BranchValues, autoComplete?: string) => ({
    label: t(`branches.fields.${name}`),
    error: fieldError(t, errors[name]?.message),
    ...(autoComplete === undefined ? {} : { autoComplete }),
    ...register(name),
  });

  return (
    <form
      onSubmit={(event) =>
        void handleSubmit((values) => {
          mutation.mutate(values, { onSuccess: onDone });
        })(event)
      }
      noValidate
      className="space-y-4 rounded-card border border-stone-200 bg-white p-4"
    >
      <h3 className="font-display text-lg text-stone-900">
        {branch === undefined ? t('branches.newTitle') : t('branches.editTitle')}
      </h3>
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField {...field('name')} />
        <TextField {...field('phone', 'tel')} type="tel" optionalLabel={t('common.optional')} />
        <TextField {...field('municipality', 'address-level2')} />
        <TextField {...field('department', 'address-level1')} />
      </div>
      <TextField {...field('line1', 'address-line1')} />
      <TextField
        {...field('openingHours')}
        hint={t('branches.hours.hint')}
        optionalLabel={t('common.optional')}
      />
      {mutation.isError ? (
        <p role="alert" className="rounded-control bg-red-50 px-4 py-3 text-sm text-red-900">
          {errorMessage(mutation.error)}
        </p>
      ) : null}
      <div className="flex gap-3">
        <Button type="submit" loading={mutation.isPending}>
          {branch === undefined ? t('branches.create') : t('branches.save')}
        </Button>
        {onCancel === undefined ? null : (
          <Button variant="ghost" onClick={onCancel}>
            {t('common.close')}
          </Button>
        )}
      </div>
    </form>
  );
}
