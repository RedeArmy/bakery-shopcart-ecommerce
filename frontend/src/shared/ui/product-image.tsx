import { CakeIcon } from './icons';

/** Foto del producto o, mientras no la haya, un marcador neutro que mantiene la proporción de la tarjeta. */
export function ProductImage({ url, name }: { url: string | null | undefined; name: string }) {
  return (
    <div className="aspect-[4/3] overflow-hidden rounded-card bg-stone-100">
      {url ? (
        <img src={url} alt={name} loading="lazy" className="size-full object-cover" />
      ) : (
        <div className="grid size-full place-items-center text-stone-400">
          <CakeIcon width={40} height={40} />
        </div>
      )}
    </div>
  );
}
