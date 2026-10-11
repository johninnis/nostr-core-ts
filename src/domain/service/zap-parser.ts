import { isInteger, isRecord, isString } from "./guards.ts"
import { parseDecimalInteger } from "./decimal.ts"
import { parseJson } from "./json.ts"
import { KIND_NUTZAP, KIND_ZAP_RECEIPT, KIND_ZAP_REQUEST } from "../value-object/kinds.ts"
import type { NostrEvent } from "../value-object/nostr-event.ts"
import type { PublicKey } from "../value-object/public-key.ts"
import { parsePublicKey } from "../value-object/public-key.ts"
import type { Result } from "../value-object/result.ts"
import { failure, ok } from "../value-object/result.ts"
import type { ZapReceiptVerificationFailure } from "../failure/zap-receipt-verification-failure.ts"
import type { NutzapDleqFailure } from "../failure/nutzap-dleq-failure.ts"
import type { NutzapVerificationFailure } from "../failure/nutzap-verification-failure.ts"
import type { WebUrl } from "../value-object/web-url.ts"
import { parseWebUrl } from "../value-object/web-url.ts"
import { hasValidDleq } from "./cashu-dleq.ts"
import type { MintKeyset } from "./mint-keyset.ts"
import type { NutzapInfo } from "./nutzap-info.ts"
import { parseP2pkLockKey } from "./p2pk-secret.ts"
import { parseNostrEvent } from "./event-utils.ts"
import { extractTagValues, soleTagValue } from "./tags.ts"
import { verifyEventSignature } from "./verify.ts"
import type { Lnurl } from "./zap-address.ts"

const MAX_ZAP_MSATS = 100_000_000_000
const MSATS_PER_SAT = 1000

const MSATS_PER_UNIT: ReadonlyMap<string, number> = new Map([
  ["", 100_000_000_000],
  ["m", 100_000_000],
  ["u", 100_000],
  ["n", 100],
])

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
  const msatsPerUnit = MSATS_PER_UNIT.get(unit)
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
 * Parsed-zap shape of a zap receipt — the payer's pubkey, the amount in sats, the message, and the receipt's
 * `created_at`.
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

/**
 * An amount in the base unit a nutzap's Cashu proofs are denominated in (NIP-61: "`sat`, `usd`, `eur`"), as the proofs
 * state it and never converted (shared ADR-0080).
 */
export interface CashuAmount {
  readonly amount: number
  readonly unit: string
}

/**
 * A Cashu proof's NUT-12 DLEQ proof as written: the challenge `e`, the response `s` and the blinding factor `r`, each
 * `null` when missing or not a string, for {@link verifyNutzapDleq}'s check against the mint's keyset (shared ADR-0121).
 */
export interface NutzapDleq {
  readonly e: string | null
  readonly s: string | null
  readonly r: string | null
}

/**
 * One `proof` of a nutzap that states an amount (shared ADR-0080), carried whole as written for
 * {@link verifyNutzapDleq}'s check (shared ADR-0121): its keyset `id` (`keysetId`), its `amount`, its `secret`, its
 * unblinded signature `C`
 * (`unblindedSignature`) and its `dleq`, each `null` when missing or mistyped, and the key its secret locks it to alone
 * (`lockKey`, an x-coordinate), or `null` when the secret locks it to no one key.
 */
export interface NutzapProof {
  readonly keysetId: string | null
  readonly amount: number
  readonly secret: string | null
  readonly unblindedSignature: string | null
  readonly dleq: NutzapDleq | null
  readonly lockKey: PublicKey | null
}

/**
 * A NIP-61 kind-9321 nutzap as `parseNutzap` read it: the sender's pubkey, the one recipient its `p` tag names, the
 * mint its `u` tag names kept as written (each `null` when the tags name no one), the proofs that state an amount, the
 * keyset ids they name (`keysetIds`, each once, as written, in the order first named), its amount in the unit its
 * proofs state (`null` when no proof states one), its bitcoin amount in millisatoshis and in whole sats (each `null`
 * unless that unit is `sat` or `msat` and a proof states an amount), the message, and its `created_at` (shared
 * ADR-0080, shared ADR-0121). Reading verifies nothing; pass it to {@link verifyNutzap}, then to
 * {@link verifyNutzapDleq}.
 */
export interface Nutzap {
  readonly pubkey: PublicKey
  readonly recipient: PublicKey | null
  readonly mint: WebUrl | null
  readonly proofs: ReadonlyArray<NutzapProof>
  readonly keysetIds: ReadonlyArray<string>
  readonly cashuAmount: CashuAmount | null
  readonly amountMillisats: number | null
  readonly amountSats: number | null
  readonly message: string
  readonly createdAt: number
}

const stringOrNull = (value: unknown): string | null => isString(value) ? value : null

const parseNutzapDleq = (dleq: unknown): NutzapDleq | null =>
  isRecord(dleq) ? { e: stringOrNull(dleq.e), s: stringOrNull(dleq.s), r: stringOrNull(dleq.r) } : null

// Deliberate: the proof is carried whole as written, a field null when missing or mistyped, for the DLEQ check — see shared ADR-0121
const parseNutzapProof = (proofJson: string): NutzapProof | null => {
  const proof = parseJson(proofJson)
  if (!proof.success || !isRecord(proof.value) || !isInteger(proof.value.amount)) return null
  const secret = stringOrNull(proof.value.secret)
  return {
    keysetId: stringOrNull(proof.value.id),
    amount: proof.value.amount,
    secret,
    unblindedSignature: stringOrNull(proof.value.C),
    dleq: parseNutzapDleq(proof.value.dleq),
    lockKey: secret === null ? null : parseP2pkLockKey(secret),
  }
}

const DEFAULT_NUTZAP_UNIT = "sat"
const MSATS_PER_BITCOIN_UNIT: ReadonlyMap<string, number> = new Map([["sat", MSATS_PER_SAT], ["msat", 1]])

const sumWithinTheSafeIntegerRange = (amounts: ReadonlyArray<number>): number | null =>
  amounts.reduce<number | null>(
    (total, amount) => total === null || amount > Number.MAX_SAFE_INTEGER - total ? null : total + amount,
    0,
  )

const exceedsTheBitcoinCeiling = (cashuAmount: CashuAmount): boolean => {
  const msatsPerUnit = MSATS_PER_BITCOIN_UNIT.get(cashuAmount.unit)
  return msatsPerUnit !== undefined && cashuAmount.amount > MAX_ZAP_MSATS / msatsPerUnit
}

const bitcoinAmountOf = (cashuAmount: CashuAmount): number | null => {
  const msatsPerUnit = MSATS_PER_BITCOIN_UNIT.get(cashuAmount.unit)
  return msatsPerUnit === undefined ? null : cashuAmount.amount * msatsPerUnit
}

const nutzapOf = (event: NostrEvent, proofs: ReadonlyArray<NutzapProof>, cashuAmount: CashuAmount | null): Nutzap => {
  const recipient = soleTagValue(event.tags, "p").value
  const amountMillisats = cashuAmount === null ? null : bitcoinAmountOf(cashuAmount)
  return {
    pubkey: event.pubkey,
    recipient: recipient === null ? null : parsePublicKey(recipient),
    mint: parseWebUrl(soleTagValue(event.tags, "u").value),
    proofs,
    keysetIds: [...new Set(proofs.flatMap((proof) => proof.keysetId ?? []))],
    cashuAmount,
    amountMillisats,
    amountSats: amountMillisats === null ? null : Math.floor(amountMillisats / MSATS_PER_SAT),
    message: event.content,
    createdAt: event.created_at,
  }
}

// Deliberate: an amount stays in its proofs' unit, and only sat or msat is also bitcoin — see shared ADR-0080
/**
 * Parse a kind-9321 nutzap event (NIP-61), summing its distinct `proof` amounts in the base unit its `unit` tag names:
 * `sat` when the tag is absent (NIP-61: "Default: `sat` if omitted"), or the unit it names, `msat`, `usd`, `eur` or any
 * other, which the amount is carried in. A `sat` or `msat` nutzap also has its bitcoin amount, up to 1 BTC. A proof
 * that is not a JSON object with a safe integer `amount` states no amount and is skipped (shared ADR-0080, shared
 * ADR-0098); a nutzap whose proofs state none is read with no amount. Each proof read carries the key its NUT-10 P2PK
 * secret locks it to alone, and the nutzap its one `p` recipient, its one `u` mint, kept as written, and the keyset ids
 * its proofs name (shared ADR-0121). Returns `null` for another kind, for `unit` tags that disagree, for a negative
 * proof amount, for a sum beyond the safe integer range, and for a bitcoin amount above 1 BTC.
 */
export const parseNutzap = (event: NostrEvent): Nutzap | null => {
  if (event.kind !== KIND_NUTZAP) return null
  const unit = soleTagValue(event.tags, "unit")
  const proofs = extractTagValues(event.tags, "proof").flatMap((proof) => parseNutzapProof(proof) ?? [])
  const amounts = proofs.map((proof) => proof.amount)
  if (unit.state === "disagreeing" || amounts.some((amount) => amount < 0)) return null
  if (amounts.length === 0) return nutzapOf(event, proofs, null)

  const total = sumWithinTheSafeIntegerRange(amounts)
  const cashuAmount = total === null ? null : { amount: total, unit: unit.value ?? DEFAULT_NUTZAP_UNIT }
  return cashuAmount === null || exceedsTheBitcoinCeiling(cashuAmount) ? null : nutzapOf(event, proofs, cashuAmount)
}

/**
 * A nutzap {@link verifyNutzap} verified, so its mint is one its recipient lists: the mint whose keysets a host fetches
 * (`mintKeysetUrl`) for {@link verifyNutzapDleq}, without checking it again.
 */
export type ListedNutzap = Nutzap & { readonly mint: WebUrl }

// Deliberate: the mint is compared exactly as written, never normalised, as the recipient's #u filter matches it — see shared ADR-0121
const isListedIn = (nutzap: Nutzap, recipientsInfo: NutzapInfo): nutzap is ListedNutzap =>
  nutzap.mint !== null && recipientsInfo.mints.includes(nutzap.mint)

// Deliberate: verifies only what the two events establish; DLEQ, which needs the mint's keysets, is verifyNutzapDleq's — see shared ADR-0121
/**
 * Verify a parsed nutzap against its recipient's nutzap info (NIP-61's "Verifying a Cashu Zap", shared ADR-0121),
 * checking, in this order, that the info is by the nutzap's one recipient, that it lists the nutzap's mint exactly as
 * written, that the nutzap has a proof that states an amount, and that every proof is locked to the info's P2PK key
 * alone. Pure: neither event's signature is checked, both being events the host verifies before reading, and the DLEQ
 * check, which needs the mint's keysets, is {@link verifyNutzapDleq}'s, made next. A verified nutzap is a
 * {@link ListedNutzap}. A nutzap that has not verified is never counted toward an amount.
 */
export const verifyNutzap = (
  nutzap: Nutzap,
  recipientsInfo: NutzapInfo,
): Result<ListedNutzap, NutzapVerificationFailure> => {
  if (nutzap.recipient !== recipientsInfo.pubkey) return failure("recipient-mismatch")
  if (!isListedIn(nutzap, recipientsInfo)) return failure("mint-not-listed")
  if (nutzap.proofs.length === 0) return failure("no-proof")
  if (!nutzap.proofs.every((proof) => proof.lockKey === recipientsInfo.p2pkPubkey)) {
    return failure("proof-not-locked-to-recipient")
  }
  return ok(nutzap)
}

interface KeysetProof {
  readonly proof: NutzapProof
  readonly keyset: MintKeyset
}

interface KeyedProof {
  readonly proof: NutzapProof
  readonly mintKey: string
}

const withItsKeyset = (proof: NutzapProof, keysets: ReadonlyArray<MintKeyset>): KeysetProof | null => {
  const keyset = keysets.find((candidate) => candidate.id === proof.keysetId)
  return keyset === undefined ? null : { proof, keyset }
}

const withItsMintKey = ({ proof, keyset }: KeysetProof): KeyedProof | null => {
  const mintKey = keyset.keys.get(proof.amount)
  return mintKey === undefined ? null : { proof, mintKey }
}

/**
 * Verify a nutzap's proofs by their NUT-12 DLEQ against its mint's `keysets` (NIP-61: "locally verify the DLEQ proof of
 * the tokens being sent", shared ADR-0121), after {@link verifyNutzap} and over the proofs the read nutzap carries.
 * Checks, in this order, each over every proof before the next: that the nutzap has a proof, that every proof's keyset
 * id names a keyset given (the first with that id), that every such keyset is in the nutzap's unit, compared exactly,
 * that every such keyset has a key for the proof's amount, and that every proof's DLEQ verifies against that key as
 * NUT-12's receiving user checks it, a proof missing a field the check needs failing it. Pure: the host fetches the
 * keysets (`mintKeysetUrl`, `parseMintKeysets`). Returns the nutzap it was given, so a {@link ListedNutzap} stays one.
 */
export const verifyNutzapDleq = <T extends Nutzap>(
  nutzap: T,
  keysets: ReadonlyArray<MintKeyset>,
): Result<T, NutzapDleqFailure> => {
  if (nutzap.proofs.length === 0) return failure("no-proof")
  const keysetProofs = nutzap.proofs.flatMap((proof) => withItsKeyset(proof, keysets) ?? [])
  if (keysetProofs.length < nutzap.proofs.length) return failure("unknown-keyset")
  // Deliberate: a keyset in another unit fails, as a unit tag misstating it would show a false amount — see shared ADR-0121
  if (!keysetProofs.every(({ keyset }) => keyset.unit === nutzap.cashuAmount?.unit)) return failure("unit-mismatch")
  const keyedProofs = keysetProofs.flatMap((keysetProof) => withItsMintKey(keysetProof) ?? [])
  if (keyedProofs.length < keysetProofs.length) return failure("no-mint-key")
  return keyedProofs.every(({ proof, mintKey }) => hasValidDleq(proof, mintKey)) ? ok(nutzap) : failure("dleq-invalid")
}
