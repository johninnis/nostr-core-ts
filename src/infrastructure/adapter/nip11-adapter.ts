import type { HttpClient, HttpRequestError } from "../../application/port/http.ts"
import { Nip11FetchError } from "../../application/exception/nip11-fetch-error.ts"
import { isRelayInformation, type RelayInformation } from "../../domain/value-object/nip11-info.ts"
import type { Result } from "../../domain/value-object/result.ts"
import { failure, ok } from "../../domain/value-object/result.ts"

/** Lookup defaults to 10 s — the same ceiling as the NIP-05 resolver; info endpoints that take longer are almost always stalled. */
export const DEFAULT_NIP11_TIMEOUT_MS = 10_000

/** Options accepted by `fetchRelayInformation` — lookup timeout and an optional `AbortSignal`. */
export interface FetchRelayInformationOptions {
  /** Hard ceiling on the lookup, in milliseconds. Defaults to {@link DEFAULT_NIP11_TIMEOUT_MS}. */
  readonly timeoutMs?: number
  /** Caller-supplied abort signal. Composes with `timeoutMs` — whichever fires first wins. */
  readonly signal?: AbortSignal
}

/**
 * Fetch the NIP-11 relay information document from `relayHttpUrl` (use `wsToHttp` from the
 * value-object barrel to derive the http URL from a relay's `wss://` URL). Returns the parsed
 * `RelayInformation` on success, or a tagged `Nip11FetchError` distinguishing transport failure
 * (DNS / connection refused / non-2xx status / timeout / abort), body-read failure (stream / JSON
 * parse), and schema mismatch (the server returned JSON but it isn't a NIP-11 document).
 */
export const fetchRelayInformation = async (
  httpClient: HttpClient,
  relayHttpUrl: string,
  options: FetchRelayInformationOptions = {},
): Promise<Result<RelayInformation, Nip11FetchError>> => {
  const result = await httpClient.request({
    url: relayHttpUrl,
    method: "GET",
    headers: { Accept: "application/nostr+json" },
    timeoutMs: options.timeoutMs ?? DEFAULT_NIP11_TIMEOUT_MS,
    signal: options.signal,
  })
  if (!result.success) {
    return failure(new Nip11FetchError("transport", `NIP-11 transport failed: ${result.error.message}`, result.error))
  }
  const body = await result.value.json()
  if (!body.success) {
    const cause: HttpRequestError = body.error
    return failure(new Nip11FetchError("body-read", `NIP-11 body read failed: ${cause.message}`, cause))
  }
  if (!isRelayInformation(body.value)) {
    return failure(
      new Nip11FetchError("schema-mismatch", "NIP-11 response did not match the relay-information schema", {
        body: body.value,
      }),
    )
  }
  return ok(body.value)
}
