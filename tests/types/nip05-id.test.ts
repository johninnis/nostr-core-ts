import { assertEquals, assertThrows } from "@std/assert"
import { InvalidNip05IdError, isValidNip05Id, parseNip05Id } from "../../src/domain/value-object/nip05-id.ts"

Deno.test("isValidNip05Id - true for standard lowercase user@domain.com", () => {
  assertEquals(isValidNip05Id("alice@example.com"), true)
})

Deno.test("isValidNip05Id - true for the root underscore identifier", () => {
  assertEquals(isValidNip05Id("_@example.com"), true)
})

Deno.test("isValidNip05Id - true for dots and hyphens in the local part", () => {
  assertEquals(isValidNip05Id("first.last-name@example.co.uk"), true)
})

Deno.test("isValidNip05Id - false for uppercase letters (canonical form is lowercase)", () => {
  assertEquals(isValidNip05Id("Alice@example.com"), false)
})

Deno.test("isValidNip05Id - false for plus in local part (not in NIP-05 spec)", () => {
  assertEquals(isValidNip05Id("user+tag@example.com"), false)
})

Deno.test("isValidNip05Id - false when surrounded by whitespace", () => {
  assertEquals(isValidNip05Id("  alice@example.com  "), false)
})

Deno.test("isValidNip05Id - false for missing @", () => {
  assertEquals(isValidNip05Id("aliceexample.com"), false)
})

Deno.test("isValidNip05Id - false for missing TLD", () => {
  assertEquals(isValidNip05Id("alice@example"), false)
})

Deno.test("isValidNip05Id - false for single-char TLD", () => {
  assertEquals(isValidNip05Id("alice@example.x"), false)
})

Deno.test("isValidNip05Id - false for double @", () => {
  assertEquals(isValidNip05Id("alice@@example.com"), false)
})

Deno.test("isValidNip05Id - false for empty string", () => {
  assertEquals(isValidNip05Id(""), false)
})

Deno.test("parseNip05Id - returns branded Nip05Id for valid identifier", () => {
  const id = parseNip05Id("alice@example.com")
  assertEquals<string>(id, "alice@example.com")
})

Deno.test("parseNip05Id - lowercases an upper-case identifier", () => {
  const id = parseNip05Id("Alice@Example.COM")
  assertEquals<string>(id, "alice@example.com")
})

Deno.test("parseNip05Id - trims surrounding whitespace", () => {
  const id = parseNip05Id("  alice@example.com  ")
  assertEquals<string>(id, "alice@example.com")
})

Deno.test("parseNip05Id - throws InvalidNip05IdError for missing @", () => {
  assertThrows(() => parseNip05Id("nope"), InvalidNip05IdError, "Invalid NIP-05 identifier: nope")
})

Deno.test("parseNip05Id - throws InvalidNip05IdError for plus in local part", () => {
  assertThrows(() => parseNip05Id("user+tag@example.com"), InvalidNip05IdError)
})

Deno.test("parseNip05Id - throws InvalidNip05IdError for empty string", () => {
  assertThrows(() => parseNip05Id(""), InvalidNip05IdError)
})

Deno.test("InvalidNip05IdError - stores the invalid raw value", () => {
  const err = new InvalidNip05IdError("bad")
  assertEquals(err.raw, "bad")
})

Deno.test("InvalidNip05IdError - has correct error name", () => {
  const err = new InvalidNip05IdError("bad")
  assertEquals(err.name, "InvalidNip05IdError")
})
