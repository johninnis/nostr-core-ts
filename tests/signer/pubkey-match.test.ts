import { assertEquals, assertThrows } from "@std/assert"
import { assertPubkeyMatches } from "../../src/domain/service/pubkey-match.ts"
import { PubkeyMismatchError } from "../../src/domain/exception/pubkey-mismatch-error.ts"
import { parsePublicKey } from "../../src/domain/value-object/public-key.ts"

const EXPECTED = parsePublicKey("a".repeat(64))
const ACTUAL = parsePublicKey("b".repeat(64))

Deno.test("assertPubkeyMatches - no-op when expected is null", () => {
  let fired = false
  assertPubkeyMatches(null, ACTUAL, (): void => {
    fired = true
  })
  assertEquals(fired, false)
})

Deno.test("assertPubkeyMatches - no-op when expected equals actual", () => {
  let fired = false
  assertPubkeyMatches(EXPECTED, EXPECTED, (): void => {
    fired = true
  })
  assertEquals(fired, false)
})

Deno.test("assertPubkeyMatches - throws PubkeyMismatchError on mismatch", () => {
  assertThrows(() => assertPubkeyMatches(EXPECTED, ACTUAL), PubkeyMismatchError)
})

Deno.test("assertPubkeyMatches - fires onMismatch with expected and actual before throwing", () => {
  const calls: Array<{ expected: string; actual: string }> = []
  assertThrows(() =>
    assertPubkeyMatches(EXPECTED, ACTUAL, (expected, actual): void => {
      calls.push({ expected, actual })
    })
  )
  assertEquals(calls, [{ expected: EXPECTED, actual: ACTUAL }])
})
