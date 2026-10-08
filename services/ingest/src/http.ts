import { fetch as undiciFetch } from "undici";

const MAX_ATTEMPTS = 3;
const TIMEOUT_MS = 10_000;

export class HttpStatusError extends Error {
  readonly status: number;
  readonly body: string;

  constructor(status: number, body: string, url: string) {
    super(`status=${status} ${url}`);
    this.name = "HttpStatusError";
    this.status = status;
    this.body = body;
  }
}

function backoffMs(attempt: number): number {
  return 200 * 2 ** (attempt - 1);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

export async function requestJson(
  url: string,
  init: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
    /** 非 200 且不再重试时，打印状态码和响应体后退出。 */
    exitOnHttpError?: boolean;
  } = {},
): Promise<unknown> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      const response = await undiciFetch(url, {
        method: init.method,
        headers: init.headers,
        body: init.body,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!response.ok) {
        const body = await response.text();
        const error = new HttpStatusError(response.status, body, url);
        if (attempt < MAX_ATTEMPTS && isRetryableStatus(response.status)) {
          const wait = backoffMs(attempt);
          console.warn(`[ingest] ${url} status=${response.status}，第 ${attempt}/${MAX_ATTEMPTS} 次，${wait}ms 后重试`);
          lastError = error;
          await sleep(wait);
          continue;
        }
        if (init.exitOnHttpError) {
          console.error(`[ingest] ${url} status=${response.status}`);
          console.error(body);
          process.exit(1);
        }
        throw error;
      }
      return await response.json();
    } catch (error) {
      if (error instanceof HttpStatusError) throw error;
      lastError = error;
      if (attempt >= MAX_ATTEMPTS) break;
      const wait = backoffMs(attempt);
      console.warn(`[ingest] 请求失败，第 ${attempt}/${MAX_ATTEMPTS} 次，${wait}ms 后重试`);
      console.warn(error);
      await sleep(wait);
    }
  }
  throw lastError;
}
