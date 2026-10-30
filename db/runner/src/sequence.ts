/** Ejecuta las tareas una tras otra y en orden: el orden de los lotes y de los scripts importa. */
export async function inSequence<T>(
  items: readonly T[],
  task: (item: T) => Promise<unknown>,
): Promise<void> {
  await items.reduce<Promise<unknown>>(
    (previous, item) => previous.then(() => task(item)),
    Promise.resolve(),
  );
}
