import { decodeBase64, decodeBase64UrlUnpadded } from "./base64.ts"
import { base64, base64urlnopad } from "@scure/base"
import { serialiseEvent } from "./event-json.ts"
import { parseNostrEvent } from "./event-utils.ts"
import type { NostrEvent } from "../value-object/nostr-event.ts"
import type { Result } from "../value-object/result.ts"
import { failure, ok } from "../value-object/result.ts"
import { parseJson } from "./json.ts"
import type { AuthHeaderDecodeFailure } from "../failure/auth-header-decode-failure.ts"
import { decodeUtf8, textEncoder } from "./text-codec.ts"

/** Prefix marking a NIP-98 or Blossom `Authorization` header value; the bytes after it are base64-encoded JSON. */
export const NIP98_AUTH_HEADER_PREFIX = "Nostr "

const MAX_AUTH_HEADER_LENGTH = 4096

type Base64Decoder = (encoded: string) => Uint8Array | null

// Deliberate: no header is written that the parser below would refuse for its length — see shared ADR-0106
const headerWithin4096Characters = (credentials: string): string | null => {
  const header = `${NIP98_AUTH_HEADER_PREFIX}${credentials}`
  return header.length > MAX_AUTH_HEADER_LENGTH ? null : header
}

/**
 * Encode a signed NIP-98 auth event as the `Authorization: Nostr <base64-json>` header value, the JSON being its seven
 * NIP-01 fields ({@link serialiseEvent}) in padded standard base64, or `null` when that header would be longer than the
 * 4096 characters {@link parseAuthHeader} reads.
 */
export const encodeAuthHeader = (event: NostrEvent): string | null =>
  headerWithin4096Characters(base64.encode(textEncoder.encode(serialiseEvent(event))))

/**
 * Encode a signed Blossom authorisation event (kind 24242) as the `Authorization: Nostr <base64url-json>` header value
 * BUD-11 specifies, the JSON being its seven NIP-01 fields ({@link serialiseEvent}) in base64url without padding, or
 * `null` when that header would be longer than the 4096 characters {@link parseBlossomAuthHeader} reads.
 */
export const encodeBlossomAuthHeader = (event: NostrEvent): string | null =>
  headerWithin4096Characters(base64urlnopad.encode(textEncoder.encode(serialiseEvent(event))))

const hasNostrScheme = (header: string): boolean =>
  header.slice(0, NIP98_AUTH_HEADER_PREFIX.length).toLowerCase() === NIP98_AUTH_HEADER_PREFIX.toLowerCase()

const parseCredentials = (header: string, decode: Base64Decoder): Result<NostrEvent, AuthHeaderDecodeFailure> => {
  if (header.length > MAX_AUTH_HEADER_LENGTH) {
    return failure("header-too-long")
  }
  if (!hasNostrScheme(header)) {
    return failure("header-bad-prefix")
  }
  const jsonBytes = decode(header.slice(NIP98_AUTH_HEADER_PREFIX.length))
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

/**
 * Parse a NIP-98 `Authorization: Nostr <base64-json>` header into its signed event; does not verify the signature. The
 * `Nostr` scheme token matches in any case; everything after it is read exactly, as canonical padded standard base64,
 * and credentials that are not valid UTF-8 JSON are `header-bad-json`. A Blossom header is read by
 * {@link parseBlossomAuthHeader}.
 */
export const parseAuthHeader = (header: string): Result<NostrEvent, AuthHeaderDecodeFailure> =>
  parseCredentials(header, decodeBase64)

const decodeBlossomCredentials: Base64Decoder = (encoded) => decodeBase64UrlUnpadded(encoded) ?? decodeBase64(encoded)

// Deliberate: BUD-11 writes unpadded base64url, and the padded base64 every Blossom client wrote before it is still read — see ADR-0039
/**
 * Parse a Blossom `Authorization: Nostr <base64url-json>` header (BUD-11) into its signed event; does not verify the
 * signature. The credentials are read as canonical base64url without padding, the form BUD-11 specifies, or as
 * canonical padded standard base64, the form Blossom clients wrote before it; any other spelling is
 * `header-bad-base64`. Otherwise as {@link parseAuthHeader}.
 */
export const parseBlossomAuthHeader = (header: string): Result<NostrEvent, AuthHeaderDecodeFailure> =>
  parseCredentials(header, decodeBlossomCredentials)
