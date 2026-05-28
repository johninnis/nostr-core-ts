import { isRecord } from "../value-object/guards.ts"
import { tryParseJson } from "../value-object/json.ts"
import { KIND_NUTZAP, KIND_ZAP_RECEIPT } from "../value-object/kinds.ts"
import type { NostrEvent, Tag } from "../value-object/nostr-event.ts"
import type { PublicKey } from "../value-object/public-key.ts"
import { isValidPublicKey } from "../value-object/public-key.ts"
import { encodePubkeyToNpub } from "./bech32.ts"
import { getTagValue } from "./tags.ts"

// Satoshis per "1 unit" of the BOLT-11 amount, keyed by the HRP unit suffix.
// Empty suffix = whole BTC; m/u/n/p are milli/micro/nano/pico BTC respectively.
const SATS_PER_UNIT: Readonly<Record<string, number>> = {
  "": 100_000_000,
  m: 100_000,
  u: 100,
  n: 0.1,
  p: 0.0001,
}

/** Parse the amount (in satoshis) from a BOLT-11 invoice's HRP; returns `null` if it can't be parsed. */
export const parseBolt11Amount = (bolt11: string | null): number | null => {
  if (!bolt11) return null
  const match = bolt11.toLowerCase().match(/^lnbc(\d+)([munp]?)1/)
  if (!match) return null
  // Regex `(\d+)` guarantees `match[1]` is a digit string, so `Number()` always parses to a safe
  // integer here — no defensive NaN check needed.
  const num = Number(match[1])
  const satsPerUnit = SATS_PER_UNIT[match[2] ?? ""]
  if (satsPerUnit === undefined) return null
  return Math.round(num * satsPerUnit)
}

/**
 * Resolve the satoshi amount from a zap event's tags; prefers `amount` (millisats), falls back to
 * the `bolt11` invoice. A present-but-malformed `amount` tag is a protocol violation — return
 * `null` rather than silently falling through to `bolt11`, which would hide the bug.
 */
export const parseAmountSats = (tags: ReadonlyArray<Tag>): number | null => {
  const amountValue = getTagValue(tags, "amount")
  if (amountValue !== null) {
    const millisats = Number(amountValue)
    return Number.isSafeInteger(millisats) ? Math.round(millisats / 1000) : null
  }
  const bolt11Value = getTagValue(tags, "bolt11")
  return bolt11Value ? parseBolt11Amount(bolt11Value) : null
}

export interface ZapInfo {
  readonly pubkey: PublicKey
  readonly npub: string
  readonly amountSats: number
  readonly message: string
  readonly createdAt: number
}

/** Parse a kind-9735 zap receipt (NIP-57) into payer/amount/message; returns `null` if `event` isn't a valid receipt. */
export const parseZapReceipt = (event: NostrEvent): ZapInfo | null => {
  if (event.kind !== KIND_ZAP_RECEIPT) return null
  const tags = event.tags
  const descriptionJson = getTagValue(tags, "description")
  if (!descriptionJson) return null

  const parsed = tryParseJson(descriptionJson)
  if (!isRecord(parsed)) return null

  const requestPubkey = parsed.pubkey
  if (!isValidPublicKey(requestPubkey)) return null

  return {
    pubkey: requestPubkey,
    npub: encodePubkeyToNpub(requestPubkey),
    amountSats: parseAmountSats(tags) ?? 0,
    message: typeof parsed.content === "string" ? parsed.content : "",
    createdAt: event.created_at,
  }
}

const parseProofAmount = (proofJson: string): number | null => {
  const parsed = tryParseJson(proofJson)
  if (!isRecord(parsed)) return null
  return typeof parsed.amount === "number" ? parsed.amount : null
}

/** Parse a kind-9321 nutzap event (NIP-61) and sum its `proof` amounts into a `ZapInfo`. */
export const parseNutzap = (event: NostrEvent): ZapInfo | null => {
  if (event.kind !== KIND_NUTZAP) return null
  const tags = event.tags

  let totalAmount = 0
  let proofCount = 0
  for (const tag of tags) {
    if (tag[0] !== "proof" || !tag[1]) continue
    const amount = parseProofAmount(tag[1])
    if (amount === null) return null
    totalAmount += amount
    proofCount++
  }
  if (proofCount === 0) return null

  const unitTag = getTagValue(tags, "unit")
  const amountSats = unitTag === "msat" ? Math.round(totalAmount / 1000) : totalAmount

  return {
    pubkey: event.pubkey,
    npub: encodePubkeyToNpub(event.pubkey),
    amountSats: amountSats,
    message: event.content || "",
    createdAt: event.created_at,
  }
}
