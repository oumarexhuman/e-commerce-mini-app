'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { AuthenticatedUser } from '@/lib/types';

export default function HomePage() {
  const router = useRouter();
  const { data, isLoading, isError } = useQuery<AuthenticatedUser>({
    queryKey: ['me'],
    queryFn: () => api.get('/api/auth/me'),
    retry: false,
  });

  useEffect(() => {
    if (isLoading) return;
    router.replace(isError || !data ? '/login' : '/products');
  }, [isLoading, isError, data, router]);

  return (
    <main className="grid min-h-screen place-items-center">
      <p className="text-sm text-slate-500">Loading…</p>
    </main>
  );
}
