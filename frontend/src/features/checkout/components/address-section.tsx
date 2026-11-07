import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { errorMessage } from '../../../shared/api';
import { Button } from '../../../shared/ui/button';
import { TextField } from '../../../shared/ui/fields';
import { ErrorState, LoadingSkeleton } from '../../../shared/ui/states';
import { fieldError } from '../../auth/components/auth-layout';
import { useAddresses, useCreateAddress } from '../hooks/use-checkout';
import type { Address } from '../hooks/use-checkout';
import { addressSchema } from '../model/schemas';
import type { AddressValues } from '../model/schemas';

const EMPTY: AddressValues = {
  label: '',
  recipient: '',
  phone: '',
  line1: '',
  line2: '',
  municipality: '',
  department: '',
  reference: '',
};

/** Formulario de una dirección nueva. Al guardarla avisa con su identificador para que quede elegida. */
function AddressForm({
  onSaved,
  onCancel,
}: Readonly<{ onSaved: (idAddress: number) => void; onCancel?: () => void }>) {
  const { t } = useTranslation();
  const create = useCreateAddress();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<AddressValues>({ resolver: zodResolver(addressSchema), defaultValues: EMPTY });

  const field = (name: keyof AddressValues, autoComplete?: string) => ({
    label: t(`checkout.address.fields.${name}`),
    error: fieldError(t, errors[name]?.message),
    ...(autoComplete === undefined ? {} : { autoComplete }),
    ...register(name),
  });

  return (
    <form
      onSubmit={(event) =>
        void handleSubmit((values) => {
          create.mutate(values, { onSuccess: onSaved });
        })(event)
      }
      noValidate
      className="space-y-4 rounded-card border border-stone-200 bg-white p-4"
    >
      <h3 className="font-display text-lg text-stone-900">{t('checkout.address.newTitle')}</h3>
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField {...field('label')} hint={t('checkout.address.labelHint')} />
        <TextField {...field('recipient', 'name')} />
        <TextField {...field('phone', 'tel')} type="tel" />
        <TextField {...field('municipality', 'address-level2')} />
        <TextField {...field('department', 'address-level1')} />
      </div>
      <TextField {...field('line1', 'address-line1')} />
      <TextField {...field('line2', 'address-line2')} optionalLabel={t('common.optional')} />
      <TextField {...field('reference')} optionalLabel={t('common.optional')} />
      {create.isError ? (
        <p role="alert" className="rounded-control bg-red-50 px-4 py-3 text-sm text-red-900">
          {errorMessage(create.error)}
        </p>
      ) : null}
      <div className="flex gap-3">
        <Button type="submit" loading={create.isPending}>
          {t('checkout.address.save')}
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

/**
 * Dónde se entrega. Se elige entre las direcciones guardadas o se agrega una aquí mismo; quien todavía no tiene ninguna ve
 * el formulario directamente. La dirección elegida se congela en el pedido: cambiarla después no altera lo ya pedido.
 */
export function AddressSection({
  selected,
  onSelect,
}: Readonly<{ selected: number | null; onSelect: (idAddress: number) => void }>) {
  const { t } = useTranslation();
  const addresses = useAddresses();
  const [adding, setAdding] = useState(false);

  const active: Address[] = (addresses.data ?? []).filter((address) => address.isActive !== false);
  // Con una sola dirección, o la primera al llegar, ya queda elegida: un paso menos para quien compra
  useEffect(() => {
    if (selected === null && active.length > 0) onSelect(active[0]?.idAddress ?? 0);
  }, [active.length, selected]);

  let body;
  if (addresses.isPending) {
    body = <LoadingSkeleton count={2} />;
  } else if (addresses.isError) {
    body = <ErrorState error={addresses.error} onRetry={() => void addresses.refetch()} />;
  } else if (active.length === 0 || adding) {
    body = (
      <AddressForm
        onSaved={(idAddress) => {
          onSelect(idAddress);
          setAdding(false);
        }}
        {...(active.length === 0
          ? {}
          : {
              onCancel: () => {
                setAdding(false);
              },
            })}
      />
    );
  } else {
    body = (
      <>
        <fieldset className="space-y-2">
          <legend className="sr-only">{t('checkout.address.title')}</legend>
          {active.map((address) => (
            <label
              key={address.idAddress}
              className="flex cursor-pointer gap-3 rounded-card border border-stone-200 bg-white p-4 has-[:checked]:border-accent has-[:checked]:bg-accent-soft"
            >
              <input
                type="radio"
                name="address"
                className="mt-1 accent-accent"
                checked={selected === address.idAddress}
                onChange={() => {
                  onSelect(address.idAddress);
                }}
              />
              <span className="text-sm text-stone-800">
                <span className="block font-medium text-stone-900">
                  {address.label} · {address.recipient}
                </span>
                <span className="block">
                  {address.line1}
                  {address.line2 ? `, ${address.line2}` : ''}
                </span>
                <span className="block">
                  {address.municipality}, {address.department} · {address.phone}
                </span>
                {address.reference ? (
                  <span className="block text-stone-600">{address.reference}</span>
                ) : null}
              </span>
            </label>
          ))}
        </fieldset>
        <Button
          variant="secondary"
          onClick={() => {
            setAdding(true);
          }}
        >
          {t('checkout.address.add')}
        </Button>
      </>
    );
  }

  return (
    <section aria-labelledby="checkout-address" className="space-y-4">
      <h2 id="checkout-address" className="text-2xl text-stone-900">
        {t('checkout.address.title')}
      </h2>
      {body}
    </section>
  );
}
