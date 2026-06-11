import { assertEquals } from "@std/assert"
import { parseBolt11Amount, parseNutzap, parseZapReceipt } from "../../src/domain/service/zap-parser.ts"
import type { NostrEvent, Tag } from "../../src/domain/value-object/nostr-event.ts"
import { parseEventId } from "../../src/domain/value-object/event-id.ts"
import { parsePublicKey } from "../../src/domain/value-object/public-key.ts"
import { parseSig } from "../../src/domain/value-object/sig.ts"

const pk = parsePublicKey("a".repeat(64))
const id = parseEventId("b".repeat(64))

const makeEvent = (kind: number, tags: ReadonlyArray<Tag>, content = ""): NostrEvent => ({
  id,
  pubkey: pk,
  kind,
  content,
  tags,
  created_at: 1700000000,
  sig: parseSig("c".repeat(128)),
})

const makeDescription = (requestTags?: ReadonlyArray<Tag>): string =>
  JSON.stringify({ pubkey: "d".repeat(64), content: "thanks!", ...(requestTags ? { tags: requestTags } : {}) })

Deno.test("parseBolt11Amount - returns null for null input", () => {
  assertEquals(parseBolt11Amount(null), null)
})

Deno.test("parseBolt11Amount - returns null for a non-invoice string", () => {
  assertEquals(parseBolt11Amount("not-an-invoice"), null)
})

Deno.test("parseBolt11Amount - reads a micro-bitcoin amount", () => {
  assertEquals(parseBolt11Amount("lnbc2500u1pvjluezpp5"), 250000)
})

Deno.test("parseBolt11Amount - reads a milli-bitcoin amount", () => {
  assertEquals(parseBolt11Amount("lnbc1m1pvjluez"), 100000)
})

Deno.test("parseBolt11Amount - reads a nano-bitcoin amount", () => {
  assertEquals(parseBolt11Amount("lnbc10n1pvjluez"), 1)
})

Deno.test("parseBolt11Amount - treats a suffix-less amount as whole bitcoin", () => {
  assertEquals(parseBolt11Amount("lnbc21pvjluez"), 200000000)
})

Deno.test("parseBolt11Amount - reads a pico-bitcoin amount divisible by 10", () => {
  assertEquals(parseBolt11Amount("lnbc2500000000p1pvjluez"), 250000)
})

Deno.test("parseBolt11Amount - returns null for a pico-bitcoin amount not divisible by 10", () => {
  assertEquals(parseBolt11Amount("lnbc25p1pvjluez"), null)
})

Deno.test("parseZapReceipt - derives the amount from the bolt11 invoice", () => {
  const receipt = makeEvent(9735, [["description", makeDescription()], ["bolt11", "lnbc2500u1pvjluez"]])
  const info = parseZapReceipt(receipt)
  assertEquals(info?.pubkey, "d".repeat(64))
  assertEquals(info?.amountSats, 250000)
  assertEquals(info?.message, "thanks!")
  assertEquals(info?.npub.startsWith("npub1"), true)
})

Deno.test("parseZapReceipt - returns null without a bolt11 tag", () => {
  assertEquals(parseZapReceipt(makeEvent(9735, [["description", makeDescription()]])), null)
})

Deno.test("parseZapReceipt - returns null for a forged unsafe-integer request amount with no bolt11", () => {
  const description = makeDescription([["amount", "9223372036854775807"]])
  assertEquals(parseZapReceipt(makeEvent(9735, [["description", description]])), null)
})

Deno.test("parseZapReceipt - returns null when the request amount disagrees with the bolt11 invoice", () => {
  const description = makeDescription([["amount", "21000"]])
  const receipt = makeEvent(9735, [["description", description], ["bolt11", "lnbc2500u1pvjluez"]])
  assertEquals(parseZapReceipt(receipt), null)
})

Deno.test("parseZapReceipt - returns null for an unsafe-integer request amount even with a bolt11 invoice", () => {
  const description = makeDescription([["amount", "9223372036854775807"]])
  const receipt = makeEvent(9735, [["description", description], ["bolt11", "lnbc2500u1pvjluez"]])
  assertEquals(parseZapReceipt(receipt), null)
})

Deno.test("parseZapReceipt - parses when the request amount agrees with the bolt11 invoice", () => {
  const description = makeDescription([["amount", "21000"]])
  const receipt = makeEvent(9735, [["description", description], ["bolt11", "lnbc210n1pvjluez"]])
  assertEquals(parseZapReceipt(receipt)?.amountSats, 21)
})

Deno.test("parseZapReceipt - ignores a receipt-level amount tag in favour of the bolt11 invoice", () => {
  const receipt = makeEvent(9735, [
    ["description", makeDescription()],
    ["amount", "9223372036854775807"],
    ["bolt11", "lnbc2500u1pvjluez"],
  ])
  assertEquals(parseZapReceipt(receipt)?.amountSats, 250000)
})

Deno.test("parseZapReceipt - returns null when the bolt11 amount exceeds 1 BTC", () => {
  const receipt = makeEvent(9735, [["description", makeDescription()], ["bolt11", "lnbc21pvjluez"]])
  assertEquals(parseZapReceipt(receipt), null)
})

Deno.test("parseZapReceipt - returns null without a description tag", () => {
  assertEquals(parseZapReceipt(makeEvent(9735, [["bolt11", "lnbc2500u1pvjluez"]])), null)
})

Deno.test("parseZapReceipt - returns null for malformed description JSON", () => {
  assertEquals(parseZapReceipt(makeEvent(9735, [["description", "{not json"]])), null)
})

Deno.test("parseZapReceipt - returns null when the request pubkey is invalid", () => {
  const description = JSON.stringify({ pubkey: "tooshort", content: "x" })
  assertEquals(parseZapReceipt(makeEvent(9735, [["description", description]])), null)
})

Deno.test("parseZapReceipt - returns null when the description JSON is not an object", () => {
  assertEquals(parseZapReceipt(makeEvent(9735, [["description", "[1, 2, 3]"]])), null)
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

Deno.test("parseNutzap - returns null when any proof has a non-numeric amount", () => {
  const event = makeEvent(9321, [
    ["proof", JSON.stringify({ amount: "not-a-number" })],
    ["proof", JSON.stringify({ amount: 5 })],
  ])
  assertEquals(parseNutzap(event), null)
})

Deno.test("parseNutzap - returns null when any proof is not an object", () => {
  const event = makeEvent(9321, [["proof", "[1, 2, 3]"], ["proof", JSON.stringify({ amount: 7 })]])
  assertEquals(parseNutzap(event), null)
})

Deno.test("parseNutzap - returns null when any proof amount is negative", () => {
  const event = makeEvent(9321, [["proof", JSON.stringify({ amount: -5 })], ["proof", JSON.stringify({ amount: 10 })]])
  assertEquals(parseNutzap(event), null)
})

Deno.test("parseNutzap - returns null when any proof amount is fractional", () => {
  const event = makeEvent(9321, [["proof", JSON.stringify({ amount: 1.5 })], ["proof", JSON.stringify({ amount: 10 })]])
  assertEquals(parseNutzap(event), null)
})
