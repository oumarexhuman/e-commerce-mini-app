let csrfTokenCache: string | null = null;

export class ApiError extends Error {
  constructor(public readonly status: number, public readonly body: unknown) {
    super(typeof body === 'object' && body && 'message' in body
      ? String((body as { message: unknown }).message)
      : `Request failed (${status})`);
  }
}

async function ensureCsrfToken(): Promise<string> {
  if (csrfTokenCache) return csrfTokenCache;
  const res = await fetch('/api/auth/csrf', { credentials: 'include' });
  if (!res.ok) throw new ApiError(res.status, await safeJson(res));
  const data = (await res.json()) as { csrfToken: string };
  csrfTokenCache = data.csrfToken;
  return data.csrfToken;
}

function clearCsrfToken(): void {
  csrfTokenCache = null;
}

async function safeJson(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

async function request<T>(
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  path: string,
  body?: unknown,
): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (method !== 'GET') {
    headers['X-CSRF-Token'] = await ensureCsrfToken();
  }

  const res = await fetch(path, {
    method,
    credentials: 'include',
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    if (res.status === 401 || res.status === 403) clearCsrfToken();
    throw new ApiError(res.status, await safeJson(res));
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
};
