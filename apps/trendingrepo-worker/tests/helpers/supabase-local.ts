// Optional helper for tests that need a live Postgres. Tests using this
// should self-skip when the local stack isn't running so `npm test` works
// on machines without Docker.

import { execSync } from 'node:child_process';

export async function isSupabaseLocalUp(): Promise<boolean> {
  try {
    const out = execSync('npx supabase status -o env', {
      stdio: ['ignore', 'pipe', 'ignore'],
      cwd: new URL('../../', import.meta.url).pathname.replace(/^\/([A-Z]:)/i, '$1'),
      timeout: 5000,
    }).toString();
    return out.includes('SUPABASE_URL');
  } catch {
    return false;
  }
}

export interface SupabaseLocalEnv {
  url: string;
  serviceRole: string;
  anonKey: string;
}

export async function readSupabaseLocalEnv(): Promise<SupabaseLocalEnv | null> {
  if (!(await isSupabaseLocalUp())) return null;
  const out = execSync('npx supabase status -o env', {
    stdio: ['ignore', 'pipe', 'ignore'],
    cwd: new URL('../../', import.meta.url).pathname.replace(/^\/([A-Z]:)/i, '$1'),
  }).toString();
  const map = new Map<string, string>();
  for (const line of out.split(/\r?\n/)) {
    const m = /^([A-Z_]+)="?([^"]+)"?$/.exec(line);
    if (m && m[1] && m[2]) map.set(m[1], m[2]);
  }
  const url = map.get('API_URL') ?? map.get('SUPABASE_URL');
  const serviceRole = map.get('SERVICE_ROLE_KEY') ?? map.get('SUPABASE_SERVICE_ROLE');
  const anonKey = map.get('ANON_KEY') ?? map.get('SUPABASE_ANON_KEY');
  if (!url || !serviceRole || !anonKey) return null;
  return { url, serviceRole, anonKey };
}
