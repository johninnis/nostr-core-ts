import { assertEquals } from "@std/assert"
import { parseMimeType } from "../../src/domain/service/mime-type.ts"

Deno.test("parseMimeType - reads a type and subtype of RFC 6838 restricted names", () => {
  const types = [
    "image/png",
    "image/svg+xml",
    "application/vnd.api+json",
    "audio/x-wav",
    "a0/b!#$&-^_.+z",
    `${"a".repeat(127)}/${"b".repeat(127)}`,
  ]
  assertEquals(types.map(parseMimeType), types)
})

Deno.test("parseMimeType - reads a type written in any case as lowercase (RFC 6838: names are case-insensitive)", () => {
  assertEquals(parseMimeType("Image/PNG"), "image/png")
})

Deno.test("parseMimeType - refuses anything but a type and subtype", () => {
  const values = [
    "",
    "image",
    "image/",
    "/png",
    "text/plain; charset=utf-8",
    " image/png",
    "image/png ",
    "image/png\n",
    "image/*",
    "ima ge/png",
    "image/png/x",
    "image/.png",
    `${"a".repeat(128)}/png`,
    "image/pñg",
  ]
  assertEquals(values.map(parseMimeType), values.map(() => null))
})
