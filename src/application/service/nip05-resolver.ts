import type { HttpClient } from "../port/http.ts"
import { isRecord } from "../../domain/value-object/guards.ts"
import type { Nip05Id } from "../../domain/value-object/nip05-id.ts"
import type { PublicKey } from "../../domain/value-object/public-key.ts"
import { isValidPublicKey } from "../../domain/value-object/public-key.ts"

/** Lookup defaults to 10 s — well-known endpoints that take longer are almost always stalled. */
export const DEFAULT_NIP05_TIMEOUT_MS = 10_000

export interface ResolveNip05Options {
  /** Hard ceiling on the lookup, in milliseconds. Defaults to {@link DEFAULT_NIP05_TIMEOUT_MS}. */
  readonly timeoutMs?: number
  /** Caller-supplied abort signal. Composes with `timeoutMs` — whichever fires first wins. */
  readonly signal?: AbortSignal
}

/**
 * Resolve a NIP-05 identifier to a `PublicKey` by fetching `/.well-known/nostr.json`; returns
 * `null` on any failure (transport, timeout, abort, missing name, malformed pubkey).
 *
 * Per NIP-05 the local-part lookup is case-insensitive: the resolver matches `names` keys against
 * the lowercased local-part rather than indexing the object directly, so a server with
 * case-preserved keys (`{"names": {"Alice": "..."}}`) still resolves a lowercased `Nip05Id`.
 */
export const resolveNip05 = async (
  identifier: Nip05Id,
  httpClient: HttpClient,
  options: ResolveNip05Options = {},
): Promise<PublicKey | null> => {
  const atIndex = identifier.indexOf("@")
  const name = identifier.slice(0, atIndex)
  const domain = identifier.slice(atIndex + 1)

  const url = `https://${domain}/.well-known/nostr.json?name=${encodeURIComponent(name)}`

  const result = await httpClient.request({
    url,
    method: "GET",
    timeoutMs: options.timeoutMs ?? DEFAULT_NIP05_TIMEOUT_MS,
    signal: options.signal,
  })
  if (!result.success) return null

  const body = await result.value.json()
  if (!body.success || !isRecord(body.value)) return null

  const names = body.value.names
  if (!isRecord(names)) return null

  // NIP-05 local-parts are case-insensitive. The `name` slice comes from a `Nip05Id`, which
  // `parseNip05Id` already lowercases — so we only need to lowercase the server-supplied keys.
  let raw: unknown
  for (const [key, value] of Object.entries(names)) {
    if (key.toLowerCase() === name) {
      raw = value
      break
    }
  }
  if (typeof raw !== "string") return null

  const lower = raw.toLowerCase()
  return isValidPublicKey(lower) ? lower : null
}
