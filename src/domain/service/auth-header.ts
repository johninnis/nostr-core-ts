import { decodeBase64 } from "./base64.ts"
import { base64 } from "@scure/base"
import { serialiseEvent } from "./event-json.ts"
import { parseNostrEvent } from "./event-utils.ts"
import type { NostrEvent } from "../value-object/nostr-event.ts"
import type { Result } from "../value-object/result.ts"
import { failure, ok } from "../value-object/result.ts"
import { parseJson } from "./json.ts"
import type { AuthHeaderDecodeFailure } from "../failure/auth-header-decode-failure.ts"
import { decodeUtf8, textEncoder } from "./text-codec.ts"

/** Prefix marking a NIP-98 `Authorization` header value; the bytes after it are base64-encoded JSON. */
export const NIP98_AUTH_HEADER_PREFIX = "Nostr "

const MAX_AUTH_HEADER_LENGTH = 4096

// Deliberate: no header is written that the parser below would refuse for its length — see shared ADR-0106
/**
 * Encode a signed NIP-98 auth event as the `Authorization: Nostr <base64-json>` header value, the JSON being its seven
 * NIP-01 fields ({@link serialiseEvent}), or `null` when that header would be longer than the 4096 characters
 * {@link parseAuthHeader} reads.
 */
export const encodeAuthHeader = (event: NostrEvent): string | null => {
  const header = `${NIP98_AUTH_HEADER_PREFIX}${base64.encode(textEncoder.encode(serialiseEvent(event)))}`
  return header.length > MAX_AUTH_HEADER_LENGTH ? null : header
}

const hasNostrScheme = (header: string): boolean =>
  header.slice(0, NIP98_AUTH_HEADER_PREFIX.length).toLowerCase() === NIP98_AUTH_HEADER_PREFIX.toLowerCase()

/**
 * Parse an `Authorization: Nostr <base64-json>` header (NIP-98, and Blossom's BUD auth) into its signed event; does not
 * verify the signature. The `Nostr` scheme token matches in any case; everything after it is read exactly, and
 * credentials that are not valid UTF-8 JSON are `header-bad-json`.
 */
export const parseAuthHeader = (header: string): Result<NostrEvent, AuthHeaderDecodeFailure> => {
  if (header.length > MAX_AUTH_HEADER_LENGTH) {
    return failure("header-too-long")
  }
  if (!hasNostrScheme(header)) {
    return failure("header-bad-prefix")
  }
  const base64Part = header.slice(NIP98_AUTH_HEADER_PREFIX.length)
  const jsonBytes = decodeBase64(base64Part)
  if (jsonBytes === null) return failure("header-bad-base64")
  const json = decodeUtf8(jsonBytes)
  const parsedJson = json === null ? null : parseJson(json)
  if (parsedJson === null || !parsedJson.success) {
    return failure("header-bad-json")
  }
  const event = parseNostrEvent(parsedJson.value)
  if (!event) {
    return failure("header-bad-event")
  }
  return ok(event)
}
