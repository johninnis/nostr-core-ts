import { TaggedError } from "../../domain/exception/tagged-error.ts"
import type { Result } from "../../domain/value-object/result.ts"

export interface HttpRequest {
  readonly url: string
  readonly method: string
  readonly headers?: Readonly<Record<string, string>>
  readonly body?: BodyInit
  /**
   * Hard ceiling (milliseconds) on the **headers exchange**. Implementations MUST race a timer
   * against `fetch` and abort if it elapses before the response headers arrive. The timer is
   * released once headers are available — subsequent body reads (`json()` / `text()` / `blob()`)
   * are governed by the underlying stream, not by this deadline. Omit for no timeout.
   */
  readonly timeoutMs?: number
  /**
   * Caller-supplied abort signal. When it fires, the in-flight fetch and any pending body reads
   * MUST be aborted; the call returns `Failure(NetworkError("aborted"))`. Composes with `timeoutMs`
   * — whichever fires first wins.
   */
  readonly signal?: AbortSignal
}

export interface HttpResponse {
  readonly status: number
  readonly headers: Headers
  /**
   * Read and JSON-parse the response body. Stream + parse failures surface as `Failure(NetworkError)`.
   * Single-shot — calling any body reader twice returns `Failure(NetworkError("body stream already read"))`.
   */
  readonly json: () => Promise<Result<unknown, NetworkError>>
  /** Read the response body as a `Blob`. Stream failures surface as `Failure(NetworkError)`. Single-shot. */
  readonly blob: () => Promise<Result<Blob, NetworkError>>
  /** Read the response body as text. Stream failures surface as `Failure(NetworkError)`. Single-shot. */
  readonly text: () => Promise<Result<string, NetworkError>>
}

/**
 * Transport-layer failure: DNS resolution, connection refused, TLS error, request aborted (by
 * caller `signal` or `timeoutMs`), response-body stream error, JSON parse error. Carries the
 * underlying thrown value as `cause` so callers can introspect (e.g. checking for
 * `DOMException` name `"TimeoutError"` vs `"AbortError"`) without parsing the message.
 */
export class NetworkError extends TaggedError<"NetworkError"> {
  constructor(message: string, cause?: unknown) {
    super("NetworkError", message, cause)
  }
}

/**
 * Server-reported failure: HTTP status `>= 400` (4xx and 5xx). `message` is populated from the
 * response's `x-reason` header if present (the convention used across the `@innis/*` stack for
 * RPC error context), otherwise from the response-body text truncated at 8 KiB.
 */
export class ServerError extends TaggedError<"ServerError"> {
  readonly status: number
  constructor(status: number, message: string) {
    super("ServerError", message)
    this.status = status
  }
}

export type HttpRequestError = NetworkError | ServerError

/**
 * Transport boundary for every HTTP-touching service in `@innis/nostr-core` (NIP-05 resolver and
 * verifier, NIP-11 relay-info fetch) and downstream packages (`@innis/blossom` for media uploads,
 * `@innis/relay-management` for NIP-86 admin RPC). One contract, swappable implementations:
 * `createHttpClient()` ships the default `globalThis.fetch` adapter; tests hand-roll an in-memory
 * implementation returning canned responses.
 *
 * **Implementation contract.** All four invariants MUST hold so consumers and tests can rely on
 * the same shape regardless of which `HttpClient` is wired in:
 *
 * - **Transport failure** (DNS, refused, aborted, CORS, network drop) → `Failure(NetworkError)`
 *   with `cause` set to the underlying thrown value.
 * - **HTTP status `>= 400`** (4xx and 5xx) → `Failure(ServerError)` with `status` set and `message`
 *   populated from the `x-reason` response header if present, else from the response-body text
 *   (truncated at 8 KiB so a 4xx with a multi-MB body can't OOM the caller).
 * - **HTTP status `< 400`** (2xx and 3xx) → `Success(HttpResponse)`. The body is unconsumed —
 *   the body readers (`json()` / `text()` / `blob()`) are lazy and single-shot.
 * - **Body readers MUST NOT throw.** Stream and parse failures surface as
 *   `Failure(NetworkError)` from the reader, not via a thrown exception. Calling a reader twice
 *   returns `Failure(NetworkError("body stream already read"))`.
 *
 * Consumers can therefore branch on a single `if (!result.success) return …` without the legacy
 * `status >= 400` second branch. In-memory mocks for tests MUST mirror these invariants — see
 * `tests/http/http.test.ts` for canonical mock shapes.
 */
export interface HttpClient {
  readonly request: (input: HttpRequest) => Promise<Result<HttpResponse, HttpRequestError>>
}
