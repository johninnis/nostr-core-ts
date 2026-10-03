import { assertEquals, assertThrows } from "@std/assert"
import { InvalidArgumentError } from "../../src/domain/exception/invalid-argument-error.ts"
import { buildZapRequest } from "../../src/domain/service/builder.ts"
import {
  KIND_LONGFORM_CONTENT,
  KIND_METADATA,
  KIND_TEXT_NOTE,
  KIND_ZAP_REQUEST,
} from "../../src/domain/value-object/kinds.ts"
import type { Rumour } from "../../src/domain/value-object/nostr-event.ts"
import { eventIdFixture, lnurlFixture, publicKeyFixture, relayUrlFixture } from "../../testing.ts"

const recipient = publicKeyFixture("04c915daefee38317fa734444acee390a8269fe5810b2241e5e6dd343dfbecc9")
const zappedId = eventIdFixture("9ae37aa68f48645127299e9453eb5d908a0cbb6058ff340d528ed4d37c8994fb")
const RELAY_1 = relayUrlFixture("wss://nostr-pub.wellorder.com")
const RELAY_2 = relayUrlFixture("wss://anotherrelay.example.com")
const lnurl = lnurlFixture("lnurl1dp68gurn8ghj7um5v93kketj9ehx2amn9uh8wetvdskkkmn0wahz7mrww4excup0dajx2mrv92x9xp")

const zapped = (overrides: Partial<Rumour> & { kind: number }): Rumour => ({
  id: zappedId,
  pubkey: recipient,
  created_at: 1679673265,
  content: "",
  tags: [],
  ...overrides,
})

Deno.test("buildZapRequest - reproduces the NIP-57 Appendix A example's tags", () => {
  const event = buildZapRequest({
    recipientPubkey: recipient,
    relayUrls: [RELAY_1, RELAY_2],
    amountMillisats: 21000,
    target: zapped({ kind: KIND_TEXT_NOTE }),
    lnurl,
    comment: "Zap!",
  })
  assertEquals([event.kind, event.content, event.tags], [KIND_ZAP_REQUEST, "Zap!", [
    ["relays", RELAY_1, RELAY_2],
    ["amount", "21000"],
    ["lnurl", "lnurl1dp68gurn8ghj7um5v93kketj9ehx2amn9uh8wetvdskkkmn0wahz7mrww4excup0dajx2mrv92x9xp"],
    ["p", recipient],
    ["e", zappedId],
    ["k", "1"],
  ]])
})

Deno.test("buildZapRequest - a zap to a person has no e, k or a tag and no lnurl unless given", () => {
  const event = buildZapRequest({ recipientPubkey: recipient, relayUrls: [RELAY_1], amountMillisats: 21000 })
  assertEquals(event.tags, [["relays", RELAY_1], ["amount", "21000"], ["p", recipient]])
})

Deno.test("buildZapRequest - a zapped addressable event is also named by its a coordinate", () => {
  const article = zapped({ kind: KIND_LONGFORM_CONTENT, tags: [["d", "my-article"]] })
  const event = buildZapRequest({
    recipientPubkey: recipient,
    relayUrls: [RELAY_1],
    amountMillisats: 1,
    target: article,
  })
  assertEquals(event.tags.slice(-3), [["e", zappedId], ["k", String(KIND_LONGFORM_CONTENT)], [
    "a",
    `${KIND_LONGFORM_CONTENT}:${recipient}:my-article`,
  ]])
})

Deno.test("buildZapRequest - a zapped replaceable event is named by its e and k tags, with no a coordinate", () => {
  const profile = zapped({ kind: KIND_METADATA })
  const event = buildZapRequest({
    recipientPubkey: recipient,
    relayUrls: [RELAY_1],
    amountMillisats: 1,
    target: profile,
  })
  assertEquals(event.tags.slice(-2), [["e", zappedId], ["k", String(KIND_METADATA)]])
})

Deno.test("buildZapRequest - defaults to an empty comment", () => {
  assertEquals(buildZapRequest({ recipientPubkey: recipient, relayUrls: [RELAY_1], amountMillisats: 1 }).content, "")
})

Deno.test("buildZapRequest - refuses, at compile time, an empty relay list", () => {
  // @ts-expect-error: NIP-57 needs at least one relay for the receipt
  const event = buildZapRequest({ recipientPubkey: recipient, relayUrls: [], amountMillisats: 1 })
  assertEquals(event.kind, KIND_ZAP_REQUEST)
})

Deno.test("buildZapRequest - refuses, at compile time, null as a second spelling of an absent target (ADR-0033)", () => {
  const input: Parameters<typeof buildZapRequest>[0] = {
    recipientPubkey: recipient,
    relayUrls: [RELAY_1],
    amountMillisats: 1,
    // @ts-expect-error: an absent target is left out, never null
    target: null,
  }
  assertEquals(input.target, null)
})

Deno.test("buildZapRequest - pins created_at to the given createdAt", () => {
  const event = buildZapRequest({
    recipientPubkey: recipient,
    relayUrls: [RELAY_1],
    amountMillisats: 1,
    createdAt: 1700000000,
  })
  assertEquals(event.created_at, 1700000000)
})

for (const amountMillisats of [0, -1, 1.5, Number.NaN, Number.MAX_SAFE_INTEGER + 1]) {
  Deno.test(`buildZapRequest - refuses an amount of ${amountMillisats}, which is no whole number of millisats`, () => {
    assertThrows(
      () => buildZapRequest({ recipientPubkey: recipient, relayUrls: [RELAY_1], amountMillisats }),
      InvalidArgumentError,
    )
  })
}
