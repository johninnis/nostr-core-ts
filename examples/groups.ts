/**
 * Walkthrough of the NIP-29 group helpers of @innis/nostr-core.
 *
 * Run with: `deno run examples/groups.ts` (no permissions required — the relay's metadata event is signed locally, so
 * everything runs locally). Each step asserts what it shows.
 *
 * @module
 */

import { assert, assertEquals } from "@std/assert"
import {
  buildGroupChatMessage,
  buildReaction,
  buildReply,
  compileFilter,
  createLocalSigner,
  generateSecretKey,
  groupChatFilter,
  groupMetadataFilter,
  groupRelayHintOf,
  KIND_GROUP_METADATA,
  parseGroupMetadata,
  parseRelayUrl,
  withGroupTag,
} from "../mod.ts"
import type { NostrEvent, Signer, UnsignedEvent } from "../mod.ts"

const relay = parseRelayUrl("wss://groups.example")
assert(relay !== null)
const relaySigner = createLocalSigner(generateSecretKey())
const member = createLocalSigner(generateSecretKey())
const sign = async (signer: Signer, event: UnsignedEvent): Promise<NostrEvent> => {
  const signed = await signer.signEvent(event)
  if (!signed.success) throw new Error(signed.error.message)
  return signed.value
}

const metadata = await sign(relaySigner, {
  kind: KIND_GROUP_METADATA,
  created_at: 1700000000,
  tags: [["d", "pizza"], ["name", "Pizza lovers"], ["closed"]],
  content: "",
})
assert(compileFilter(groupMetadataFilter("pizza")).matches(metadata))
const group = parseGroupMetadata(metadata, relay)
assertEquals([group?.id, group?.name, group?.isPublic, group?.isOpen], ["pizza", "Pizza lovers", true, false])

const message = await sign(
  member,
  buildGroupChatMessage({ groupId: "pizza", content: "margherita?", relayHint: relay }),
)
assert(compileFilter(groupChatFilter("pizza")).matches(message))
assertEquals(groupRelayHintOf(message), relay)

const reply = await sign(member, withGroupTag(buildReply("always", message, relay), "pizza", relay))
assertEquals(reply.tags, [["q", message.id, relay, message.pubkey], ["h", "pizza", relay]])

const reaction = withGroupTag(buildReaction(message), message, relay)
assertEquals(reaction.tags.find((tag) => tag[0] === "h"), ["h", "pizza", relay])
