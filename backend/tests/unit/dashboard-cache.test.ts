import { describe, expect, it } from 'vitest';
import { createCachedDashboardRepository } from '../../src/modules/dashboard/application/cached-dashboard-repository.js';
import type { DashboardRepository } from '../../src/modules/dashboard/application/dashboard-repository.js';

const RANGE = { from: '2030-06-01', to: '2030-06-30' };

/** Un repositorio que cuenta cuántas veces se calculó cada reporte y cuya versión de datos se cambia a mano. */
function counting() {
  const state = { version: 'v1', computed: 0, versionReads: 0, failNext: false };
  const inner: DashboardRepository = {
    summary: (range) => {
      state.computed += 1;
      if (state.failNext) {
        state.failNext = false;
        return Promise.reject(new Error('database down'));
      }
      return Promise.resolve({ orders: state.computed, from: range.from });
    },
    salesByPeriod: (_range, granularity) => {
      state.computed += 1;
      return Promise.resolve([{ granularity, n: state.computed }]);
    },
    salesByCategory: () => Promise.resolve([]),
    topProducts: (_range, top) => Promise.resolve([{ top }]),
    abandonedCarts: (page, size) =>
      Promise.resolve({ items: [], page, size, total: state.computed }),
    dataVersion: () => {
      state.versionReads += 1;
      return Promise.resolve(state.version);
    },
  };
  return { state, inner };
}

function cacheOver(
  inner: DashboardRepository,
  overrides: { ttlMs?: number; maxEntries?: number } = {},
) {
  const clock = { at: 1_000 };
  const repository = createCachedDashboardRepository(inner, {
    ttlMs: overrides.ttlMs ?? 60_000,
    maxEntries: overrides.maxEntries ?? 200,
    now: () => clock.at,
  });
  return { repository, clock };
}

describe('the report cache', () => {
  it('computes a report once while the data does not change', async () => {
    const { state, inner } = counting();
    const { repository } = cacheOver(inner);

    const first = await repository.summary(RANGE);
    const second = await repository.summary(RANGE);

    expect(second).toBe(first);
    expect(state.computed).toBe(1);
    // Mirar si algo cambió es la única lectura que se repite, y es la barata
    expect(state.versionReads).toBe(2);
  });

  it('computes it again as soon as the data version changes', async () => {
    const { state, inner } = counting();
    const { repository } = cacheOver(inner);

    await repository.summary(RANGE);
    state.version = 'v2';
    const fresh = await repository.summary(RANGE);

    expect(state.computed).toBe(2);
    expect(fresh).toMatchObject({ orders: 2 });
    // Con la versión nueva ya guardada, la siguiente petición vuelve a ser un acierto
    await repository.summary(RANGE);
    expect(state.computed).toBe(2);
  });

  it('computes it again when its time to live ends, even if the data did not change', async () => {
    const { state, inner } = counting();
    const { repository, clock } = cacheOver(inner, { ttlMs: 5_000 });

    await repository.summary(RANGE);
    clock.at += 4_999;
    await repository.summary(RANGE);
    expect(state.computed).toBe(1);

    clock.at += 1;
    await repository.summary(RANGE);
    expect(state.computed).toBe(2);
  });

  it('keeps a different report for each range, granularity, limit and page', async () => {
    const { state, inner } = counting();
    const { repository } = cacheOver(inner);

    await repository.summary(RANGE);
    await repository.summary({ from: null, to: null });
    await repository.salesByPeriod(RANGE, 'day');
    await repository.salesByPeriod(RANGE, 'week');
    expect(state.computed).toBe(4);

    expect(await repository.topProducts(RANGE, 5)).toEqual([{ top: 5 }]);
    expect(await repository.topProducts(RANGE, 10)).toEqual([{ top: 10 }]);
    expect((await repository.abandonedCarts(2, 5)).page).toBe(2);
    expect((await repository.abandonedCarts(1, 5)).page).toBe(1);
    expect(await repository.salesByCategory(RANGE)).toEqual([]);
  });

  it('shares one calculation between two requests made at the same time', async () => {
    const { state, inner } = counting();
    const { repository } = cacheOver(inner);

    const [a, b] = await Promise.all([repository.summary(RANGE), repository.summary(RANGE)]);

    expect(b).toBe(a);
    expect(state.computed).toBe(1);
  });

  it('does not keep a calculation that failed', async () => {
    const { state, inner } = counting();
    const { repository } = cacheOver(inner);
    state.failNext = true;

    await expect(repository.summary(RANGE)).rejects.toThrow('database down');
    expect(await repository.summary(RANGE)).toMatchObject({ orders: 2 });
    expect(state.computed).toBe(2);
  });

  it('forgets the oldest report when it holds more than it was allowed', async () => {
    const { state, inner } = counting();
    const { repository } = cacheOver(inner, { maxEntries: 2 });

    await repository.salesByPeriod(RANGE, 'day');
    await repository.salesByPeriod(RANGE, 'week');
    await repository.salesByPeriod(RANGE, 'month');
    expect(state.computed).toBe(3);

    await repository.salesByPeriod(RANGE, 'month');
    await repository.salesByPeriod(RANGE, 'week');
    expect(state.computed).toBe(3);
    await repository.salesByPeriod(RANGE, 'day');
    expect(state.computed).toBe(4);
  });

  it('passes the data version through without keeping it', async () => {
    const { state, inner } = counting();
    const { repository } = cacheOver(inner);

    expect(await repository.dataVersion()).toBe('v1');
    state.version = 'v2';
    expect(await repository.dataVersion()).toBe('v2');
  });
});
