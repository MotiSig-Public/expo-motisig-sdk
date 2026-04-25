import { DEFAULT_MOTISIG_BASE_URL } from '../constants/defaultBaseUrl';

function trimTrailingSlash(url: string): string {
  return url.replace(/\/$/, '');
}

/**
 * API base URL: non-empty `baseURL` argument, else `EXPO_PUBLIC_MOTISIG_BASE_URL` (Expo / Metro), else default.
 */
export function resolveClientBaseUrl(explicit?: string): string {
  const fromArg = typeof explicit === 'string' ? explicit.trim() : '';
  if (fromArg !== '') {
    return trimTrailingSlash(fromArg);
  }
  const fromEnv =
    typeof process !== 'undefined' && process.env
      ? String(process.env.EXPO_PUBLIC_MOTISIG_BASE_URL ?? '').trim()
      : '';
  if (fromEnv !== '') {
    return trimTrailingSlash(fromEnv);
  }
  return trimTrailingSlash(DEFAULT_MOTISIG_BASE_URL);
}
