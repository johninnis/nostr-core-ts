import { errorMessage } from "../../domain/service/error-utils.ts"
import { failure, ok } from "../../domain/value-object/result.ts"
import type { Result } from "../../domain/value-object/result.ts"
import { textDecoder } from "../../domain/value-object/text-codec.ts"
import type { HttpClient, HttpRequest, HttpRequestError, HttpResponse } from "../../application/port/http.ts"
import { NetworkError, ServerError } from "../../application/port/http.ts"

/** Cap on the body slurped to populate `ServerError.message` so a 4xx with a 50MB body can't OOM the caller. */
const ERROR_BODY_BYTE_LIMIT = 8 * 1024

const NO_CLEANUP = (): void => {}

const wrapNetwork = async <T>(fn: () => Promise<T>): Promise<Result<T, NetworkError>> => {
  try {
    return ok(await fn())
  } catch (error: unknown) {
    return failure(new NetworkError(abortReasonMessage(error), error))
  }
}

/** Prefer the abort `reason` string (often a typed `DOMException` from the caller's controller) over a generic engine message. */
const abortReasonMessage = (error: unknown): string => {
  if (error instanceof DOMException && (error.name === "AbortError" || error.name === "TimeoutError")) {
    return error.message || error.name
  }
  return errorMessage(error)
}

/**
 * Combine `signal` (caller-supplied) and a `timeoutMs` deadline into a single `AbortSignal` plus an
 * **idempotent** cleanup function. Cleanup clears the timer AND detaches the listener from the
 * caller's signal — important when callers reuse a long-lived signal across requests, otherwise
 * each request would leak its listener for the lifetime of that signal.
 */
const composeAbort = (signal: AbortSignal | undefined, timeoutMs: number | undefined): {
  readonly signal: AbortSignal | undefined
  readonly cleanup: () => void
} => {
  if (signal === undefined && timeoutMs === undefined) return { signal: undefined, cleanup: NO_CLEANUP }
  const controller = new AbortController()
  // Already-aborted signal: short-circuit. The upcoming `fetch()` will reject synchronously, so
  // attaching a listener or scheduling a timer would only create work for `cleanup` to undo.
  if (signal?.aborted) {
    controller.abort(signal.reason)
    return { signal: controller.signal, cleanup: NO_CLEANUP }
  }
  const onAbort = (): void => controller.abort(signal?.reason)
  if (signal) signal.addEventListener("abort", onAbort, { once: true })
  const timer = timeoutMs !== undefined
    ? setTimeout(() => controller.abort(new DOMException("request timed out", "TimeoutError")), timeoutMs)
    : null
  let cleaned = false
  const cleanup = (): void => {
    if (cleaned) return
    cleaned = true
    if (timer !== null) clearTimeout(timer)
    signal?.removeEventListener("abort", onAbort)
  }
  return { signal: controller.signal, cleanup }
}

/**
 * Wrap the `Response` body readers behind the `HttpResponse` interface. Cleanup has already fired
 * by the time the wrapper is built — once `fetch()` returns headers, the composed abort signal
 * can no longer cancel the body read (that's handled by the underlying `Response.body` stream
 * itself), so keeping the listener attached would only leak.
 */
const toHttpResponse = (response: Response): HttpResponse => ({
  status: response.status,
  headers: response.headers,
  json: () => wrapNetwork(() => response.json()),
  blob: () => wrapNetwork(() => response.blob()),
  text: () => wrapNetwork(() => response.text()),
})

/** Slurp the error-body up to {@link ERROR_BODY_BYTE_LIMIT} (counted in bytes, not chars) so a 4xx with a huge body can't OOM the caller. */
const readErrorBody = async (response: Response): Promise<string> => {
  const reason = response.headers.get("x-reason")
  if (reason !== null) return reason
  if (!response.body) return ""
  const reader = response.body.getReader()
  const chunks: Array<Uint8Array> = []
  let totalBytes = 0
  try {
    while (totalBytes < ERROR_BODY_BYTE_LIMIT) {
      const { value, done } = await reader.read()
      if (done) break
      const remaining = ERROR_BODY_BYTE_LIMIT - totalBytes
      const slice = value.byteLength <= remaining ? value : value.subarray(0, remaining)
      chunks.push(slice)
      totalBytes += slice.byteLength
    }
  } catch {
    // ignore — best-effort error message
  } finally {
    void reader.cancel()
  }
  if (chunks.length === 0) return ""
  const concatenated = new Uint8Array(totalBytes)
  let offset = 0
  for (const chunk of chunks) {
    concatenated.set(chunk, offset)
    offset += chunk.byteLength
  }
  return textDecoder.decode(concatenated)
}

/** Options accepted by `createHttpClient`; pass `fetch` to override the global for tests or a custom transport. */
export interface CreateHttpClientOptions {
  /** Custom fetch implementation. Defaults to `globalThis.fetch` bound to `globalThis`. */
  readonly fetch?: typeof globalThis.fetch
}

/** Build an `HttpClient` backed by `globalThis.fetch` (or a caller-supplied `fetch`); maps thrown errors to `NetworkError` and `status >= 400` to `ServerError`. */
export const createHttpClient = (options: CreateHttpClientOptions = {}): HttpClient => {
  const fetchImpl = options.fetch ?? globalThis.fetch.bind(globalThis)
  return {
    request: async (input: HttpRequest): Promise<Result<HttpResponse, HttpRequestError>> => {
      const abort = composeAbort(input.signal, input.timeoutMs)
      let response: Response
      try {
        response = await fetchImpl(input.url, {
          method: input.method,
          headers: input.headers,
          body: input.body,
          signal: abort.signal,
        })
      } catch (error: unknown) {
        abort.cleanup()
        return failure(new NetworkError(abortReasonMessage(error), error))
      }
      abort.cleanup()
      if (response.status >= 400) {
        const reason = await readErrorBody(response)
        return failure(new ServerError(response.status, reason))
      }
      return ok(toHttpResponse(response))
    },
  }
}
