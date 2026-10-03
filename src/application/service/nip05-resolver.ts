import type { HttpClient } from "../port/http.ts"
import type { NoAnswerFailure } from "../failure/json-fetch-failure.ts"
import { readJsonDocument } from "./json-document.ts"
import { isRecord } from "../../domain/service/guards.ts"
import { splitInternetIdentifier } from "../../domain/value-object/internet-identifier.ts"
import type { Nip05Id } from "../../domain/value-object/nip05-id.ts"
import type { PublicKey } from "../../domain/value-object/public-key.ts"
import { parsePublicKey } from "../../domain/value-object/public-key.ts"
import type { Result } from "../../domain/value-object/result.ts"
import { failure, ok } from "../../domain/value-object/result.ts"

/**
 * The deadline on a lookup given no signal, 10 s — well-known endpoints that take longer are almost always stalled.
 */
export const DEFAULT_NIP05_TIMEOUT_MS = 10_000

const pubkeyForName = (document: Readonly<Record<string, unknown>>, name: string): PublicKey | null => {
  if (!isRecord(document.names)) return null
  return Object.hasOwn(document.names, name) ? parsePublicKey(document.names[name]) : null
}

// Deliberate: ok(null) is the domain's answer, failure means no answer — see ADR-0015
/**
 * Resolve a NIP-05 identifier to a `PublicKey` by fetching `/.well-known/nostr.json`. `ok(pubkey)` when the server maps
 * the name; `ok(null)` when it answers but does not (no document — a 404 — no such name, or no valid pubkey);
 * `failure(NoAnswerFailure)` when there is no answer to judge (transport failure, timeout, abort, any other error
 * status, a redirect — which NIP-05 says fetchers "MUST ignore" — or a body that is not a JSON object). The name is
 * matched exactly: NIP-05's local-part "MUST only use characters `a-z0-9-_.`", so a document key that differs in case
 * is not that name. `signal` aborts the lookup; given none, it is bounded by {@link DEFAULT_NIP05_TIMEOUT_MS}, and a
 * caller that passes its own signal and wants a deadline too combines them with `AbortSignal.any`.
 */
export const resolveNip05 = async (
  httpClient: HttpClient,
  identifier: Nip05Id,
  signal: AbortSignal = AbortSignal.timeout(DEFAULT_NIP05_TIMEOUT_MS),
): Promise<Result<PublicKey | null, NoAnswerFailure>> => {
  const { name, domain } = splitInternetIdentifier(identifier)

  const document = await readJsonDocument(
    await httpClient.request({
      url: `https://${domain}/.well-known/nostr.json?name=${encodeURIComponent(name)}`,
      method: "GET",
      signal,
    }),
  )
  if (document.success) return ok(pubkeyForName(document.value, name))
  return document.error.type === "not-found" ? ok(null) : failure(document.error)
}
