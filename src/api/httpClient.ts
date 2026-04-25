import { MotiSigApiError } from '../errors';
import { logger } from '../internal/logger';

export interface MotiSigHttpClientOptions {
  baseUrl: string;
  sdkKey: string;
  projectId: string;
  /** Optional bearer or other auth (not used by default MotiSig client API). */
  getAuthToken?: () => Promise<string | null>;
}

interface JsonResult<T> {
  ok: boolean;
  status: number;
  data: T;
}

async function parseJsonSafe(text: string): Promise<unknown> {
  if (!text) return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

export class MotiSigHttpClient {
  private readonly baseUrl: string;
  private readonly sdkKey: string;
  private readonly projectId: string;
  private readonly getAuthToken?: () => Promise<string | null>;

  constructor(options: MotiSigHttpClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, '');
    this.sdkKey = options.sdkKey;
    this.projectId = options.projectId;
    this.getAuthToken = options.getAuthToken;
  }

  private async headers(): Promise<Record<string, string>> {
    const h: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-API-Key': this.sdkKey,
      'X-Project-ID': this.projectId,
    };
    if (this.getAuthToken) {
      const t = await this.getAuthToken();
      if (t) h.Authorization = `Bearer ${t}`;
    }
    return h;
  }

  private url(path: string): string {
    const p = path.startsWith('/') ? path : `/${path}`;
    return `${this.baseUrl}${p}`;
  }

  async request<T = unknown>(
    method: string,
    path: string,
    body?: unknown
  ): Promise<JsonResult<T>> {
    const init: RequestInit = {
      method,
      headers: await this.headers(),
    };
    if (body !== undefined && method !== 'GET') {
      init.body = JSON.stringify(body);
    }
    let res: Response;
    try {
      res = await fetch(this.url(path), init);
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Network request failed';
      logger.warn('http request failed', { method, path, message });
      throw new MotiSigApiError(message, 0);
    }
    const text = await res.text();
    const data = (await parseJsonSafe(text)) as T;
    const ok = res.status >= 200 && res.status < 300;
    logger.debug('http response', { method, path, status: res.status });
    return { ok, status: res.status, data };
  }

  assertOk<T>(res: JsonResult<T>): T {
    if (res.ok) return res.data;
    const msg =
      typeof res.data === 'object' &&
      res.data !== null &&
      'error' in res.data &&
      typeof (res.data as { error?: string }).error === 'string'
        ? (res.data as { error: string }).error
        : `Request failed: ${res.status}`;
    throw new MotiSigApiError(msg, res.status, res.data);
  }
}
