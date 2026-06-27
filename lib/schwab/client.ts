import { getValidToken } from './tokenManager';

const BASE = 'https://api.schwabapi.com';

export async function schwabFetch(path: string, opts: RequestInit = {}): Promise<Response> {
  const token = await getValidToken();
  return fetch(`${BASE}${path}`, {
    ...opts,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/json',
      ...(opts.headers ?? {}),
    },
  });
}
