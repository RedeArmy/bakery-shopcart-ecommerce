import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { errorMessage } from '../../../shared/api';
import { Button } from '../../../shared/ui/button';
import { SelectField, TextField } from '../../../shared/ui/fields';
import { fieldError } from '../../auth/components/auth-layout';
import { useCategories } from '../../catalogue/hooks/use-catalogue-queries';
import { categoryChoices, choiceLabel } from '../../catalogue/model/categories';
import { useCreateCoupon, useUpdateCoupon } from '../hooks/use-coupons';
import {
  COUPON_TYPES,
  EMPTY_COUPON,
  couponSchema,
  newCouponSchema,
  valuesOf,
} from '../model/coupons';
import type { Coupon, CouponValues } from '../model/coupons';

/**
 * Alta o edición de un cupón, con los mismos campos. Sin `coupon` crea uno nuevo (y pide el código); con él edita el que se muestra
 * (el código no cambia). Los días son días de Guatemala: el cupón rige desde el comienzo del primero hasta el final del último.
 * Las reglas que solo conoce el servidor (código repetido, límite por debajo de lo ya usado) se muestran con su respuesta.
 */
export function CouponForm({
  coupon,
  onDone,
  onCancel,
}: Readonly<{ coupon?: Coupon; onDone: () => void; onCancel?: () => void }>) {
  const { t } = useTranslation();
  const create = useCreateCoupon();
  const update = useUpdateCoupon(coupon?.idCoupon ?? 0);
  const categories = useCategories({ fresh: true });
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<CouponValues>({
    resolver: zodResolver(coupon === undefined ? newCouponSchema : couponSchema),
    defaultValues: coupon === undefined ? EMPTY_COUPON : valuesOf(coupon),
  });

  const mutation = coupon === undefined ? create : update;
  const isPercentage = watch('type') === 'Percentage';
  const field = (name: keyof CouponValues) => ({
    label: t(`coupons.fields.${name}`),
    error: fieldError(t, errors[name]?.message),
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
      aria-label={coupon === undefined ? t('coupons.newTitle') : t('coupons.editTitle')}
      className="space-y-4 rounded-card border border-stone-200 bg-white p-4"
    >
      <h3 className="font-display text-lg text-stone-900">
        {coupon === undefined ? t('coupons.newTitle') : t('coupons.editTitle')}
      </h3>
      <div className="grid gap-4 sm:grid-cols-2">
        {coupon === undefined ? (
          <TextField
            {...field('code')}
            hint={t('coupons.hints.code')}
            autoCapitalize="characters"
          />
        ) : null}
        <SelectField {...field('type')}>
          {COUPON_TYPES.map((type) => (
            <option key={type} value={type}>
              {t(`coupons.types.${type}`)}
            </option>
          ))}
        </SelectField>
        <TextField
          {...field('value')}
          inputMode="decimal"
          hint={isPercentage ? t('coupons.hints.percentage') : t('coupons.hints.amount')}
        />
        <TextField
          {...field('minimumAmount')}
          inputMode="decimal"
          hint={t('coupons.hints.minimumAmount')}
          optionalLabel={t('common.optional')}
        />
        <TextField {...field('startDay')} type="date" />
        <TextField {...field('endDay')} type="date" hint={t('coupons.hints.endDay')} />
        <TextField
          {...field('totalUsageLimit')}
          inputMode="numeric"
          hint={t('coupons.hints.limit')}
          optionalLabel={t('common.optional')}
        />
        <TextField
          {...field('perCustomerUsageLimit')}
          inputMode="numeric"
          hint={t('coupons.hints.limit')}
          optionalLabel={t('common.optional')}
        />
        <SelectField
          {...field('category')}
          hint={t('coupons.hints.category')}
          optionalLabel={t('common.optional')}
        >
          <option value="">{t('coupons.allCategories')}</option>
          {categoryChoices(categories.data ?? []).map((choice) => (
            <option key={choice.id} value={choice.id}>
              {choiceLabel(choice)}
            </option>
          ))}
        </SelectField>
      </div>
      {mutation.isError ? (
        <p role="alert" className="rounded-control bg-red-50 px-4 py-3 text-sm text-red-900">
          {errorMessage(mutation.error)}
        </p>
      ) : null}
      <div className="flex gap-3">
        <Button type="submit" loading={mutation.isPending}>
          {coupon === undefined ? t('coupons.create') : t('coupons.save')}
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
