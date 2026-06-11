import { isRecord } from "../value-object/guards.ts"
import { tryParseJson } from "../value-object/json.ts"
import { KIND_NUTZAP, KIND_ZAP_RECEIPT } from "../value-object/kinds.ts"
import type { NostrEvent } from "../value-object/nostr-event.ts"
import { isValidTagsArray } from "../value-object/nostr-event.ts"
import type { PublicKey } from "../value-object/public-key.ts"
import { isValidPublicKey } from "../value-object/public-key.ts"
import { encodePubkeyToNpub } from "./bech32.ts"
import { getTagValue } from "./tags.ts"

// Upper bound on a single zap's value: 100 billion millisats (1 BTC). Receipts and nutzaps
// claiming more are forged or nonsensical and are rejected outright.
const MAX_ZAP_MSATS = 100_000_000_000

// Millisats per "1 unit" of the BOLT-11 amount, keyed by the HRP unit suffix.
// Empty suffix = whole BTC; m/u/n are milli/micro/nano BTC. Pico is handled separately
// because 1 pBTC = 0.1 msat, and BOLT-11 only permits pico amounts divisible by 10.
const MSATS_PER_UNIT: Readonly<Record<string, number>> = {
  "": 100_000_000_000,
  m: 100_000_000,
  u: 100_000,
  n: 100,
}

const parseBolt11Msats = (bolt11: string | null): number | null => {
  if (!bolt11) return null
  const match = bolt11.toLowerCase().match(/^lnbc(\d+)([munp]?)1/)
  if (!match) return null
  const num = Number(match[1])
  if (!Number.isSafeInteger(num)) return null
  const unit = match[2] ?? ""
  if (unit === "p") return num % 10 === 0 ? num / 10 : null
  const msatsPerUnit = MSATS_PER_UNIT[unit]
  if (msatsPerUnit === undefined) return null
  const msats = num * msatsPerUnit
  return Number.isSafeInteger(msats) ? msats : null
}

/** Parse the amount (in satoshis) from a BOLT-11 invoice's HRP; returns `null` if it can't be parsed. */
export const parseBolt11Amount = (bolt11: string | null): number | null => {
  const msats = parseBolt11Msats(bolt11)
  return msats === null ? null : Math.round(msats / 1000)
}

// NIP-57 cross-check: when the embedded zap request carries an `amount` tag (millisats), it must
// equal the invoice amount exactly. A present-but-malformed value (non-digits, or beyond
// Number.MAX_SAFE_INTEGER — e.g. a forged "9223372036854775807") fails the check rather than
// degrading into a garbage number.
const requestAmountMatchesBolt11 = (requestTags: unknown, bolt11Msats: number): boolean => {
  if (!isValidTagsArray(requestTags)) return true
  const amountValue = getTagValue(requestTags, "amount")
  if (amountValue === null) return true
  if (!/^\d+$/.test(amountValue)) return false
  const requestedMsats = Number(amountValue)
  return Number.isSafeInteger(requestedMsats) && requestedMsats === bolt11Msats
}

/** Parsed-zap shape returned by `parseZapReceipt` and `parseNutzap` — payer pubkey (branded plus `npub` form), amount in sats, optional message, and the receipt's `created_at`. */
export interface ZapInfo {
  readonly pubkey: PublicKey
  readonly npub: string
  readonly amountSats: number
  readonly message: string
  readonly createdAt: number
}

/**
 * Parse a kind-9735 zap receipt (NIP-57) into payer/amount/message. The amount derives solely
 * from the `bolt11` invoice — a receipt-level `amount` tag is attacker-controlled and ignored.
 * Returns `null` if `event` isn't a valid receipt: missing/unparseable invoice amount, amount
 * above 1 BTC, or an embedded zap-request `amount` tag that doesn't match the invoice.
 */
export const parseZapReceipt = (event: NostrEvent): ZapInfo | null => {
  if (event.kind !== KIND_ZAP_RECEIPT) return null
  const tags = event.tags
  const descriptionJson = getTagValue(tags, "description")
  if (!descriptionJson) return null

  const parsed = tryParseJson(descriptionJson)
  if (!isRecord(parsed)) return null

  const requestPubkey = parsed.pubkey
  if (!isValidPublicKey(requestPubkey)) return null

  const bolt11Msats = parseBolt11Msats(getTagValue(tags, "bolt11"))
  if (bolt11Msats === null || bolt11Msats > MAX_ZAP_MSATS) return null
  if (!requestAmountMatchesBolt11(parsed.tags, bolt11Msats)) return null

  return {
    pubkey: requestPubkey,
    npub: encodePubkeyToNpub(requestPubkey),
    amountSats: Math.round(bolt11Msats / 1000),
    message: typeof parsed.content === "string" ? parsed.content : "",
    createdAt: event.created_at,
  }
}

const parseProofAmount = (proofJson: string): number | null => {
  const parsed = tryParseJson(proofJson)
  if (!isRecord(parsed)) return null
  const amount = parsed.amount
  // Cashu proof amounts are non-negative integers. Reject negative / fractional / unsafe values
  // from untrusted input rather than folding them into the running total.
  if (typeof amount !== "number" || !Number.isSafeInteger(amount) || amount < 0) return null
  return amount
}

/** Parse a kind-9321 nutzap event (NIP-61) and sum its `proof` amounts into a `ZapInfo`; returns `null` when the total exceeds 1 BTC. */
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
  const totalMsats = unitTag === "msat" ? totalAmount : totalAmount * 1000
  if (totalMsats > MAX_ZAP_MSATS) return null

  return {
    pubkey: event.pubkey,
    npub: encodePubkeyToNpub(event.pubkey),
    amountSats: Math.round(totalMsats / 1000),
    message: event.content || "",
    createdAt: event.created_at,
  }
}
