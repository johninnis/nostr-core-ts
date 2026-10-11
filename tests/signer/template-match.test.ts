import { assertEquals } from "@std/assert"
import type { SignerFailure } from "../../src/domain/failure/signer-failure.ts"
import type { Tag, UnsignedEvent } from "../../src/domain/value-object/nostr-event.ts"
import { checkSignedMatchesTemplate } from "../../src/domain/service/template-match.ts"
import { buildEventFixture } from "../../testing.ts"

const EVENT_TAG: Tag = ["e", "e".repeat(64)]
const PUBKEY_TAG: Tag = ["p", "f".repeat(64)]

const TEMPLATE: UnsignedEvent = { kind: 1, content: "hi", tags: [EVENT_TAG, PUBKEY_TAG], created_at: 1700000000 }

const DIFFERS_FROM_TEMPLATE: SignerFailure = {
  type: "sign-failed",
  message: "Signer returned an event that differs from the template it was asked to sign",
}

Deno.test("checkSignedMatchesTemplate - null when the signed event carries the template's fields", () => {
  assertEquals(checkSignedMatchesTemplate(TEMPLATE, buildEventFixture(TEMPLATE)), null)
})

Deno.test("checkSignedMatchesTemplate - sign-failed when the kind differs", () => {
  assertEquals(checkSignedMatchesTemplate(TEMPLATE, buildEventFixture({ ...TEMPLATE, kind: 7 })), DIFFERS_FROM_TEMPLATE)
})

Deno.test("checkSignedMatchesTemplate - sign-failed when the content differs", () => {
  assertEquals(
    checkSignedMatchesTemplate(TEMPLATE, buildEventFixture({ ...TEMPLATE, content: "altered" })),
    DIFFERS_FROM_TEMPLATE,
  )
})

Deno.test("checkSignedMatchesTemplate - sign-failed when created_at differs", () => {
  assertEquals(
    checkSignedMatchesTemplate(TEMPLATE, buildEventFixture({ ...TEMPLATE, created_at: 1700000001 })),
    DIFFERS_FROM_TEMPLATE,
  )
})

Deno.test("checkSignedMatchesTemplate - sign-failed when the tags are reordered", () => {
  assertEquals(
    checkSignedMatchesTemplate(TEMPLATE, buildEventFixture({ ...TEMPLATE, tags: [PUBKEY_TAG, EVENT_TAG] })),
    DIFFERS_FROM_TEMPLATE,
  )
})

Deno.test("checkSignedMatchesTemplate - sign-failed when a tag is added", () => {
  assertEquals(
    checkSignedMatchesTemplate(
      TEMPLATE,
      buildEventFixture({ ...TEMPLATE, tags: [EVENT_TAG, PUBKEY_TAG, ["client", "signer"]] }),
    ),
    DIFFERS_FROM_TEMPLATE,
  )
})

Deno.test("checkSignedMatchesTemplate - sign-failed when a tag gains an element", () => {
  assertEquals(
    checkSignedMatchesTemplate(
      TEMPLATE,
      buildEventFixture({ ...TEMPLATE, tags: [[...EVENT_TAG, "wss://relay.example.com"], PUBKEY_TAG] }),
    ),
    DIFFERS_FROM_TEMPLATE,
  )
})
