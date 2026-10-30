import { Router } from 'express';
import { z } from 'zod';
import { requireUser } from '../../../platform/http/authentication.js';
import type { RouteKit } from '../../../platform/http/route-kit.js';
import { money, pageQuery, positiveInt } from '../../../platform/http/serialise.js';
import type { Row } from '../../../platform/http/serialise.js';
import { POLICIES } from '../../../platform/rate-limit/rate-limit.js';
import type { CatalogueRepository } from '../application/catalogue-repository.js';

const idParam = z.object({ id: positiveInt });

const flag = z.enum(['true', 'false']).transform((value) => value === 'true');

const searchQuery = pageQuery.extend({
  q: z.string().trim().max(100).optional(),
  category: positiveInt.optional(),
  min: money.optional(),
  max: money.optional(),
  available: flag.optional(),
  sort: z.enum(['name', 'price_asc', 'price_desc', 'newest']).default('name'),
});

const categoryBody = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(300).nullish(),
  parentId: positiveInt.nullish(),
});

const productBody = z.object({
  categoryId: positiveInt,
  name: z.string().trim().min(1).max(150),
  description: z.string().trim().max(1000).nullish(),
  leadTimeDays: z.number().int().min(0).max(255).default(0),
  /** Versión leída del producto: si cambió mientras se editaba, la edición se rechaza (concurrencia optimista) */
  rowVersion: z
    .string()
    .regex(/^[A-Za-z0-9+/]{11}=$/)
    .nullish(),
});

const attributes = z
  .array(
    z.object({ name: z.string().trim().min(1).max(40), value: z.string().trim().min(1).max(60) }),
  )
  .max(20)
  .nullish();

const variantCreateBody = z.object({
  productId: positiveInt,
  sku: z.string().trim().min(1).max(40),
  price: money,
  attributes,
});
const variantUpdateBody = z.object({
  sku: z.string().trim().min(1).max(40),
  isActive: z.boolean(),
  attributes,
});

interface TreeNode extends Row {
  children: TreeNode[];
}

/** La base entrega la lista plana de categorías; aquí se arma el árbol con idParentCategory. */
export function buildCategoryTree(flat: readonly Row[]): TreeNode[] {
  const nodes = new Map<number, TreeNode>();
  for (const row of flat) nodes.set(row['idCategory'] as number, { ...row, children: [] });
  const roots: TreeNode[] = [];
  for (const node of nodes.values()) {
    const parent = nodes.get(node['idParentCategory'] as number);
    if (parent === undefined) roots.push(node);
    else parent.children.push(node);
  }
  return roots;
}

export function createCatalogueRouter(kit: RouteKit, repository: CatalogueRepository): Router {
  const router = Router();
  const publicLimit = kit.rateLimit(POLICIES.publicCatalogue);
  const write = kit.rateLimit(POLICIES.authenticatedWrite);
  const administrator = [kit.authenticate, kit.role('Administrator')];
  const required = kit.idempotent({ required: true });
  const optional = kit.idempotent({ required: false });

  // --- Público ---------------------------------------------------------------------------

  router.get('/categories', publicLimit, async (_req, res) => {
    res.json(buildCategoryTree(await repository.listCategories(false)));
  });

  router.get('/products', publicLimit, async (req, res) => {
    const query = searchQuery.parse(req.query);
    res.json(
      await repository.searchProducts({
        query: query.q ?? null,
        categoryId: query.category ?? null,
        minPrice: query.min ?? null,
        maxPrice: query.max ?? null,
        inStockOnly: query.available ?? false,
        includeInactive: false,
        sort: query.sort,
        page: query.page,
        size: query.size,
      }),
    );
  });

  router.get('/products/:id', publicLimit, async (req, res) => {
    const { id } = idParam.parse(req.params);
    res.json(await repository.getProduct(id, false));
  });

  // --- Administrador ---------------------------------------------------------------------

  router.get('/admin/categories', ...administrator, async (_req, res) => {
    res.json(await repository.listCategories(true));
  });

  router.post('/admin/categories', ...administrator, write, required, async (req, res) => {
    const body = categoryBody.parse(req.body);
    const id = await repository.createCategory(requireUser(req).idUser, {
      name: body.name,
      description: body.description ?? null,
      parentId: body.parentId ?? null,
    });
    res.status(201).json({ idCategory: id });
  });

  router.put('/admin/categories/:id', ...administrator, write, optional, async (req, res) => {
    const { id } = idParam.parse(req.params);
    const body = categoryBody.parse(req.body);
    await repository.updateCategory(requireUser(req).idUser, id, {
      name: body.name,
      description: body.description ?? null,
      parentId: body.parentId ?? null,
    });
    res.json({ idCategory: id });
  });

  router.delete('/admin/categories/:id', ...administrator, write, optional, async (req, res) => {
    const { id } = idParam.parse(req.params);
    await repository.deactivateCategory(requireUser(req).idUser, id);
    res.status(200).json({ idCategory: id, isActive: false });
  });

  router.get('/admin/products', ...administrator, async (req, res) => {
    const query = searchQuery.parse(req.query);
    res.json(
      await repository.searchProducts({
        query: query.q ?? null,
        categoryId: query.category ?? null,
        minPrice: query.min ?? null,
        maxPrice: query.max ?? null,
        inStockOnly: query.available ?? false,
        includeInactive: true,
        sort: query.sort,
        page: query.page,
        size: query.size,
      }),
    );
  });

  router.get('/admin/products/:id', ...administrator, async (req, res) => {
    const { id } = idParam.parse(req.params);
    res.json(await repository.getProduct(id, true));
  });

  router.post('/admin/products', ...administrator, write, required, async (req, res) => {
    const body = productBody.parse(req.body);
    const id = await repository.createProduct(requireUser(req).idUser, {
      categoryId: body.categoryId,
      name: body.name,
      description: body.description ?? null,
      leadTimeDays: body.leadTimeDays,
    });
    res.status(201).json({ idProduct: id });
  });

  router.put('/admin/products/:id', ...administrator, write, optional, async (req, res) => {
    const { id } = idParam.parse(req.params);
    const body = productBody.parse(req.body);
    await repository.updateProduct(
      requireUser(req).idUser,
      id,
      {
        categoryId: body.categoryId,
        name: body.name,
        description: body.description ?? null,
        leadTimeDays: body.leadTimeDays,
      },
      body.rowVersion == null ? null : Buffer.from(body.rowVersion, 'base64'),
    );
    res.json({ idProduct: id });
  });

  router.delete('/admin/products/:id', ...administrator, write, optional, async (req, res) => {
    const { id } = idParam.parse(req.params);
    await repository.deactivateProduct(requireUser(req).idUser, id);
    res.json({ idProduct: id, isActive: false });
  });

  router.post('/admin/variants', ...administrator, write, required, async (req, res) => {
    const body = variantCreateBody.parse(req.body);
    const id = await repository.createVariant(requireUser(req).idUser, body.productId, {
      sku: body.sku,
      price: body.price,
      attributes: body.attributes ?? null,
    });
    res.status(201).json({ idVariant: id });
  });

  router.put('/admin/variants/:id', ...administrator, write, optional, async (req, res) => {
    const { id } = idParam.parse(req.params);
    const body = variantUpdateBody.parse(req.body);
    await repository.updateVariant(requireUser(req).idUser, id, {
      sku: body.sku,
      isActive: body.isActive,
      attributes: body.attributes ?? null,
    });
    res.json({ idVariant: id });
  });

  router.patch('/admin/variants/:id/price', ...administrator, write, required, async (req, res) => {
    const { id } = idParam.parse(req.params);
    const body = z.object({ price: money }).parse(req.body);
    await repository.changePrice(requireUser(req).idUser, id, body.price);
    res.json({ idVariant: id, price: body.price });
  });

  return router;
}
