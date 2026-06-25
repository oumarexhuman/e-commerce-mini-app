'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useVirtualizer } from '@tanstack/react-virtual';
import { api, ApiError } from '@/lib/api';
import type { AuthenticatedUser, Product, ProductPage } from '@/lib/types';

const PAGE_SIZE_OPTIONS = [5, 10, 20, 30, 50] as const;
const DEFAULT_PAGE_SIZE = 20;

function formatPrice(cents: number, currency: string): string {
  return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(cents / 100);
}

export default function ProductsPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [pageSize, setPageSize] = useState<number>(DEFAULT_PAGE_SIZE);

  const meQuery = useQuery<AuthenticatedUser>({
    queryKey: ['me'],
    queryFn: () => api.get('/api/auth/me'),
    retry: false,
  });

  useEffect(() => {
    if (meQuery.isError) router.replace('/login');
  }, [meQuery.isError, router]);

  const products = useInfiniteQuery<ProductPage>({
    queryKey: ['products', pageSize],
    enabled: meQuery.isSuccess,
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    queryFn: async ({ pageParam }) => {
      const params = new URLSearchParams({ limit: String(pageSize) });
      if (pageParam) params.set('cursor', pageParam as string);
      return api.get(`/api/products?${params.toString()}`);
    },
  });

  const items: Product[] = useMemo(
    () => products.data?.pages.flatMap((p) => p.items) ?? [],
    [products.data],
  );

  const parentRef = useRef<HTMLDivElement | null>(null);
  const virtualizer = useVirtualizer({
    count: products.hasNextPage ? items.length + 1 : items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 96,
    overscan: 6,
  });

  const virtualItems = virtualizer.getVirtualItems();

  useEffect(() => {
    const last = virtualItems.at(-1);
    if (!last) return;
    if (
      last.index >= items.length - 1 &&
      products.hasNextPage &&
      !products.isFetchingNextPage
    ) {
      products.fetchNextPage();
    }
  }, [virtualItems, items.length, products]);

  const logout = useMutation({
    mutationFn: () => api.post('/api/auth/logout'),
    onSuccess: () => {
      queryClient.clear();
      router.replace('/login');
    },
  });

  if (meQuery.isLoading) {
    return (
      <main className="grid min-h-screen place-items-center">
        <p className="text-sm text-slate-500">Loading…</p>
      </main>
    );
  }

  if (!meQuery.data) {
    return null;
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-4xl flex-col px-4 py-6">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3 border-b border-slate-200 pb-4 dark:border-slate-800">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Catalogue</h1>
          <p className="text-sm text-slate-500">
            Signed in as <span className="font-medium">{meQuery.data.displayName}</span>
            <span className="mx-1">·</span>
            <span className="text-slate-400">{meQuery.data.email}</span>
          </p>
        </div>
        <div className="flex items-center gap-3">
          <label htmlFor="pageSize" className="text-sm text-slate-600 dark:text-slate-300">
            Page size
          </label>
          <select
            id="pageSize"
            value={pageSize}
            onChange={(e) => {
              setPageSize(Number(e.target.value));
              queryClient.removeQueries({ queryKey: ['products'] });
            }}
            className="rounded-md border border-slate-300 bg-white px-2 py-1 text-sm dark:border-slate-700 dark:bg-slate-950"
          >
            {PAGE_SIZE_OPTIONS.map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
          <button
            onClick={() => logout.mutate()}
            className="rounded-md border border-slate-300 px-3 py-1 text-sm text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            Sign out
          </button>
        </div>
      </header>

      {products.isError && !(products.error instanceof ApiError && products.error.status === 401) && (
        <p role="alert" className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
          Failed to load products.
        </p>
      )}

      <div
        ref={parentRef}
        className="relative h-[calc(100vh-180px)] overflow-auto rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
      >
        <div style={{ height: virtualizer.getTotalSize(), width: '100%', position: 'relative' }}>
          {virtualItems.map((vi) => {
            const isLoaderRow = vi.index > items.length - 1;
            const product = items[vi.index];
            return (
              <div
                key={vi.key}
                ref={virtualizer.measureElement}
                data-index={vi.index}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  transform: `translateY(${vi.start}px)`,
                }}
                className="border-b border-slate-100 px-4 py-3 dark:border-slate-800"
              >
                {isLoaderRow ? (
                  <p className="py-2 text-center text-sm text-slate-400">
                    {products.isFetchingNextPage
                      ? 'Loading more…'
                      : products.hasNextPage
                        ? 'Scroll for more'
                        : 'End of list'}
                  </p>
                ) : product ? (
                  <article className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <h2 className="truncate text-sm font-medium">{product.name}</h2>
                      <p className="mt-0.5 line-clamp-2 text-xs text-slate-500">{product.description}</p>
                    </div>
                    <p className="shrink-0 text-sm font-semibold tabular-nums">
                      {formatPrice(product.priceCents, product.currency)}
                    </p>
                  </article>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>

      <p className="mt-3 text-xs text-slate-400">
        {items.length} loaded {products.isFetchingNextPage ? '· fetching…' : ''}
      </p>
    </main>
  );
}
