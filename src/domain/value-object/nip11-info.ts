import { isNumber, isOptionalString, isRecord } from "./guards.ts"

/**
 * NIP-11 relay information document. Field names use the spec's snake_case (`supported_nips`)
 * because the type doubles as the wire shape returned by `/.well-known/nostr.json` and the
 * `application/nostr+json` endpoint; renaming would force every adapter to do its own mapping.
 */
export interface RelayInformation {
  readonly name?: string
  readonly description?: string
  readonly software?: string
  readonly version?: string
  readonly supported_nips?: ReadonlyArray<number>
}

/** Type guard for the NIP-11 relay-information document shape (all fields optional, types must match when present). */
export const isRelayInformation = (value: unknown): value is RelayInformation => {
  if (!isRecord(value)) return false
  return isOptionalString(value.name) &&
    isOptionalString(value.description) &&
    isOptionalString(value.software) &&
    isOptionalString(value.version) &&
    (value.supported_nips === undefined ||
      (Array.isArray(value.supported_nips) && value.supported_nips.every(isNumber)))
}
