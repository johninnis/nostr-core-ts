import { assertEquals } from "@std/assert"
import { DEFAULT_REACTION, formatReactionEmoji } from "../../src/domain/service/reaction.ts"

Deno.test("formatReactionEmoji - returns heart for + (NIP-25 like)", () => {
  assertEquals(formatReactionEmoji("+"), "\u2764\uFE0F")
})

Deno.test("formatReactionEmoji - returns heart for null", () => {
  assertEquals(formatReactionEmoji(null), "\u2764\uFE0F")
})

Deno.test("formatReactionEmoji - returns heart for undefined", () => {
  assertEquals(formatReactionEmoji(undefined), "\u2764\uFE0F")
})

Deno.test("formatReactionEmoji - returns heart for empty string", () => {
  assertEquals(formatReactionEmoji(""), "\u2764\uFE0F")
})

Deno.test("formatReactionEmoji - returns content unchanged for custom emoji", () => {
  assertEquals(formatReactionEmoji("\uD83C\uDF89"), "\uD83C\uDF89")
})

Deno.test("formatReactionEmoji - returns content unchanged for - (downvote)", () => {
  assertEquals(formatReactionEmoji("-"), "-")
})

Deno.test("formatReactionEmoji - returns content unchanged for emoji shortcode", () => {
  assertEquals(formatReactionEmoji(":fire:"), ":fire:")
})

Deno.test("DEFAULT_REACTION - is the NIP-25 + sentinel", () => {
  assertEquals(DEFAULT_REACTION, "+")
})

Deno.test("DEFAULT_REACTION - is treated as a like by formatReactionEmoji", () => {
  assertEquals(formatReactionEmoji(DEFAULT_REACTION), "❤️")
})
