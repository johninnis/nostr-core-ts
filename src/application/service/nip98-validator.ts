import type { Nip98ReplayGuard } from "../port/nip98-replay-guard.ts"
import type { AuthHeaderDecodeFailure } from "../../domain/failure/auth-header-decode-failure.ts"
import type { Nip98ValidationFailure } from "../../domain/failure/nip98-validation-failure.ts"
import { parseAuthHeader } from "../../domain/service/auth-header.ts"
import type { ValidateEventRequest } from "../../domain/service/nip98-event-check.ts"
import { checkNip98Event } from "../../domain/service/nip98-event-check.ts"
import { sha256Hex } from "../../domain/service/sha256.ts"
import type { Clock } from "../../domain/service/timestamp.ts"
import { now } from "../../domain/service/timestamp.ts"
import { InvalidArgumentError } from "../../domain/exception/invalid-argument-error.ts"
import type { HttpUrl } from "../../domain/value-object/http-url.ts"
import type { PublicKey } from "../../domain/value-object/public-key.ts"
import type { Result } from "../../domain/value-object/result.ts"
import { failure } from "../../domain/value-object/result.ts"

/**
 * How far, in seconds, a NIP-98 event's `created_at` may lie from the validator's clock in either direction when
 * `timestampTolerance` is not given: NIP-98's suggested "reasonable time window" of 60 seconds (shared ADR-0097).
 */
export const DEFAULT_TIMESTAMP_TOLERANCE_SECONDS = 60

/**
 * Input to `Nip98Validator.validateAuthHeader` — the raw `Authorization: Nostr <base64>` header plus the request
 * context. The body, text or bytes, is hashed by the validator; an empty one is no body.
 */
export interface ValidateAuthHeaderRequest {
  readonly authHeader: string
  readonly url: HttpUrl
  readonly method: string
  readonly body: string | Uint8Array
}

/**
 * Validator returned by `createNip98Validator` — two entry points (already-parsed event, or raw `Authorization` header)
 * that resolve to the verified `PublicKey` on success.
 */
export interface Nip98Validator {
  readonly validate: (req: ValidateEventRequest) => Promise<Result<PublicKey, Nip98ValidationFailure>>
  readonly validateAuthHeader: (
    req: ValidateAuthHeaderRequest,
  ) => Promise<Result<PublicKey, Nip98ValidationFailure | AuthHeaderDecodeFailure>>
}

/**
 * Build a NIP-98 validator that checks event shape, URL/method/payload binding, signature, and replay (via
 * `replayGuard`, the host's store). `timestampTolerance` is how many seconds `created_at` may lie from `clock` in
 * either direction, so an event is accepted for `2 * timestampTolerance + 1` seconds, the inclusive window, and each
 * accepted event id is recorded with `replayGuard` for that many seconds (shared ADR-0097); `clock` evaluates
 * `created_at` and `expiration`, the system clock ({@link now}) by default. A `timestampTolerance` that is not a safe
 * integer of at least 0 throws `InvalidArgumentError`: `NaN` or `Infinity` would disable the window and a negative one
 * would refuse every event.
 */
export const createNip98Validator = (
  replayGuard: Nip98ReplayGuard,
  timestampTolerance: number = DEFAULT_TIMESTAMP_TOLERANCE_SECONDS,
  clock: Clock = now,
): Nip98Validator => {
  if (!Number.isSafeInteger(timestampTolerance) || timestampTolerance < 0) {
    throw new InvalidArgumentError(
      `A NIP-98 timestamp tolerance is a whole number of seconds of at least 0, not ${timestampTolerance}`,
    )
  }
  const replayTtl = timestampTolerance * 2 + 1

  const validate = async (req: ValidateEventRequest): Promise<Result<PublicKey, Nip98ValidationFailure>> => {
    const checked = checkNip98Event(req, timestampTolerance, clock())
    if (!checked.success) return checked
    const recorded = await replayGuard.recordOnce(req.event.id, replayTtl)
    return recorded ? checked : failure("replay")
  }

  const validateAuthHeader = (
    req: ValidateAuthHeaderRequest,
  ): Promise<Result<PublicKey, Nip98ValidationFailure | AuthHeaderDecodeFailure>> => {
    const parsed = parseAuthHeader(req.authHeader)
    if (!parsed.success) return Promise.resolve(parsed)
    return validate({ event: parsed.value, url: req.url, method: req.method, bodyHash: sha256Hex(req.body) })
  }

  return { validate, validateAuthHeader }
}
