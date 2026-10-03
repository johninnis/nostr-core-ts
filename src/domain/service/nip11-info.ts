import type { PublicKey } from "../value-object/public-key.ts"
import { parsePublicKey } from "../value-object/public-key.ts"
import { isArrayOf, isInteger, isRecord } from "./guards.ts"

/** A NIP-11 relay information document. A field the relay left out, or sent with the wrong type, is `null`. */
export interface RelayInformation {
  readonly name: string | null
  readonly description: string | null
  readonly pubkey: PublicKey | null
  /** The relay's own identity, independent of its administrator's `pubkey`. */
  readonly self: PublicKey | null
  readonly contact: string | null
  readonly supportedNips: ReadonlyArray<number> | null
  readonly software: string | null
  readonly version: string | null
  readonly banner: string | null
  readonly icon: string | null
  readonly termsOfService: string | null
  readonly limitation: Readonly<Record<string, unknown>> | null
  /** The document exactly as the relay sent it, for fields this type does not name. */
  readonly document: Readonly<Record<string, unknown>>
}

const stringField = (document: Readonly<Record<string, unknown>>, key: string): string | null => {
  const value = document[key]
  return typeof value === "string" ? value : null
}

/** Read the fields of a NIP-11 relay information document already known to be a JSON object. */
export const relayInformationFrom = (value: Readonly<Record<string, unknown>>): RelayInformation => {
  const supportedNips = value.supported_nips
  const limitation = value.limitation
  return {
    name: stringField(value, "name"),
    description: stringField(value, "description"),
    pubkey: parsePublicKey(value.pubkey),
    self: parsePublicKey(value.self),
    contact: stringField(value, "contact"),
    supportedNips: isArrayOf(supportedNips, isInteger) ? supportedNips : null,
    software: stringField(value, "software"),
    version: stringField(value, "version"),
    banner: stringField(value, "banner"),
    icon: stringField(value, "icon"),
    termsOfService: stringField(value, "terms_of_service"),
    limitation: isRecord(limitation) ? limitation : null,
    document: value,
  }
}

/**
 * Read a NIP-11 relay information document (`application/nostr+json`), or `null` when `value` is not a JSON object.
 * Each field is read on its own, so one field of the wrong type becomes `null` without discarding the rest.
 */
export const parseRelayInformation = (value: unknown): RelayInformation | null =>
  isRecord(value) ? relayInformationFrom(value) : null
