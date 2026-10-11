import { parseDecimalInteger } from "./decimal.ts"
import { isRecord, isString } from "./guards.ts"
import type { WebUrl } from "../value-object/web-url.ts"

/**
 * A Cashu keyset as its mint serves it (NUT-01, NUT-02; shared ADR-0121): its keyset `id` and the `unit` its amounts
 * are in, each as written, and its `keys`, the mint's public key for each amount, as written.
 */
export interface MintKeyset {
  readonly id: string
  readonly unit: string
  readonly keys: ReadonlyMap<number, string>
}

const HEX_KEYSET_ID = /^[0-9a-f]+$/i
const QUERY_OR_FRAGMENT = /[?#]/
const KEYS_PATH = "/v1/keys/"
const SLASH = "/"

// Deliberate: a key is kept as written, unchecked, since whether it is a curve point is the DLEQ check's alone — see shared ADR-0121
const mintKeysOf = (keys: Readonly<Record<string, unknown>>): ReadonlyMap<number, string> =>
  new Map(
    Object.entries(keys).flatMap(([amount, key]) => {
      const parsedAmount = parseDecimalInteger(amount)
      return parsedAmount === null || !isString(key) ? [] : [[parsedAmount, key] as const]
    }),
  )

const mintKeysetOf = (keyset: unknown): MintKeyset | null =>
  isRecord(keyset) && isString(keyset.id) && isString(keyset.unit) && isRecord(keyset.keys)
    ? { id: keyset.id, unit: keyset.unit, keys: mintKeysOf(keyset.keys) }
    : null

/**
 * Read a mint's keys response — the JSON body of NUT-01's `GET /v1/keys` or NUT-02's `GET /v1/keys/{keyset_id}`,
 * already decoded — as its keysets, in the order it lists them, without throwing (shared ADR-0121). Anything that is not
 * an object with a `keysets` array reads as no keysets; a keyset whose `id` or `unit` is not a string, or whose `keys`
 * is not an object, is dropped. A key is kept only when its amount is canonical decimal digits naming a safe integer,
 * the range a proof's amount is read in, and its value is a string, kept as written: whether it is a curve point is
 * for the DLEQ check to judge.
 */
export const parseMintKeysets = (response: unknown): ReadonlyArray<MintKeyset> =>
  isRecord(response) && Array.isArray(response.keysets)
    ? response.keysets.flatMap((keyset: unknown) => mintKeysetOf(keyset) ?? [])
    : []

const withoutTrailingSlashes = (url: string): string =>
  url.slice(0, url.split("").findLastIndex((character) => character !== SLASH) + 1)

/**
 * The URL of NUT-02's `GET /v1/keys/{keyset_id}` for `keysetId` at `mint`, where a host fetches the keyset a nutzap's
 * proofs name for `verifyNutzapDleq`: the mint exactly as written, its path kept, its trailing slashes dropped so one
 * `/` comes before `v1`. `null` when `keysetId` is not a non-empty string of hex digits, either case, as NUT-02 writes a
 * keyset id, so no id a sender writes can steer the request elsewhere, and when `mint` carries a query or a fragment,
 * whose path cannot be extended. Nothing here fetches it.
 */
export const mintKeysetUrl = (mint: WebUrl, keysetId: string): string | null =>
  HEX_KEYSET_ID.test(keysetId) && !QUERY_OR_FRAGMENT.test(mint)
    ? `${withoutTrailingSlashes(mint)}${KEYS_PATH}${keysetId}`
    : null
