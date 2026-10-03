import { isRecord } from "./guards.ts"
import { parseDecimalInteger } from "./decimal.ts"
import { parseJson } from "./json.ts"
import { KIND_NUTZAP, KIND_ZAP_RECEIPT, KIND_ZAP_REQUEST } from "../value-object/kinds.ts"
import type { NostrEvent, Tag } from "../value-object/nostr-event.ts"
import type { PublicKey } from "../value-object/public-key.ts"
import type { Result } from "../value-object/result.ts"
import { failure, ok } from "../value-object/result.ts"
import type { ZapReceiptVerificationFailure } from "../failure/zap-receipt-verification-failure.ts"
import { parseNostrEvent } from "./event-utils.ts"
import { extractTagValues, soleTagValue } from "./tags.ts"
import { verifyEventSignature } from "./verify.ts"
import type { Lnurl } from "./zap-address.ts"

const MAX_ZAP_MSATS = 100_000_000_000
const MSATS_PER_SAT = 1000

const MSATS_PER_UNIT: Readonly<Record<string, number>> = {
  "": 100_000_000_000,
  m: 100_000_000,
  u: 100_000,
  n: 100,
}

const BOLT11_AMOUNT = /^ln(?:bc|tb|tbs|bcrt)(?:([1-9]\d*)([munp]?))?$/

const parseBolt11Msats = (bolt11: string): number | null => {
  const lowered = bolt11.toLowerCase()
  if (bolt11 !== lowered && bolt11 !== bolt11.toUpperCase()) return null
  const separator = lowered.lastIndexOf("1")
  if (separator === -1) return null
  const match = BOLT11_AMOUNT.exec(lowered.slice(0, separator))
  const digits = match?.[1]
  if (digits === undefined) return null
  const amount = Number(digits)
  if (!Number.isSafeInteger(amount)) return null
  const unit = match?.[2] ?? ""
  if (unit === "p") return digits.endsWith("0") && amount / 10 <= MAX_ZAP_MSATS ? amount / 10 : null
  const msatsPerUnit = MSATS_PER_UNIT[unit]
  if (msatsPerUnit === undefined) return null
  return amount <= MAX_ZAP_MSATS / msatsPerUnit ? amount * msatsPerUnit : null
}

/**
 * The amount, in whole satoshis rounded down, that a BOLT-11 invoice's human-readable part states. Reads the Bitcoin
 * network prefixes BOLT-11 names (`lnbc`, `lntb`, `lntbs`, `lnbcrt`); returns `null` for an invoice without an amount,
 * an invoice without a bech32 `1` separator, a mixed-case invoice (BIP-173: decoders "MUST NOT accept" mixed case), an
 * unknown prefix or multiplier, an amount that is zero or has a leading 0 (BOLT-11: "a positive decimal integer with no
 * leading 0s"), a pico amount not ending in 0, or an amount above 1 BTC.
 */
export const parseBolt11Amount = (bolt11: string | null): number | null => {
  const msats = bolt11 === null ? null : parseBolt11Msats(bolt11)
  return msats === null ? null : Math.floor(msats / MSATS_PER_SAT)
}

/**
 * Parsed-zap shape returned by `parseZapReceipt` and `parseNutzap` — the payer's pubkey, the amount in sats, the
 * message, and the receipt's `created_at`.
 */
export interface ZapInfo {
  readonly pubkey: PublicKey
  readonly amountSats: number
  readonly message: string
  readonly createdAt: number
}

/**
 * A NIP-57 kind-9735 zap receipt as `parseZapReceipt` read it: the receipt event, the one kind-9734 zap request it
 * carries, and the amount its `bolt11` invoice states. The sender (`pubkey`) is the zap request's author. Parsing
 * verifies nothing; pass the receipt to {@link verifyZapReceipt} before believing it.
 */
export interface ZapReceipt extends ZapInfo {
  readonly receipt: NostrEvent
  readonly zapRequest: NostrEvent
  readonly amountMillisats: number
}

const parseZapRequest = (description: string): NostrEvent | null => {
  const json = parseJson(description)
  const request = json.success ? parseNostrEvent(json.value) : null
  return request?.kind === KIND_ZAP_REQUEST ? request : null
}

const requestedAmountsMatch = (zapRequest: NostrEvent, invoiceMsats: number): boolean =>
  extractTagValues(zapRequest.tags, "amount").every((amount) => parseDecimalInteger(amount) === invoiceMsats)

// Deliberate: one description and one bolt11 are read and the request held, so readers agree — see shared ADR-0038
/**
 * Parse a kind-9735 zap receipt (NIP-57 Appendix E): exactly one `description` tag holding the JSON of a signed
 * kind-9734 zap request, and exactly one `bolt11` tag whose amount every `amount` tag on the request equals. The amount
 * comes from the invoice alone. Returns `null` for anything else, or an amount above 1 BTC. Verifies no signature — see
 * {@link verifyZapReceipt}.
 */
export const parseZapReceipt = (event: NostrEvent): ZapReceipt | null => {
  if (event.kind !== KIND_ZAP_RECEIPT) return null
  const description = soleTagValue(event.tags, "description").value
  const bolt11 = soleTagValue(event.tags, "bolt11").value
  const zapRequest = description === null ? null : parseZapRequest(description)
  const amountMillisats = bolt11 === null ? null : parseBolt11Msats(bolt11)
  if (zapRequest === null || amountMillisats === null) return null
  if (!requestedAmountsMatch(zapRequest, amountMillisats)) return null

  return {
    receipt: event,
    zapRequest,
    amountMillisats,
    pubkey: zapRequest.pubkey,
    amountSats: Math.floor(amountMillisats / MSATS_PER_SAT),
    message: zapRequest.content,
    createdAt: event.created_at,
  }
}

const lnurlMatches = (zapRequest: NostrEvent, expectedLnurl: Lnurl | null): boolean =>
  expectedLnurl === null ||
  extractTagValues(zapRequest.tags, "lnurl").every((lnurl) => lnurl.toLowerCase() === expectedLnurl)

// Deliberate: the zap request's own signature is checked too, because the sender shown comes from it — see ADR-0020
/**
 * Verify a parsed zap receipt against NIP-57 Appendix F: the receipt must be signed by `lnurlProviderPubkey` (the
 * `nostrPubkey` of the recipient's LNURL-pay endpoint), the zap request's `lnurl` tag must equal `expectedLnurl` when
 * one is given (the tag read in either case, as bech32 allows), and both the receipt's and the zap request's signatures
 * must verify. The comparisons run before the signature checks.
 */
export const verifyZapReceipt = (
  receipt: ZapReceipt,
  lnurlProviderPubkey: PublicKey,
  expectedLnurl: Lnurl | null = null,
): Result<ZapReceipt, ZapReceiptVerificationFailure> => {
  if (receipt.receipt.pubkey !== lnurlProviderPubkey) return failure("provider-pubkey-mismatch")
  if (!lnurlMatches(receipt.zapRequest, expectedLnurl)) return failure("lnurl-mismatch")
  if (!verifyEventSignature(receipt.receipt)) return failure("receipt-signature-invalid")
  if (!verifyEventSignature(receipt.zapRequest)) return failure("zap-request-signature-invalid")
  return ok(receipt)
}

const parseProofAmount = (proofJson: string): number | null => {
  const proof = parseJson(proofJson)
  if (!proof.success || !isRecord(proof.value)) return null
  const amount = proof.value.amount
  return Number.isInteger(amount) ? Number(amount) : null
}

const MSATS_PER_NUTZAP_UNIT: Readonly<Record<string, number>> = { sat: MSATS_PER_SAT, msat: 1 }

const nutzapUnitMsats = (tags: ReadonlyArray<Tag>): number | null => {
  const unit = soleTagValue(tags, "unit")
  if (unit.state === "absent") return MSATS_PER_SAT
  return unit.value === null ? null : MSATS_PER_NUTZAP_UNIT[unit.value] ?? null
}

const sumProofAmounts = (tags: ReadonlyArray<Tag>): number | null => {
  const amounts = extractTagValues(tags, "proof").map(parseProofAmount).filter((amount) => amount !== null)
  if (amounts.length === 0 || amounts.some((amount) => amount < 0)) return null
  return amounts.reduce((total, amount) => total + amount, 0)
}

/**
 * Parse a kind-9321 nutzap event (NIP-61) into a `ZapInfo`, summing its distinct `proof` amounts in the base unit its
 * `unit` tag names: `sat`, the default when the tag is absent (NIP-61: "Default: `sat` if omitted"), or `msat`. A proof
 * that is not a JSON object with an integer `amount` states no amount and is skipped (shared ADR-0080; NIP-61 is silent
 * on malformed proofs). Returns `null` for any other unit, whose proofs state no bitcoin amount, for `unit` tags that
 * disagree, for a negative proof amount, when no proof states an amount, and for a total above 1 BTC.
 */
export const parseNutzap = (event: NostrEvent): ZapInfo | null => {
  if (event.kind !== KIND_NUTZAP) return null
  const msatsPerUnit = nutzapUnitMsats(event.tags)
  const total = sumProofAmounts(event.tags)
  if (msatsPerUnit === null || total === null) return null
  const totalMsats = total * msatsPerUnit
  if (totalMsats > MAX_ZAP_MSATS) return null

  return {
    pubkey: event.pubkey,
    amountSats: Math.floor(totalMsats / MSATS_PER_SAT),
    message: event.content,
    createdAt: event.created_at,
  }
}
