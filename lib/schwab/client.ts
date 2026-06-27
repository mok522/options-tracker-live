import { getValidToken } from './tokenManager';
import { fetchWithTimeout } from './http';

const BASE = 'https://api.schwabapi.com';

export async function schwabFetch(path: string, opts: RequestInit = {}): Promise<Response> {
  const token = await getValidToken();
  return fetchWithTimeout(`${BASE}${path}`, {
    ...opts,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/json',
      ...(opts.headers ?? {}),
    },
  });
}
