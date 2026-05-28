import { assertEquals, assertStringIncludes } from "@std/assert"
import { PubkeyMismatchError } from "../../src/domain/exception/pubkey-mismatch-error.ts"
import { parsePublicKey } from "../../src/domain/value-object/public-key.ts"

const EXPECTED = parsePublicKey("a".repeat(64))
const ACTUAL = parsePublicKey("b".repeat(64))

Deno.test("PubkeyMismatchError - stores expected and actual pubkeys", () => {
  const err = new PubkeyMismatchError(EXPECTED, ACTUAL)
  assertEquals(err.expected, EXPECTED)
  assertEquals(err.actual, ACTUAL)
})

Deno.test("PubkeyMismatchError - message includes both pubkeys", () => {
  const err = new PubkeyMismatchError(EXPECTED, ACTUAL)
  assertStringIncludes(err.message, EXPECTED)
  assertStringIncludes(err.message, ACTUAL)
})

Deno.test("PubkeyMismatchError - has correct name and tag", () => {
  const err = new PubkeyMismatchError(EXPECTED, ACTUAL)
  assertEquals(err.name, "PubkeyMismatchError")
  assertEquals(err.tag, "PubkeyMismatchError")
})

Deno.test("PubkeyMismatchError - is an Error instance", () => {
  const err = new PubkeyMismatchError(EXPECTED, ACTUAL)
  assertEquals(err instanceof Error, true)
  assertEquals(err instanceof PubkeyMismatchError, true)
})
