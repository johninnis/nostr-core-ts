import type { HttpClient } from "../port/http.ts"
import type { JsonFetchFailure } from "../failure/json-fetch-failure.ts"
import { readJsonDocument } from "./json-document.ts"
import { type RelayInformation, relayInformationFrom } from "../../domain/service/nip11-info.ts"
import type { RelayUrl } from "../../domain/value-object/relay-url.ts"
import { wsToHttp } from "../../domain/value-object/relay-url.ts"
import type { Result } from "../../domain/value-object/result.ts"
import { ok } from "../../domain/value-object/result.ts"

/**
 * The deadline on a lookup given no signal, 10 s — the same as the NIP-05 resolver's; info endpoints that take longer
 * are almost always stalled.
 */
export const DEFAULT_NIP11_TIMEOUT_MS = 10_000

const NIP11_MEDIA_TYPE = "application/nostr+json"

/**
 * Fetch the NIP-11 relay information document of `relay` from the relay's own URI under the `http(s)` scheme (NIP-11:
 * "a JSON document over HTTP, on the same URI as the relay's websocket"), asking for `application/nostr+json`. Returns
 * the parsed `RelayInformation`, `not-found` when the relay answers 404, or `no-answer` for any other failure,
 * including a body that is not a JSON object. `signal` aborts the lookup; given none, it is bounded by
 * {@link DEFAULT_NIP11_TIMEOUT_MS}. A relay at a private address is reached only through a client built to reach one,
 * which the host uses only for a relay its user chose.
 */
export const fetchRelayInformation = async (
  httpClient: HttpClient,
  relay: RelayUrl,
  signal: AbortSignal = AbortSignal.timeout(DEFAULT_NIP11_TIMEOUT_MS),
): Promise<Result<RelayInformation, JsonFetchFailure>> => {
  const document = await readJsonDocument(
    await httpClient.request({ url: wsToHttp(relay), method: "GET", headers: { Accept: NIP11_MEDIA_TYPE }, signal }),
  )
  return document.success ? ok(relayInformationFrom(document.value)) : document
}
