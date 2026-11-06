import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { CartIcon } from '../../../shared/ui/icons';
import { useCart } from '../hooks/use-cart';

/** Enlace al carrito del encabezado, con el número de productos que lleva. */
export function CartLink() {
  const { t } = useTranslation();
  const count = useCart().data?.itemCount ?? 0;
  return (
    <Link
      to="/cart"
      aria-label={t('cart.linkLabel', { count })}
      className="relative grid size-11 place-items-center rounded-control text-stone-800 hover:bg-stone-100"
    >
      <CartIcon />
      {count > 0 ? (
        <span
          aria-hidden="true"
          className="absolute right-0.5 top-0.5 grid min-w-5 place-items-center rounded-full bg-accent px-1 text-[0.6875rem] font-medium leading-5 text-white"
        >
          {count}
        </span>
      ) : null}
    </Link>
  );
}
