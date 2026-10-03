import { assertEquals } from "@std/assert"
import { buildDmGiftWraps } from "../../src/application/service/dm-crypto.ts"
import { buildRumour, chatRoomMembers } from "../../src/domain/service/rumour.ts"
import { buildPrivateMessage } from "../../src/domain/service/builder.ts"
import type { Signer } from "../../src/domain/service/signer.ts"
import type { PublicKey } from "../../src/domain/value-object/public-key.ts"
import { ok } from "../../src/domain/value-object/result.ts"
import { createStubSigner, eventIdFixture, publicKeyFixture, sigFixture } from "../../testing.ts"

const PUBKEY_A = publicKeyFixture("a".repeat(64))
const PUBKEY_B = publicKeyFixture("b".repeat(64))
const PUBKEY_C = publicKeyFixture("c".repeat(64))
const EPHEMERAL_PUBKEY = publicKeyFixture("f".repeat(64))

const wrappingSigner = (pubkey: PublicKey): Signer =>
  createStubSigner({
    pubkey,
    nip44Encrypt: (_pubkey, plaintext) => ok(`enc:${plaintext}`),
    signEvent: (event) =>
      ok({ ...event, id: eventIdFixture("d".repeat(64)), pubkey, sig: sigFixture("e".repeat(128)) }),
  })

Deno.test("buildDmGiftWraps - wraps a group message to every member of the room its rumour names, the sender included, once each (NIP-17)", async () => {
  const result = await buildDmGiftWraps({
    signer: wrappingSigner(PUBKEY_B),
    createEphemeralSigner: () => wrappingSigner(EPHEMERAL_PUBKEY),
    rumour: buildRumour({
      kind: 14,
      pubkey: PUBKEY_B,
      created_at: 1700000000,
      tags: [["p", PUBKEY_C], ["p", PUBKEY_A], ["p", PUBKEY_C]],
      content: "hi all",
    }),
  })
  assertEquals(result.success && result.value.map((wrap) => wrap.targetPubkey), [PUBKEY_A, PUBKEY_B, PUBKEY_C])
})

Deno.test("buildDmGiftWraps - wraps once to a sender who also names themself in a p tag", async () => {
  const result = await buildDmGiftWraps({
    signer: wrappingSigner(PUBKEY_A),
    createEphemeralSigner: () => wrappingSigner(EPHEMERAL_PUBKEY),
    rumour: buildRumour({
      kind: 14,
      pubkey: PUBKEY_A,
      created_at: 1700000000,
      tags: [["p", PUBKEY_A]],
      content: "note",
    }),
  })
  assertEquals(result.success && result.value.map((wrap) => wrap.targetPubkey), [PUBKEY_A])
})

Deno.test("buildDmGiftWraps - wraps a note to self once, to its sender", async () => {
  const result = await buildDmGiftWraps({
    signer: wrappingSigner(PUBKEY_A),
    createEphemeralSigner: () => wrappingSigner(EPHEMERAL_PUBKEY),
    rumour: buildPrivateMessage({ sender: PUBKEY_A, receivers: [] }, "note"),
  })
  assertEquals(result.success && result.value.map((wrap) => wrap.targetPubkey), [PUBKEY_A])
})

Deno.test("buildDmGiftWraps - addresses each wrap's p tag to the member it is wrapped to", async () => {
  const result = await buildDmGiftWraps({
    signer: wrappingSigner(PUBKEY_A),
    createEphemeralSigner: () => wrappingSigner(EPHEMERAL_PUBKEY),
    rumour: buildRumour({ kind: 7, pubkey: PUBKEY_A, created_at: 1700000000, tags: [["p", PUBKEY_B]], content: "+" }),
  })
  assertEquals(result.success && result.value.map((wrap) => wrap.event.tags), [[["p", PUBKEY_A]], [["p", PUBKEY_B]]])
})

Deno.test("chatRoomMembers - a room is the sender and every p-tagged receiver, sorted and once each (NIP-17)", () => {
  const rumour = buildRumour({
    kind: 14,
    pubkey: PUBKEY_B,
    created_at: 1700000000,
    tags: [["p", PUBKEY_C], ["p", PUBKEY_A], ["p", PUBKEY_C], ["p", "not-a-key"], ["e", "c".repeat(64)]],
    content: "hi",
  })
  assertEquals(chatRoomMembers(rumour), [PUBKEY_A, PUBKEY_B, PUBKEY_C])
})

Deno.test("chatRoomMembers - adding or removing a p tag makes a different room (NIP-17)", () => {
  const base = { kind: 14, pubkey: PUBKEY_A, created_at: 1700000000, content: "hi" }
  const pair = chatRoomMembers(buildRumour({ ...base, tags: [["p", PUBKEY_B]] }))
  const trio = chatRoomMembers(buildRumour({ ...base, tags: [["p", PUBKEY_B], ["p", PUBKEY_C]] }))
  assertEquals([pair, trio], [[PUBKEY_A, PUBKEY_B], [PUBKEY_A, PUBKEY_B, PUBKEY_C]])
})
