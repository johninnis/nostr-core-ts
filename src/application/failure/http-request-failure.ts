/**
 * Transport-layer failure: DNS resolution, connection refused, TLS error, request aborted by its `signal` (a deadline
 * included), a refused private target, response-body stream error, a body over the size ceiling. `message` describes
 * the underlying fault. A body that arrived but does not parse is a `MalformedBodyFailure`, not this.
 */
export interface NetworkFailure {
  readonly type: "network"
  readonly message: string
}

/**
 * Server-reported failure: HTTP status `>= 400` (4xx and 5xx), or a redirect the client refused to follow. For an error
 * status `message` is the response's `x-reason` header if present (the convention used across the `@innis/*` stack for
 * RPC failure context), otherwise the response-body text truncated at 8 KiB; for a redirect it names the `Location`,
 * and `status` is the redirect's — or `0` where a browser hides it behind an opaque redirect.
 */
export interface ServerFailure {
  readonly type: "server"
  readonly status: number
  readonly message: string
}

/**
 * Failure surface of `HttpClient.request` — `NetworkFailure` for transport faults (DNS, abort, TLS, a refused private
 * target), `ServerFailure` for HTTP status `>= 400` or a refused redirect. Discriminate on `type`.
 */
export type HttpRequestFailure = NetworkFailure | ServerFailure
