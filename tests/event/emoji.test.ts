import { assertEquals } from "@std/assert"
import type { Tag } from "../../src/domain/value-object/nostr-event.ts"
import { emojiShortcodePattern, parseEmojiTags } from "../../src/domain/service/emoji.ts"

Deno.test("parseEmojiTags - maps each shortcode to its image URL", () => {
  const emojis = parseEmojiTags([["emoji", "soapbox", "https://example.com/soapbox.png"]])
  assertEquals([...emojis], [["soapbox", "https://example.com/soapbox.png"]])
})

Deno.test("parseEmojiTags - ignores other tags", () => {
  assertEquals(parseEmojiTags([["t", "soapbox"], ["p", "x"]]).size, 0)
})

Deno.test("parseEmojiTags - skips an emoji tag without a URL", () => {
  assertEquals(parseEmojiTags([["emoji", "soapbox"]]).size, 0)
})

Deno.test("parseEmojiTags - accepts a hyphenated shortcode", () => {
  assertEquals(
    parseEmojiTags([["emoji", "party-parrot", "https://example.com/p.gif"]]).get("party-parrot"),
    "https://example.com/p.gif",
  )
})

Deno.test("emojiShortcodePattern - captures a hyphenated shortcode", () => {
  assertEquals([..."hi :party-parrot:".matchAll(emojiShortcodePattern())].map((m) => m[1]), ["party-parrot"])
})

Deno.test("parseEmojiTags - skips a shortcode that is not alphanumeric or underscore", () => {
  assertEquals(parseEmojiTags([["emoji", "soap box", "https://example.com/a.png"]]).size, 0)
})

Deno.test("parseEmojiTags - maps no image for a shortcode whose tags name different images, whatever their order (shared ADR-0014)", () => {
  const first: Tag = ["emoji", "a", "https://example.com/1.png"]
  const second: Tag = ["emoji", "a", "https://example.com/2.png"]
  assertEquals([parseEmojiTags([first, second]).has("a"), parseEmojiTags([second, first]).has("a")], [false, false])
})

Deno.test("parseEmojiTags - reads a shortcode repeated with the same image as one claim (shared ADR-0014)", () => {
  const tag: Tag = ["emoji", "a", "https://example.com/1.png"]
  assertEquals(parseEmojiTags([tag, tag]).get("a"), "https://example.com/1.png")
})

Deno.test("emojiShortcodePattern - captures the shortcodes written in content", () => {
  const shortcodes = [..."hi :soapbox: and :gleasonator_1:!".matchAll(emojiShortcodePattern())].map((m) => m[1])
  assertEquals(shortcodes, ["soapbox", "gleasonator_1"])
})

Deno.test("emojiShortcodePattern - gives each caller its own pattern, so one caller's exec cannot move another's position", () => {
  emojiShortcodePattern().exec(":a: :b:")
  assertEquals(emojiShortcodePattern().exec(":a: :b:")?.[1], "a")
})
