import { assertEquals } from "@std/assert"
import {
  parseBolt11Amount,
  parseNutzap,
  parseZapReceipt,
  verifyZapReceipt,
  type ZapReceipt,
} from "../../src/domain/service/zap-parser.ts"
import { createLocalSigner } from "../../src/infrastructure/crypto/local-signer.ts"
import { secretKeyOf } from "../support/keys.ts"
import type { NostrEvent, Tag, UnsignedEvent } from "../../src/domain/value-object/nostr-event.ts"
import type { PublicKey } from "../../src/domain/value-object/public-key.ts"
import { failure, ok } from "../../src/domain/value-object/result.ts"
import { buildZapRequest } from "../../src/domain/service/builder.ts"
import type { Lnurl } from "../../src/domain/service/zap-address.ts"
import { parseLnurl } from "../../src/domain/service/zap-address.ts"
import { eventIdFixture, publicKeyFixture, relayUrlFixture, sigFixture } from "../../testing.ts"

const RELAY = relayUrlFixture("wss://nostr-pub.wellorder.net")

const pk = publicKeyFixture("a".repeat(64))
const id = eventIdFixture("b".repeat(64))

const makeEvent = (kind: number, tags: ReadonlyArray<Tag>, content = ""): NostrEvent => ({
  id,
  pubkey: pk,
  kind,
  content,
  tags,
  created_at: 1700000000,
  sig: sigFixture("c".repeat(128)),
})

const SPEC_INVOICE_2500U =
  "lnbc2500u1pvjluezsp5zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zygspp5qqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqypqdq5xysxxatsyp3k7enxv4jsxqzpu9qrsgquk0rl77nj30yxdy8j9vdx85fkpmdla2087ne0xh8nhedh8w27kyke0lp53ut353s06fv3qfegext0eh0ymjpf39tuven09sam30g4vgpfna3rh"

const zapRequest = (tags: ReadonlyArray<Tag> = [], kind = 9734): NostrEvent => ({
  ...makeEvent(kind, tags, "thanks!"),
  pubkey: publicKeyFixture("d".repeat(64)),
})

const receiptWith = (tags: ReadonlyArray<Tag>): NostrEvent => makeEvent(9735, tags)

const receiptFor = (request: unknown, bolt11 = SPEC_INVOICE_2500U): NostrEvent =>
  receiptWith([["description", JSON.stringify(request)], ["bolt11", bolt11]])

Deno.test("parseBolt11Amount - returns null for null input", () => {
  assertEquals(parseBolt11Amount(null), null)
})

Deno.test("parseBolt11Amount - returns null for a non-invoice string", () => {
  assertEquals(parseBolt11Amount("not-an-invoice"), null)
})

Deno.test("parseBolt11Amount - BOLT-11 vector: lnbc2500u is 250000 sat", () => {
  assertEquals(parseBolt11Amount(SPEC_INVOICE_2500U), 250000)
})

Deno.test("parseBolt11Amount - BOLT-11 vector: lnbc20m is 2000000 sat", () => {
  assertEquals(parseBolt11Amount("lnbc20m1pvjluezsp5zyg3zyg3zyg3zyg3zyg3"), 2000000)
})

Deno.test("parseBolt11Amount - BOLT-11 vector: lnbc9678785340p is 967878534 msat, floored to 967878 sat", () => {
  assertEquals(parseBolt11Amount("lnbc9678785340p1pwmna7lpp5gc3xfm08u9qy06djf8dfflhugl6p7"), 967878)
})

Deno.test("parseBolt11Amount - lnbc15n is 1500 msat, floored to 1 sat", () => {
  assertEquals(parseBolt11Amount("lnbc15n1pvjluez"), 1)
})

Deno.test("parseBolt11Amount - reads a milli-bitcoin amount", () => {
  assertEquals(parseBolt11Amount("lnbc1m1pvjluez"), 100000)
})

Deno.test("parseBolt11Amount - treats a multiplier-less amount as whole bitcoin", () => {
  assertEquals(parseBolt11Amount("lnbc11pvjluez"), 100000000)
})

Deno.test("parseBolt11Amount - reads every Bitcoin network prefix BOLT-11 names", () => {
  assertEquals(
    ["lnbc20m1pvjluez", "lntb20m1pvjluez", "lntbs20m1pvjluez", "lnbcrt20m1pvjluez"].map(parseBolt11Amount),
    [2000000, 2000000, 2000000, 2000000],
  )
})

Deno.test("parseBolt11Amount - reads an upper-case invoice", () => {
  assertEquals(parseBolt11Amount("LNBC2500U1PVJLUEZ"), 250000)
})

Deno.test("parseBolt11Amount - BOLT-11 vector: a mixed-case invoice is malformed bech32 and has no amount", () => {
  assertEquals(
    parseBolt11Amount(
      "LNBC2500u1pvjluezpp5qqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqypqdpquwpc4curk03c9wlrswe78q4eyqc7d8d0xqzpuyk0sg5g70me25alkluzd2x62aysf2pyy8edtjeevuv4p2d5p76r4zkmneet7uvyakky2zr4cusd45tftc9c5fh0nnqpnl2jfll544esqchsrny",
    ),
    null,
  )
})

Deno.test("parseBolt11Amount - a mixed-case data part is malformed bech32 and has no amount", () => {
  assertEquals(parseBolt11Amount("lnbc2500u1pvjluEz"), null)
})

Deno.test("parseBolt11Amount - BOLT-11 vector: an invoice without an amount has none", () => {
  assertEquals(
    parseBolt11Amount(
      "lnbc1pvjluezpp5qqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqypqdpl2pkx2ctnv5sxxmmwwd5kgetjypeh2ursdae8g6na6hlh",
    ),
    null,
  )
})

Deno.test("parseBolt11Amount - BOLT-11 vector: an unknown multiplier fails", () => {
  assertEquals(parseBolt11Amount("lnbc2500x1pvjluezpp5qqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqqq"), null)
})

Deno.test("parseBolt11Amount - BOLT-11 vector: a pico amount not ending in 0 fails", () => {
  assertEquals(parseBolt11Amount("lnbc2500000001p1pvjluezpp5qqqsyqcyq5rqwzqfqqqsyqcyq5rq"), null)
})

Deno.test("parseBolt11Amount - a currency prefix BOLT-11 does not name for Bitcoin is not read as bitcoin", () => {
  assertEquals(parseBolt11Amount("lnltc20m1pvjluez"), null)
})

Deno.test("parseBolt11Amount - the separator is the last 1, so text between an amount and it is malformed (shared ADR-0039)", () => {
  assertEquals(parseBolt11Amount("lnbc10u1xyz1qqq"), null)
})

Deno.test("parseBolt11Amount - an amount followed by a stray 1 before the separator is malformed (shared ADR-0039)", () => {
  assertEquals(parseBolt11Amount("lnbc1m11qq"), null)
})

Deno.test("parseBolt11Amount - an invoice without a bech32 separator is malformed (shared ADR-0039)", () => {
  assertEquals(["lnbc5mx", "lnbc20ux", "LNBC5MX"].map(parseBolt11Amount), [null, null, null])
})

Deno.test("parseBolt11Amount - an amount above 1 BTC is refused", () => {
  assertEquals(parseBolt11Amount("lnbc21pvjluez"), null)
})

Deno.test("parseBolt11Amount - an amount with a leading 0 is malformed (BOLT-11: no leading 0s, shared ADR-0039)", () => {
  assertEquals(parseBolt11Amount("lnbc010u1pvjluez"), null)
})

Deno.test("parseBolt11Amount - a zero amount is malformed (BOLT-11: a positive decimal integer, shared ADR-0039)", () => {
  assertEquals(parseBolt11Amount("lnbc0u1pvjluez"), null)
})

Deno.test("parseBolt11Amount - a pico amount ending in 0 is read in millisatoshis", () => {
  assertEquals(parseBolt11Amount("lnbc10000p1pvjluez"), 1)
})

Deno.test("parseZapReceipt - reads the sender, amount and message from the one zap request it carries", () => {
  const request = zapRequest()
  const receipt = receiptFor(request)
  const parsed = parseZapReceipt(receipt)
  assertEquals(parsed?.pubkey, request.pubkey)
  assertEquals(parsed?.amountSats, 250000)
  assertEquals(parsed?.amountMillisats, 250000000)
  assertEquals(parsed?.message, "thanks!")
  assertEquals(parsed?.zapRequest, request)
  assertEquals(parsed?.receipt, receipt)
})

Deno.test("parseZapReceipt - returns null for a kind other than 9735", () => {
  assertEquals(parseZapReceipt({ ...receiptFor(zapRequest()), kind: 1 }), null)
})

Deno.test("parseZapReceipt - returns null when the description is not a signed event (NIP-57 Appendix E)", () => {
  assertEquals(parseZapReceipt(receiptFor({ pubkey: "d".repeat(64), content: "x", tags: [] })), null)
})

Deno.test("parseZapReceipt - returns null when the carried event is not a kind-9734 zap request", () => {
  assertEquals(parseZapReceipt(receiptFor(zapRequest([], 1))), null)
})

Deno.test("parseZapReceipt - reads repeated identical description and bolt11 tags as one claim each (shared ADR-0014)", () => {
  const description = JSON.stringify(zapRequest())
  const receipt = receiptWith([
    ["description", description],
    ["description", description],
    ["bolt11", SPEC_INVOICE_2500U],
    ["bolt11", SPEC_INVOICE_2500U],
  ])
  assertEquals(parseZapReceipt(receipt)?.amountMillisats, 250000000)
})

Deno.test("parseZapReceipt - returns null with two description tags that differ, even when one is valid", () => {
  const receipt = receiptWith([
    ["description", JSON.stringify(zapRequest())],
    ["description", JSON.stringify({ ...zapRequest(), content: "other" })],
    ["bolt11", SPEC_INVOICE_2500U],
  ])
  assertEquals(parseZapReceipt(receipt), null)
})

Deno.test("parseZapReceipt - returns null with two bolt11 tags that differ", () => {
  const receipt = receiptWith([
    ["description", JSON.stringify(zapRequest())],
    ["bolt11", SPEC_INVOICE_2500U],
    ["bolt11", "lnbc1m1pvjluez"],
  ])
  assertEquals(parseZapReceipt(receipt), null)
})

Deno.test("parseZapReceipt - returns null without a bolt11 tag", () => {
  assertEquals(parseZapReceipt(receiptWith([["description", JSON.stringify(zapRequest())]])), null)
})

Deno.test("parseZapReceipt - returns null without a description tag", () => {
  assertEquals(parseZapReceipt(receiptWith([["bolt11", SPEC_INVOICE_2500U]])), null)
})

Deno.test("parseZapReceipt - returns null for malformed description JSON", () => {
  assertEquals(parseZapReceipt(receiptWith([["description", "{not json"], ["bolt11", SPEC_INVOICE_2500U]])), null)
})

Deno.test("parseZapReceipt - returns null when the request amount disagrees with the bolt11 invoice", () => {
  assertEquals(parseZapReceipt(receiptFor(zapRequest([["amount", "21000"]]))), null)
})

Deno.test("parseZapReceipt - returns null when any of several request amounts disagrees", () => {
  assertEquals(parseZapReceipt(receiptFor(zapRequest([["amount", "250000000"], ["amount", "1"]]))), null)
})

Deno.test("parseZapReceipt - returns null for an unsafe-integer request amount", () => {
  assertEquals(parseZapReceipt(receiptFor(zapRequest([["amount", "9223372036854775807"]]))), null)
})

Deno.test("parseZapReceipt - returns null when a request amount is empty, which states no amount (shared ADR-0079)", () => {
  assertEquals(parseZapReceipt(receiptFor(zapRequest([["amount", ""]]))), null)
})

Deno.test("parseZapReceipt - returns null when an empty request amount accompanies one that agrees (shared ADR-0079)", () => {
  assertEquals(parseZapReceipt(receiptFor(zapRequest([["amount", ""], ["amount", "250000000"]]))), null)
})

Deno.test("parseZapReceipt - parses when the request amount agrees with the bolt11 invoice", () => {
  assertEquals(parseZapReceipt(receiptFor(zapRequest([["amount", "250000000"]])))?.amountSats, 250000)
})

Deno.test("parseZapReceipt - ignores a receipt-level amount tag in favour of the bolt11 invoice", () => {
  const receipt = receiptWith([
    ["description", JSON.stringify(zapRequest())],
    ["amount", "9223372036854775807"],
    ["bolt11", SPEC_INVOICE_2500U],
  ])
  assertEquals(parseZapReceipt(receipt)?.amountSats, 250000)
})

Deno.test("parseZapReceipt - returns null when the bolt11 amount exceeds 1 BTC", () => {
  assertEquals(parseZapReceipt(receiptFor(zapRequest(), "lnbc21pvjluez")), null)
})

const signWith = async (secretKey: Uint8Array, event: UnsignedEvent): Promise<NostrEvent> => {
  const signed = await createLocalSigner(secretKey).signEvent(event)
  if (!signed.success) throw new Error("test signer failed")
  return signed.value
}

const publicKeyOf = async (secretKey: Uint8Array): Promise<PublicKey> => {
  const pubkey = await createLocalSigner(secretKey).getPublicKey()
  if (!pubkey.success) throw new Error("test signer failed")
  return pubkey.value
}

interface SignedZap {
  readonly receipt: ZapReceipt
  readonly provider: PublicKey
}

const signedZap = async (requestTags: ReadonlyArray<Tag> = []): Promise<SignedZap> => {
  const providerKey = secretKeyOf(0x11)
  const request = await signWith(secretKeyOf(0x22), {
    kind: 9734,
    created_at: 1700000000,
    tags: requestTags,
    content: "",
  })
  const receiptEvent = await signWith(providerKey, {
    kind: 9735,
    created_at: 1700000001,
    tags: [["description", JSON.stringify(request)], ["bolt11", SPEC_INVOICE_2500U]],
    content: "",
  })
  const receipt = parseZapReceipt(receiptEvent)
  if (receipt === null) throw new Error("test receipt did not parse")
  return { receipt, provider: await publicKeyOf(providerKey) }
}

Deno.test("verifyZapReceipt - accepts a receipt signed by the provider over a signed zap request", async () => {
  const { receipt, provider } = await signedZap()
  assertEquals(verifyZapReceipt(receipt, provider), ok(receipt))
})

Deno.test("verifyZapReceipt - refuses a receipt not signed by the recipient's lnurl provider (NIP-57 Appendix F)", async () => {
  const { receipt } = await signedZap()
  assertEquals(verifyZapReceipt(receipt, publicKeyFixture("e".repeat(64))), failure("provider-pubkey-mismatch"))
})

const NIP57_LNURL = "lnurl1dp68gurn8ghj7um5v93kketj9ehx2amn9uh8wetvdskkkmn0wahz7mrww4excup0dajx2mrv92x9xp"
const LUD01_LNURL =
  "LNURL1DP68GURN8GHJ7UM9WFMXJCM99E3K7MF0V9CXJ0M385EKVCENXC6R2C35XVUKXEFCV5MKVV34X5EKZD3EV56NYD3HXQURZEPEXEJXXEPNXSCRVWFNV9NXZCN9XQ6XYEFHVGCXXCMYXYMNSERXFQ5FNS"

const lnurlOf = (raw: string): Lnurl => {
  const lnurl = parseLnurl(raw)
  if (lnurl === null) throw new Error(`test lnurl did not parse: ${raw}`)
  return lnurl
}

Deno.test("verifyZapReceipt - refuses a zap request whose lnurl tag differs from the expected one", async () => {
  const { receipt, provider } = await signedZap([["lnurl", NIP57_LNURL]])
  assertEquals(verifyZapReceipt(receipt, provider, lnurlOf(LUD01_LNURL)), failure("lnurl-mismatch"))
})

Deno.test("verifyZapReceipt - refuses a zap request whose lnurl tag is empty, which is not the expected lnurl (shared ADR-0079)", async () => {
  const { receipt, provider } = await signedZap([["lnurl", ""]])
  assertEquals(verifyZapReceipt(receipt, provider, lnurlOf(NIP57_LNURL)), failure("lnurl-mismatch"))
})

Deno.test("verifyZapReceipt - accepts a zap request whose lnurl tag is the expected lnurl written in upper case", async () => {
  const { receipt, provider } = await signedZap([["lnurl", NIP57_LNURL.toUpperCase()]])
  assertEquals(verifyZapReceipt(receipt, provider, lnurlOf(NIP57_LNURL)), ok(receipt))
})

Deno.test("verifyZapReceipt - checks a request built with the recipient's lnurl against that lnurl", async () => {
  const lnurl = lnurlOf(NIP57_LNURL)
  const recipient = publicKeyFixture("04c915daefee38317fa734444acee390a8269fe5810b2241e5e6dd343dfbecc9")
  const request = buildZapRequest({
    recipientPubkey: recipient,
    relayUrls: [RELAY],
    amountMillisats: 250_000_000,
    lnurl,
  })
  const { receipt, provider } = await signedZap(request.tags)
  assertEquals(verifyZapReceipt(receipt, provider, lnurl), ok(receipt))
})

Deno.test("verifyZapReceipt - refuses a receipt whose own signature does not verify", async () => {
  const { receipt, provider } = await signedZap()
  const forged = { ...receipt, receipt: { ...receipt.receipt, content: "tampered" } }
  assertEquals(verifyZapReceipt(forged, provider), failure("receipt-signature-invalid"))
})

Deno.test("verifyZapReceipt - refuses a zap request whose signature does not verify", async () => {
  const { receipt, provider } = await signedZap()
  const forged = { ...receipt, zapRequest: { ...receipt.zapRequest, content: "tampered" } }
  assertEquals(verifyZapReceipt(forged, provider), failure("zap-request-signature-invalid"))
})

Deno.test("parseNutzap - sums proof amounts", () => {
  const event = makeEvent(9321, [
    ["proof", JSON.stringify({ amount: 10 })],
    ["proof", JSON.stringify({ amount: 5 })],
  ], "nice")
  const info = parseNutzap(event)
  assertEquals(info?.amountSats, 15)
  assertEquals(info?.message, "nice")
  assertEquals(info?.pubkey, pk)
})

Deno.test("parseNutzap - converts msat units to sats", () => {
  const event = makeEvent(9321, [
    ["proof", JSON.stringify({ amount: 21000 })],
    ["unit", "msat"],
  ])
  assertEquals(parseNutzap(event)?.amountSats, 21)
})

Deno.test('parseNutzap - reads proofs as sats when the unit tag is sat or absent (NIP-61: "Default: `sat` if omitted")', () => {
  const proof: Tag = ["proof", JSON.stringify({ amount: 21 })]
  assertEquals(parseNutzap(makeEvent(9321, [proof, ["unit", "sat"]]))?.amountSats, 21)
  assertEquals(parseNutzap(makeEvent(9321, [proof]))?.amountSats, 21)
})

Deno.test("parseNutzap - returns null for a unit that is not bitcoin, since usd or eur proofs state no sats (NIP-61)", () => {
  assertEquals(parseNutzap(makeEvent(9321, [["proof", JSON.stringify({ amount: 5 })], ["unit", "usd"]])), null)
})

Deno.test("parseNutzap - returns null when unit tags disagree, whatever their order (shared ADR-0014)", () => {
  const proof: Tag = ["proof", JSON.stringify({ amount: 21000 })]
  assertEquals(parseNutzap(makeEvent(9321, [proof, ["unit", "msat"], ["unit", "sat"]])), null)
  assertEquals(parseNutzap(makeEvent(9321, [proof, ["unit", "sat"], ["unit", "msat"]])), null)
})

Deno.test("parseNutzap - reads a repeated identical unit tag as one claim (shared ADR-0014)", () => {
  const event = makeEvent(9321, [["proof", JSON.stringify({ amount: 21000 })], ["unit", "msat"], ["unit", "msat"]])
  assertEquals(parseNutzap(event)?.amountSats, 21)
})

Deno.test("parseNutzap - counts a proof repeated in identical tags once (shared ADR-0014)", () => {
  const proof: Tag = ["proof", JSON.stringify({ amount: 10, secret: "s1" })]
  assertEquals(parseNutzap(makeEvent(9321, [proof, proof]))?.amountSats, 10)
})

Deno.test("parseNutzap - returns null without proof tags", () => {
  assertEquals(parseNutzap(makeEvent(9321, [["unit", "sat"]])), null)
})

Deno.test("parseNutzap - returns null when the proof total exceeds 1 BTC", () => {
  const event = makeEvent(9321, [
    ["proof", JSON.stringify({ amount: 100_000_000 })],
    ["proof", JSON.stringify({ amount: 1 })],
  ])
  assertEquals(parseNutzap(event), null)
})

Deno.test("parseNutzap - skips a proof whose amount is not a number (shared ADR-0080)", () => {
  const event = makeEvent(9321, [
    ["proof", JSON.stringify({ amount: "not-a-number" })],
    ["proof", JSON.stringify({ amount: 5 })],
  ])
  assertEquals(parseNutzap(event)?.amountSats, 5)
})

Deno.test("parseNutzap - skips a proof that is not JSON", () => {
  const event = makeEvent(9321, [["proof", "not valid json"], ["proof", JSON.stringify({ amount: 5 })]])
  assertEquals(parseNutzap(event)?.amountSats, 5)
})

Deno.test("parseNutzap - skips a proof that is not an object", () => {
  const event = makeEvent(9321, [["proof", "[1, 2, 3]"], ["proof", JSON.stringify({ amount: 7 })]])
  assertEquals(parseNutzap(event)?.amountSats, 7)
})

Deno.test("parseNutzap - returns null when every proof is malformed, leaving no amount", () => {
  assertEquals(
    parseNutzap(makeEvent(9321, [["proof", "not valid json"], ["proof", JSON.stringify({ amount: "5" })]])),
    null,
  )
})

Deno.test("parseNutzap - returns null when any proof amount is negative (shared ADR-0080)", () => {
  const event = makeEvent(9321, [["proof", JSON.stringify({ amount: -5 })], ["proof", JSON.stringify({ amount: 10 })]])
  assertEquals(parseNutzap(event), null)
})

Deno.test("parseNutzap - skips a proof whose amount is fractional", () => {
  const event = makeEvent(9321, [["proof", JSON.stringify({ amount: 1.5 })], ["proof", JSON.stringify({ amount: 10 })]])
  assertEquals(parseNutzap(event)?.amountSats, 10)
})

Deno.test("parseZapReceipt - NIP-57 Appendix E example: the sender is the zap request's author and 10u is 1000 sat", () => {
  const receipt: NostrEvent = {
    ...makeEvent(9735, [[
      "bolt11",
      "lnbc10u1p3unwfusp5t9r3yymhpfqculx78u027lxspgxcr2n2987mx2j55nnfs95nxnzqpp5jmrh92pfld78spqs78v9euf2385t83uvpwk9ldrlvf6ch7tpascqhp5zvkrmemgth3tufcvflmzjzfvjt023nazlhljz2n9hattj4f8jq8qxqyjw5qcqpjrzjqtc4fc44feggv7065fqe5m4ytjarg3repr5j9el35xhmtfexc42yczarjuqqfzqqqqqqqqlgqqqqqqgq9q9qxpqysgq079nkq507a5tw7xgttmj4u990j7wfggtrasah5gd4ywfr2pjcn29383tphp4t48gquelz9z78p4cq7ml3nrrphw5w6eckhjwmhezhnqpy6gyf0",
    ], [
      "description",
      '{"pubkey":"97c70a44366a6535c145b333f973ea86dfdc2d7a99da618c40c64705ad98e322","content":"","id":"d9cc14d50fcb8c27539aacf776882942c1a11ea4472f8cdec1dea82fab66279d","created_at":1674164539,"sig":"77127f636577e9029276be060332ea565deaf89ff215a494ccff16ae3f757065e2bc59b2e8c113dd407917a010b3abd36c8d7ad84c0e3ab7dab3a0b0caa9835d","kind":9734,"tags":[["e","3624762a1274dd9636e0c552b53086d70bc88c165bc4dc0f9e836a1eaf86c3b8"],["p","32e1827635450ebb3c5a7d12c1f8e7b2b514439ac10a67eef3d9fd9c5c68e245"],["relays","wss://relay.damus.io","wss://nostr-relay.wlvs.space","wss://nostr.fmt.wiz.biz","wss://relay.nostr.bg","wss://nostr.oxtr.dev","wss://nostr.v0l.io","wss://brb.io","wss://nostr.bitcoiner.social","ws://monad.jb55.com:8080","wss://relay.snort.social"]]}',
    ]]),
    id: eventIdFixture("67b48a14fb66c60c8f9070bdeb37afdfcc3d08ad01989460448e4081eddda446"),
    pubkey: publicKeyFixture("9630f464cca6a5147aa8a35f0bcdd3ce485324e732fd39e09233b1d848238f31"),
  }
  const parsed = parseZapReceipt(receipt)
  assertEquals(parsed?.pubkey, "97c70a44366a6535c145b333f973ea86dfdc2d7a99da618c40c64705ad98e322")
  assertEquals(parsed?.amountSats, 1000)
})
