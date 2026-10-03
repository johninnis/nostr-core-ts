import { assertEquals } from "@std/assert"
import { checkPubkeyMatches } from "../../src/domain/service/pubkey-match.ts"
import { publicKeyFixture } from "../../testing.ts"

const EXPECTED = publicKeyFixture("a".repeat(64))
const ACTUAL = publicKeyFixture("b".repeat(64))

Deno.test("checkPubkeyMatches - null when expected is null", () => {
  assertEquals(checkPubkeyMatches(null, ACTUAL), null)
})

Deno.test("checkPubkeyMatches - null when expected equals actual", () => {
  assertEquals(checkPubkeyMatches(EXPECTED, EXPECTED), null)
})

Deno.test("checkPubkeyMatches - a pubkey-mismatch failure naming both keys on mismatch", () => {
  assertEquals(checkPubkeyMatches(EXPECTED, ACTUAL), {
    type: "pubkey-mismatch",
    message: `Signer pubkey ${ACTUAL} does not match expected pubkey ${EXPECTED}`,
  })
})
