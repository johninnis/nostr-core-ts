import { assertEquals, assertThrows } from "@std/assert"
import { InvalidArgumentError } from "../../src/domain/exception/invalid-argument-error.ts"
import {
  buildFileMetadataEvent,
  buildImetaTag,
  type FileEventMetadata,
  parseFileMetadataEvent,
  parseFileMetadataTags,
  parseImetaTag,
  parseImetaTags,
} from "../../src/domain/service/file-metadata.ts"
import { KIND_FILE_METADATA } from "../../src/domain/value-object/kinds.ts"
import type { NostrEvent, Tag } from "../../src/domain/value-object/nostr-event.ts"
import { eventIdFixture, publicKeyFixture, sigFixture } from "../../testing.ts"

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

const fullMetadata: FileEventMetadata = {
  url: "https://example.com/file.jpg",
  mimeType: "image/jpeg",
  hash: "d".repeat(64),
  originalHash: "e".repeat(64),
  size: 90244,
  dimensions: "794x798",
  blurhash: "L55iUPo*4hf;kHkCj^ahXFa$xjod",
  thumbnail: "https://example.com/thumb.jpg",
  image: "https://example.com/preview.jpg",
  summary: "a description",
  alt: "an accessibility caption with spaces",
  fallbacks: ["https://mirror1.example/file.jpg", "https://mirror2.example/file.jpg"],
}

Deno.test("parseFileMetadataEvent - returns null for the wrong kind", () => {
  assertEquals(parseFileMetadataEvent(makeEvent(1, [["url", "https://example.com/a.jpg"]])), null)
})

Deno.test("parseFileMetadataEvent - returns null when no url tag is present", () => {
  assertEquals(parseFileMetadataEvent(makeEvent(KIND_FILE_METADATA, [["m", "image/jpeg"]])), null)
})

Deno.test("parseFileMetadataEvent - parses every field", () => {
  const event = makeEvent(KIND_FILE_METADATA, buildFileMetadataEvent(fullMetadata).tags)
  assertEquals(parseFileMetadataEvent(event), fullMetadata)
})

const REQUIRED_TAGS: ReadonlyArray<Tag> = [
  ["url", "https://example.com/a.jpg"],
  ["m", "image/jpeg"],
  ["x", "d".repeat(64)],
  ["ox", "e".repeat(64)],
]
const REQUIRED_FIELDS = {
  url: "https://example.com/a.jpg",
  mimeType: "image/jpeg",
  hash: "d".repeat(64),
  originalHash: "e".repeat(64),
}

const withoutTag = (name: string): ReadonlyArray<Tag> => REQUIRED_TAGS.filter((tag) => tag[0] !== name)

Deno.test("parseFileMetadataEvent - omits a non-integer size", () => {
  const event = makeEvent(KIND_FILE_METADATA, [...REQUIRED_TAGS, ["size", "not-a-number"]])
  assertEquals(parseFileMetadataEvent(event), REQUIRED_FIELDS)
})

Deno.test("parseFileMetadataEvent - omits a size that is not decimal digits", () => {
  const sizes = ["0x10", "1e3", "-5", ""]
  assertEquals(
    sizes.map((size) => parseFileMetadataEvent(makeEvent(KIND_FILE_METADATA, [...REQUIRED_TAGS, ["size", size]]))),
    sizes.map(() => REQUIRED_FIELDS),
  )
})

Deno.test("parseFileMetadataEvent - ignores value-less tags", () => {
  const event = makeEvent(KIND_FILE_METADATA, [...REQUIRED_TAGS, ["alt"]])
  assertEquals(parseFileMetadataEvent(event), REQUIRED_FIELDS)
})

Deno.test("parseFileMetadataEvent - refuses an event without the m, x or ox NIP-94 does not mark optional", () => {
  for (const name of ["m", "x", "ox"]) {
    assertEquals(parseFileMetadataEvent(makeEvent(KIND_FILE_METADATA, withoutTag(name))), null, name)
  }
})

Deno.test("parseFileMetadataEvent - refuses an x or ox that is not a SHA-256 hex string (NIP-94)", () => {
  for (const name of ["x", "ox"]) {
    const tags = [...withoutTag(name), [name, "D".repeat(64)] as const]
    assertEquals(parseFileMetadataEvent(makeEvent(KIND_FILE_METADATA, tags)), null, name)
  }
})

Deno.test("parseFileMetadataEvent - refuses url tags that disagree, whatever their order (shared ADR-0014)", () => {
  const tags = [...REQUIRED_TAGS, ["url", "https://example.com/b.jpg"] as const]
  assertEquals(parseFileMetadataEvent(makeEvent(KIND_FILE_METADATA, tags)), null)
})

Deno.test("parseFileMetadataEvent - reads a repeated identical tag as one claim (shared ADR-0014)", () => {
  const event = makeEvent(KIND_FILE_METADATA, [...REQUIRED_TAGS, ["m", "image/jpeg"], ["alt", "a"], ["alt", "a"]])
  assertEquals(parseFileMetadataEvent(event), { ...REQUIRED_FIELDS, alt: "a" })
})

Deno.test("parseFileMetadataTags - omits an optional field whose tags disagree (shared ADR-0014)", () => {
  assertEquals(parseFileMetadataTags([...REQUIRED_TAGS, ["alt", "a"], ["alt", "b"]]), REQUIRED_FIELDS)
})

Deno.test("parseFileMetadataTags - parses every field from a NIP-94 tag list", () => {
  assertEquals(parseFileMetadataTags(buildFileMetadataEvent(fullMetadata).tags), fullMetadata)
})

Deno.test("parseFileMetadataTags - returns null when no url tag is present", () => {
  assertEquals(parseFileMetadataTags([["m", "image/jpeg"], ["dim", "800x600"]]), null)
})

Deno.test("parseImetaTag - returns null for a non-imeta tag", () => {
  assertEquals(parseImetaTag(["e", "abc"]), null)
})

Deno.test("parseImetaTag - returns null without a url entry", () => {
  assertEquals(parseImetaTag(["imeta", "m image/jpeg"]), null)
})

Deno.test("parseImetaTag - splits each entry on the first space only", () => {
  const tag: Tag = ["imeta", "url https://example.com/a.jpg", "alt a caption with spaces"]
  assertEquals(parseImetaTag(tag), { url: "https://example.com/a.jpg", alt: "a caption with spaces" })
})

Deno.test("parseImetaTag - skips entries with no space", () => {
  const tag: Tag = ["imeta", "url https://example.com/a.jpg", "garbage", "m image/jpeg"]
  assertEquals(parseImetaTag(tag), { url: "https://example.com/a.jpg", mimeType: "image/jpeg" })
})

Deno.test("parseImetaTag - refuses a tag with a url and no other field (NIP-92 MUST)", () => {
  assertEquals(parseImetaTag(["imeta", "url https://example.com/a.jpg"]), null)
})

Deno.test("parseImetaTag - an entry without a space is not a field", () => {
  assertEquals(parseImetaTag(["imeta", "url https://example.com/a.jpg", "garbage"]), null)
})

Deno.test("parseImetaTag - refuses a tag whose only other field is one it does not model, as buildImetaTag writes none", () => {
  assertEquals(parseImetaTag(["imeta", "url https://example.com/a.jpg", "service nip96"]), null)
})

Deno.test("parseImetaTag - refuses a tag whose only other field it drops (NIP-92 MUST)", () => {
  assertEquals(parseImetaTag(["imeta", "url https://example.com/a.jpg", "size abc"]), null)
})

Deno.test("parseImetaTag - reads the NIP-92 example", () => {
  const tag: Tag = [
    "imeta",
    "url https://nostr.build/i/my-image.jpg",
    "m image/jpeg",
    "blurhash eVF$^OI:${M{o#*0-nNFxakD-?xVM}WEWB%iNKxvR-oetmo#R-aen$",
    "dim 3024x4032",
    "alt A scenic photo overlooking the coast of Costa Rica",
    "fallback https://nostrcheck.me/alt1.jpg",
    "fallback https://void.cat/alt1.jpg",
  ]
  assertEquals(parseImetaTag(tag), {
    url: "https://nostr.build/i/my-image.jpg",
    mimeType: "image/jpeg",
    blurhash: "eVF$^OI:${M{o#*0-nNFxakD-?xVM}WEWB%iNKxvR-oetmo#R-aen$",
    dimensions: "3024x4032",
    alt: "A scenic photo overlooking the coast of Costa Rica",
    fallbacks: ["https://nostrcheck.me/alt1.jpg", "https://void.cat/alt1.jpg"],
  })
})

Deno.test("parseImetaTags - collects valid imeta tags and skips the rest", () => {
  const tags: ReadonlyArray<Tag> = [
    ["imeta", "url https://example.com/a.jpg"],
    ["p", pk],
    ["imeta", "m image/png"],
    ["imeta", "url https://example.com/b.jpg", "m image/png"],
  ]
  assertEquals(parseImetaTags(tags), [{ url: "https://example.com/b.jpg", mimeType: "image/png" }])
})

Deno.test("buildFileMetadataEvent - sets kind, caption content and round-trips", () => {
  const built = buildFileMetadataEvent(fullMetadata, "my caption")
  assertEquals(built.kind, KIND_FILE_METADATA)
  assertEquals(built.content, "my caption")
  assertEquals(parseFileMetadataEvent(makeEvent(built.kind, built.tags, built.content)), fullMetadata)
})

Deno.test("buildFileMetadataEvent - defaults content to an empty string", () => {
  assertEquals(buildFileMetadataEvent(REQUIRED_FIELDS).content, "")
})

Deno.test("buildImetaTag - produces an imeta tag that round-trips", () => {
  const tag = buildImetaTag(fullMetadata)
  assertEquals(tag === null ? null : parseImetaTag(tag), fullMetadata)
})

Deno.test("buildImetaTag - builds nothing for a url alone (NIP-92: a url and at least one other field)", () => {
  assertEquals(buildImetaTag({ url: "https://example.com/a.jpg" }), null)
})

Deno.test("buildImetaTag - serialises size as a string entry", () => {
  assertEquals(buildImetaTag({ url: "https://example.com/a.jpg", size: 1024 }), [
    "imeta",
    "url https://example.com/a.jpg",
    "size 1024",
  ])
})

Deno.test("parseFileMetadataEvent - omits a size that is a fraction, signed or padded", () => {
  const sizes = ["1.5", "+5", " 5", "5 "]
  assertEquals(
    sizes.map((size) => parseFileMetadataEvent(makeEvent(KIND_FILE_METADATA, [...REQUIRED_TAGS, ["size", size]]))),
    sizes.map(() => REQUIRED_FIELDS),
  )
})

Deno.test("parseFileMetadataTags - returns null for an empty url", () => {
  assertEquals(parseFileMetadataTags([["url", ""], ["m", "image/jpeg"]]), null)
})

Deno.test("parseImetaTag - returns null for an empty url", () => {
  assertEquals(parseImetaTag(["imeta", "url ", "alt a picture"]), null)
})

Deno.test("parseFileMetadataTags - keeps an empty optional field as the empty string", () => {
  assertEquals(parseFileMetadataTags([["url", "https://example.com/a.jpg"], ["alt", ""], ["summary", ""]]), {
    url: "https://example.com/a.jpg",
    summary: "",
    alt: "",
  })
})

Deno.test("parseImetaTag - keeps an empty optional field as the empty string", () => {
  assertEquals(parseImetaTag(["imeta", "url https://example.com/a.jpg", "alt "]), {
    url: "https://example.com/a.jpg",
    alt: "",
  })
})

Deno.test("buildImetaTag - writes an empty optional field", () => {
  assertEquals(buildImetaTag({ url: "https://example.com/a.jpg", alt: "" }), [
    "imeta",
    "url https://example.com/a.jpg",
    "alt ",
  ])
})

Deno.test("buildFileMetadataEvent - writes an empty optional field", () => {
  assertEquals(buildFileMetadataEvent({ ...REQUIRED_FIELDS, blurhash: "" }).tags, [...REQUIRED_TAGS, ["blurhash", ""]])
})

Deno.test("parseFileMetadataEvent - refuses an empty m, which is not a MIME type (NIP-94)", () => {
  assertEquals(parseFileMetadataEvent(makeEvent(KIND_FILE_METADATA, [...withoutTag("m"), ["m", ""]])), null)
})

Deno.test("parseFileMetadataTags - reads a MIME type written in any case as lowercase", () => {
  assertEquals(
    parseFileMetadataTags([["url", "https://example.com/a.jpg"], ["m", "Image/JPEG"]])?.mimeType,
    "image/jpeg",
  )
})

Deno.test("parseFileMetadataTags - reads no MIME type from a value that is not one and keeps the rest", () => {
  assertEquals(parseFileMetadataTags([["url", "https://example.com/a.jpg"], ["m", "jpeg"], ["alt", "a picture"]]), {
    url: "https://example.com/a.jpg",
    alt: "a picture",
  })
})

Deno.test("parseImetaTag - reads no MIME type from a value with a parameter", () => {
  const tag: Tag = ["imeta", "url https://example.com/a.jpg", "m text/plain; charset=utf-8", "alt a picture"]
  assertEquals(parseImetaTag(tag)?.mimeType, undefined)
})

Deno.test('parseFileMetadataEvent - refuses an m that is not a MIME type (NIP-94: "The MIME types format must be used")', () => {
  assertEquals(parseFileMetadataEvent(makeEvent(KIND_FILE_METADATA, [...withoutTag("m"), ["m", "jpeg"]])), null)
})

Deno.test("buildFileMetadataEvent - throws for an empty url, naming the url as the problem", () => {
  assertThrows(
    () => buildFileMetadataEvent({ ...REQUIRED_FIELDS, url: "" }),
    InvalidArgumentError,
    "File metadata names the URL to download the file from, and an empty URL names none",
  )
})

Deno.test("buildFileMetadataEvent - throws for a MIME type that is not a lowercase type/subtype, naming it", () => {
  for (const mimeType of ["", "jpeg", "image/JPEG", "text/plain; charset=utf-8"]) {
    assertThrows(
      () => buildFileMetadataEvent({ ...REQUIRED_FIELDS, mimeType }),
      InvalidArgumentError,
      `File metadata states its MIME type as a lowercase type/subtype, not "${mimeType}"`,
    )
  }
})

Deno.test("buildFileMetadataEvent - throws for a hash that is not SHA-256 hex, naming the fields a kind 1063 states", () => {
  assertThrows(
    () => buildFileMetadataEvent({ ...REQUIRED_FIELDS, hash: "D".repeat(64) }),
    InvalidArgumentError,
    "A kind 1063 file metadata event states a MIME type and the SHA-256 hex of the file and of the original file",
  )
})

Deno.test("buildImetaTag - throws for an empty url, which names no file to download", () => {
  assertThrows(() => buildImetaTag({ url: "", alt: "a picture" }), InvalidArgumentError)
})

Deno.test("buildImetaTag - throws for a MIME type that is not a lowercase type/subtype", () => {
  assertThrows(() => buildImetaTag({ url: "https://example.com/a.jpg", mimeType: "image/JPEG" }), InvalidArgumentError)
})

Deno.test("parseFileMetadataTags - reads no size written with a leading zero", () => {
  assertEquals(parseFileMetadataTags([["url", "https://x.example/a"], ["size", "007"]])?.size, undefined)
})

for (const size of [-1, 1.5, Number.NaN, 1e21, Number.MAX_SAFE_INTEGER + 1]) {
  Deno.test(`buildImetaTag - throws for a size of ${size}, which parseImetaTag would not read back`, () => {
    assertThrows(() => buildImetaTag({ url: "https://example.com/a.jpg", size }), InvalidArgumentError)
  })
}

Deno.test("buildFileMetadataEvent - throws for a negative size, which parseFileMetadataEvent would not read back", () => {
  assertThrows(() => buildFileMetadataEvent({ ...fullMetadata, size: -5 }), InvalidArgumentError)
})

Deno.test("buildImetaTag - writes a size of zero", () => {
  assertEquals(buildImetaTag({ url: "https://example.com/a.jpg", size: 0 }), [
    "imeta",
    "url https://example.com/a.jpg",
    "size 0",
  ])
})
