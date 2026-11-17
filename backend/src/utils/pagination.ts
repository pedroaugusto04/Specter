import {
  PAGINATION_DEFAULT_PAGE_SIZE,
  PAGINATION_MAX_PAGE_SIZE,
  type PaginationMeta,
} from '@specter/contracts';
import { z } from 'zod';

export function createPaginationQuerySchema(
  defaultPageSize: number = PAGINATION_DEFAULT_PAGE_SIZE
) {
  return z.object({
    page: z.coerce.number().int().min(1, 'Page must be at least 1').default(1),
    pageSize: z.coerce
      .number()
      .int()
      .min(1, 'Page size must be at least 1')
      .max(PAGINATION_MAX_PAGE_SIZE, `Page size cannot exceed ${PAGINATION_MAX_PAGE_SIZE}`)
      .default(defaultPageSize),
  });
}

export function createPaginationMeta(
  page: number,
  pageSize: number,
  totalItems: number
): PaginationMeta {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const safePage = Math.min(page, totalPages);
  return {
    page: safePage,
    pageSize,
    totalItems,
    totalPages,
    hasNextPage: safePage < totalPages,
    hasPrevPage: safePage > 1,
  };
}

export interface PageResult<T> {
  items: T[];
  totalItems: number;
}

export async function resolvePageResult<T, TPage extends PageResult<T>>(
  page: number,
  pageSize: number,
  result: TPage,
  fetchPage: (page: number) => Promise<TPage>
): Promise<TPage & { pagination: PaginationMeta }> {
  const pagination = createPaginationMeta(page, pageSize, result.totalItems);
  const resolved = pagination.page === page ? result : await fetchPage(pagination.page);
  return { ...resolved, pagination };
}
