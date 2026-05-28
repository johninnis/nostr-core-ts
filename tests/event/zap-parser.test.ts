import { assertEquals } from "@std/assert"
import {
  parseAmountSats,
  parseBolt11Amount,
  parseNutzap,
  parseZapReceipt,
} from "../../src/domain/service/zap-parser.ts"
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

Deno.test("parseAmountSats - converts a millisat amount tag to sats", () => {
  assertEquals(parseAmountSats([["amount", "21000"]]), 21)
})

Deno.test("parseAmountSats - falls back to the bolt11 tag", () => {
  assertEquals(parseAmountSats([["bolt11", "lnbc2500u1pvjluez"]]), 250000)
})

Deno.test("parseAmountSats - returns null when no amount is present", () => {
  assertEquals(parseAmountSats([["e", "abc"]]), null)
})

Deno.test("parseZapReceipt - extracts the zapper and amount from a receipt", () => {
  const description = JSON.stringify({ pubkey: "d".repeat(64), content: "thanks!" })
  const receipt = makeEvent(9735, [["description", description], ["amount", "21000"]])
  const info = parseZapReceipt(receipt)
  assertEquals(info?.pubkey, "d".repeat(64))
  assertEquals(info?.amountSats, 21)
  assertEquals(info?.message, "thanks!")
  assertEquals(info?.npub.startsWith("npub1"), true)
})

Deno.test("parseZapReceipt - returns null without a description tag", () => {
  assertEquals(parseZapReceipt(makeEvent(9735, [["amount", "21000"]])), null)
})

Deno.test("parseZapReceipt - returns null for malformed description JSON", () => {
  assertEquals(parseZapReceipt(makeEvent(9735, [["description", "{not json"]])), null)
})

Deno.test("parseZapReceipt - returns null when the request pubkey is invalid", () => {
  const description = JSON.stringify({ pubkey: "tooshort", content: "x" })
  assertEquals(parseZapReceipt(makeEvent(9735, [["description", description]])), null)
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

Deno.test("parseZapReceipt - returns null when the description JSON is not an object", () => {
  assertEquals(parseZapReceipt(makeEvent(9735, [["description", "[1, 2, 3]"]])), null)
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
