// deno-lint-ignore-file innis/no-catch-in-layer -- `new URL()` signals failure by throwing.

import { base64 } from "@scure/base"
import { DEFAULT_AUTH_EXPIRATION_SECONDS, NIP98_AUTH_HEADER_PREFIX } from "./nip98-builder.ts"
import { sha256Hex } from "./sha256.ts"
import { parseNostrEvent } from "./event-utils.ts"
import { KIND_HTTP_AUTH } from "../value-object/kinds.ts"
import { extractTagValues } from "./tags.ts"
import { verifyEventSignature } from "./verify.ts"
import type { EventId } from "../value-object/event-id.ts"
import type { NostrEvent } from "../value-object/nostr-event.ts"
import type { PublicKey } from "../value-object/public-key.ts"
import type { Result } from "../value-object/result.ts"
import { failure, ok } from "../value-object/result.ts"
import { tryParseJson } from "../value-object/json.ts"
import type { Clock } from "../value-object/timestamp.ts"
import { now } from "../value-object/timestamp.ts"
import { type Nip98ErrorTag, Nip98ValidationError } from "../exception/nip98-validation-error.ts"
import { textDecoder } from "../value-object/text-codec.ts"

const nip98Error = (tag: Nip98ErrorTag, message: string, cause?: unknown): Nip98ValidationError =>
  new Nip98ValidationError(tag, message, cause)

// Lowercase scheme + host; defaults the port for http/https; defaults the path to `/`. Differs from
// `normaliseRelayUrl` (relay URLs are `ws(s)://`, never strip a path, and don't default ports), so
// it's NIP-98-local rather than a shared value-object helper.
const parseAndLowercaseUrl = (raw: string): URL | null => {
  try {
    const parsed = new URL(raw)
    parsed.protocol = parsed.protocol.toLowerCase()
    parsed.hostname = parsed.hostname.toLowerCase()
    return parsed
  } catch {
    return null
  }
}

/** Replay-protection contract the validator depends on — `recordOnce` returns `true` on first sight of `eventId` and `false` on every subsequent sighting within `ttlSeconds`. */
export interface Nip98ReplayGuard {
  readonly recordOnce: (eventId: EventId, ttlSeconds: number) => Promise<boolean>
}

/** Configuration accepted by `createNip98Validator` — required replay guard, optional clock skew tolerance (seconds), and optional clock override. */
export interface Nip98ValidatorOptions {
  readonly replayGuard: Nip98ReplayGuard
  readonly timestampTolerance?: number
  /** Clock used to evaluate `event.created_at` and `expiration`. Defaults to the system clock ({@link now}). */
  readonly clock?: Clock
}

/** Input to `Nip98Validator.validate` — the already-parsed event plus the request context (URL, method, optional precomputed body hash). */
export interface ValidateEventRequest {
  readonly event: NostrEvent
  readonly url: string
  readonly method: string
  readonly bodyHash?: string
}

/** Input to `Nip98Validator.validateAuthHeader` — the raw `Authorization: Nostr <base64>` header plus the request context. The body (if any) is hashed by the validator. */
export interface ValidateAuthHeaderRequest {
  readonly authHeader: string
  readonly url: string
  readonly method: string
  readonly body: string
}

/** Validator returned by `createNip98Validator` — two entry points (already-parsed event, or raw `Authorization` header) that resolve to the verified `PublicKey` on success. */
export interface Nip98Validator {
  readonly validate: (req: ValidateEventRequest) => Promise<Result<PublicKey, Nip98ValidationError>>
  readonly validateAuthHeader: (req: ValidateAuthHeaderRequest) => Promise<Result<PublicKey, Nip98ValidationError>>
}

const MAX_AUTH_HEADER_LENGTH = 4096

const normaliseUrl = (url: string): string | null => {
  const parsed = parseAndLowercaseUrl(url)
  if (!parsed) return null
  const scheme = parsed.protocol.replace(":", "")
  let port = parsed.port
  if ((scheme === "https" && port === "443") || (scheme === "http" && port === "80")) port = ""
  const portPart = port ? `:${port}` : ""
  const path = parsed.pathname || "/"
  return `${scheme}://${parsed.hostname}${portPart}${path}${parsed.search}`
}

const constantTimeEqual = (a: string, b: string): boolean => {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

/** Parse a NIP-98 `Authorization: Nostr <base64-json>` header into its signed event; does not verify the signature. */
export const parseAuthHeader = (header: string): Result<NostrEvent, Nip98ValidationError> => {
  if (header.length > MAX_AUTH_HEADER_LENGTH) {
    return failure(nip98Error("header-too-long", "Authorization header exceeds maximum length"))
  }
  if (!header.startsWith(NIP98_AUTH_HEADER_PREFIX)) {
    return failure(nip98Error("header-bad-prefix", "Invalid Authorization header format"))
  }
  const base64Part = header.slice(NIP98_AUTH_HEADER_PREFIX.length)
  let jsonBytes: Uint8Array
  try {
    jsonBytes = base64.decode(base64Part)
  } catch (err) {
    return failure(nip98Error("header-bad-base64", "Invalid base64 in Authorization header", err))
  }
  const parsedJson = tryParseJson(textDecoder.decode(jsonBytes))
  if (parsedJson === null) {
    return failure(nip98Error("header-bad-json", "Invalid JSON in Authorization header"))
  }
  const event = parseNostrEvent(parsedJson)
  if (!event) {
    return failure(nip98Error("header-bad-event", "Invalid event in Authorization header"))
  }
  return ok(event)
}

/** Build a NIP-98 validator that checks event shape, URL/method/payload binding, signature, and replay (via `replayGuard`). */
export const createNip98Validator = (options: Nip98ValidatorOptions): Nip98Validator => {
  // Tolerance defaults to the builder's `expiresInSeconds` default so a generated event accepted
  // by `buildNip98AuthEvent` (no extra config) is also accepted by `createNip98Validator` (no extra
  // config): tolerance == default lifetime is the spec-recommended floor.
  const tolerance = options.timestampTolerance ?? DEFAULT_AUTH_EXPIRATION_SECONDS
  const replayTtl = tolerance * 2
  const clock = options.clock ?? now

  const validate = async (req: ValidateEventRequest): Promise<Result<PublicKey, Nip98ValidationError>> => {
    const { event, url, method, bodyHash } = req

    if (event.kind !== KIND_HTTP_AUTH) {
      return failure(nip98Error("kind", `Event must be kind ${KIND_HTTP_AUTH}`))
    }

    const currentTime = clock()
    const diff = Math.abs(currentTime - event.created_at)
    if (diff > tolerance) {
      return failure(nip98Error("timestamp", `Event timestamp ${diff}s outside tolerance ${tolerance}s`))
    }

    const expirationValues = extractTagValues(event.tags, "expiration")
    if (expirationValues.length > 1) {
      return failure(nip98Error("expiration-multiple", "Event must contain at most one expiration tag"))
    }
    if (expirationValues.length === 1) {
      const expiresAt = Number(expirationValues[0])
      if (!Number.isSafeInteger(expiresAt)) {
        return failure(nip98Error("expiration-malformed", "Event expiration tag is not a valid Unix-seconds timestamp"))
      }
      if (currentTime >= expiresAt) {
        return failure(nip98Error("expired", `Event expired ${currentTime - expiresAt}s ago`))
      }
    }

    const uTagValues = extractTagValues(event.tags, "u")
    if (uTagValues.length === 0) return failure(nip98Error("u-missing", "Event missing u tag"))
    if (uTagValues.length > 1) return failure(nip98Error("u-multiple", "Event must contain exactly one u tag"))
    const eventUrl = normaliseUrl(uTagValues[0] ?? "")
    const expectedUrl = normaliseUrl(url)
    if (!eventUrl || !expectedUrl) return failure(nip98Error("u-malformed", "Malformed URL"))
    if (eventUrl !== expectedUrl) {
      return failure(nip98Error("u-mismatch", "URL in u tag does not match request URL"))
    }

    const methodValues = extractTagValues(event.tags, "method")
    if (methodValues.length === 0) return failure(nip98Error("method-missing", "Event missing method tag"))
    if (methodValues.length > 1) {
      return failure(nip98Error("method-multiple", "Event must contain exactly one method tag"))
    }
    if ((methodValues[0] ?? "").toUpperCase() !== method.toUpperCase()) {
      return failure(nip98Error("method-mismatch", "Method in method tag does not match request method"))
    }

    const payloadValues = extractTagValues(event.tags, "payload")
    if (payloadValues.length > 1) {
      return failure(nip98Error("payload-multiple", "Event must contain at most one payload tag"))
    }
    // NIP-98: payload tag is only valid for non-empty bodies. Strict-per-spec; see README.
    if (bodyHash === undefined && payloadValues.length > 0) {
      return failure(
        nip98Error("payload-unexpected", "Event contains payload tag but no request body hash was supplied"),
      )
    }
    if (bodyHash !== undefined) {
      if (payloadValues.length === 0) return failure(nip98Error("payload-missing", "Event missing payload tag"))
      if (!constantTimeEqual((payloadValues[0] ?? "").toLowerCase(), bodyHash.toLowerCase())) {
        return failure(nip98Error("payload-mismatch", "Payload hash does not match request body"))
      }
    }

    const sigValid = await verifyEventSignature(event)
    if (!sigValid) return failure(nip98Error("signature", "Event signature is invalid"))

    const recorded = await options.replayGuard.recordOnce(event.id, replayTtl)
    if (!recorded) return failure(nip98Error("replay", "Auth event has already been used"))

    return ok(event.pubkey)
  }

  const validateAuthHeader = async (
    req: ValidateAuthHeaderRequest,
  ): Promise<Result<PublicKey, Nip98ValidationError>> => {
    const parsed = parseAuthHeader(req.authHeader)
    if (!parsed.success) return parsed
    const bodyHash = req.body === "" ? undefined : await sha256Hex(req.body)
    return validate({ event: parsed.value, url: req.url, method: req.method, bodyHash })
  }

  return { validate, validateAuthHeader }
}
