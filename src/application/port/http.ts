import type { HttpRequestFailure, NetworkFailure } from "../failure/http-request-failure.ts"
import type { MalformedBodyFailure } from "../failure/malformed-body-failure.ts"
import type { Result } from "../../domain/value-object/result.ts"
import type { JsonValue } from "../../domain/value-object/json-serialisable.ts"

/**
 * Input shape for `HttpClient.request` — URL, method, optional headers/body, an optional abort `signal`, and the
 * request's policy for what it fetches (`followRedirectTo`, `maxBodyBytes`), each safe when omitted.
 */
export interface HttpRequest {
  readonly url: string
  readonly method: string
  readonly headers?: Readonly<Record<string, string>> | undefined
  readonly body?: BodyInit | undefined
  /**
   * Aborts the whole exchange, headers **and** body: when it fires, the in-flight request and any pending body read
   * (`json()` / `text()` / `blob()`) are aborted and fail with `NetworkFailure`. A deadline is a signal like any other
   * — `AbortSignal.timeout(ms)`, or `AbortSignal.any([...])` to combine one with the caller's own. Omit for no abort.
   */
  readonly signal?: AbortSignal | undefined
  /**
   * Follow a redirect when the URL it finally lands on satisfies this predicate; a landing URL it rejects fails the
   * request with `NetworkFailure`. Omit to refuse every redirect — the only choice for a fetch whose protocol forbids
   * them, such as NIP-05.
   */
  readonly followRedirectTo?: ((url: string) => boolean) | undefined
  /**
   * Ceiling, in bytes, on a successful body; a larger one fails its reader with `NetworkFailure`. Omit for the
   * implementation's default, 16 MiB in `createHttpClient`, sized for JSON documents.
   */
  readonly maxBodyBytes?: number | undefined
}

/**
 * Successful response shape returned by `HttpClient.request` — `status`, `headers`, and three lazy single-shot body
 * readers (`json`, `text`, `blob`) that surface stream and size failures as `Failure(NetworkFailure)`, and a body
 * `json` cannot read as UTF-8 JSON as `Failure(MalformedBodyFailure)`, rather than throwing.
 */
export interface HttpResponse {
  readonly status: number
  readonly headers: Headers
  /**
   * Read the response body as strict UTF-8 and JSON-parse it. Stream and size failures surface as
   * `Failure(NetworkFailure)`; a body that is not UTF-8, or not JSON, as `Failure(MalformedBodyFailure)`. Single-shot —
   * calling any body reader twice returns `Failure(NetworkFailure)` with the message `"body stream already read"`.
   */
  readonly json: () => Promise<Result<JsonValue, NetworkFailure | MalformedBodyFailure>>
  /** Read the response body as a `Blob`. Stream and size failures surface as `Failure(NetworkFailure)`. Single-shot. */
  readonly blob: () => Promise<Result<Blob, NetworkFailure>>
  /**
   * Read the response body as display text, decoded as `Response.text()` decodes it: a byte that is not UTF-8 becomes
   * U+FFFD. Stream and size failures surface as `Failure(NetworkFailure)`. Single-shot.
   */
  readonly text: () => Promise<Result<string, NetworkFailure>>
}

// Deliberate: the URL is attacker-influenced, so every policy defaults to its safest — see ADR-0026, ADR-0032
/**
 * Transport boundary for every HTTP-touching service in `@innis/nostr-core` (the NIP-05 resolver and verifier and the
 * NIP-11 fetch) and downstream packages (`@innis/nostr-blossom` for media, `@innis/nostr-relay-management` for NIP-86
 * admin RPC). One contract, swappable implementations: `createHttpClient()` ships the default `fetch`-backed client;
 * tests hand-roll an in-memory implementation returning canned responses.
 *
 * **Implementation contract.** These invariants MUST hold so consumers and tests can rely on the same shape regardless
 * of which `HttpClient` is wired in:
 *
 * - **Transport failure** (DNS, refused, aborted, CORS, network drop) → `Failure(NetworkFailure)` with `message`
 *   describing the underlying thrown value.
 * - **Redirects are refused unless the request follows them.** Without `followRedirectTo`, a redirect — a 301, 302,
 *   303, 307 or 308, or a browser's opaque redirect — → `Failure(ServerFailure)` with its `status`: NIP-05 requires it
 *   ("Fetchers MUST ignore any HTTP redirects"), and following one would let a public URL steer the request to a
 *   private address. With it, a redirect is followed and a landing URL the predicate rejects →
 *   `Failure(NetworkFailure)`.
 * - **HTTP status `>= 400`** (4xx and 5xx) → `Failure(ServerFailure)` with `status` set and `message` populated from
 *   the `x-reason` response header if present, else from the response-body text (truncated at 8 KiB so a 4xx with a
 *   multi-MB body can't OOM the caller).
 * - **Any other status below 400** (2xx, or a 3xx that is not a redirect, such as `304 Not Modified`) →
 *   `Success(HttpResponse)` with its `status`. The body is unconsumed — the body readers (`json()` / `text()` /
 *   `blob()`) are lazy and single-shot.
 * - **Successful bodies are bounded.** A body larger than the request's `maxBodyBytes`, or the implementation's default
 *   when it has none, fails its reader with `Failure(NetworkFailure)` instead of being buffered.
 * - **Private targets are refused unless the client is built to reach them.** A client for targets someone else names
 *   must not send a request to a private, loopback or link-local address that the URL names, and must not hand its
 *   caller the answer from one a followed redirect lands on: that redirect is followed before its landing URL can be
 *   judged, so the address is reached and its answer discarded (ADR-0026). A host that also requests targets its user
 *   chose holds a second client for them. `createHttpClient` refuses such literal addresses unless built with
 *   `"allow-private"`; a DNS name that resolves to one is the host's to police.
 * - **Abort** — the request's `signal`, a deadline included — cancels the request and any pending body read alike.
 * - **Body readers MUST NOT throw.** Stream and size failures surface as `Failure(NetworkFailure)` from the reader, and
 *   a body `json()` cannot read as UTF-8 JSON as `Failure(MalformedBodyFailure)`, not via a thrown exception. Calling a
 *   reader twice returns `Failure(NetworkFailure)` with the message `"body stream already read"`.
 *
 * Consumers can therefore branch on a single `if (!result.success) return …` without a second status branch. An
 * in-memory test double MUST mirror the result shapes.
 */
export interface HttpClient {
  readonly request: (input: HttpRequest) => Promise<Result<HttpResponse, HttpRequestFailure>>
}
