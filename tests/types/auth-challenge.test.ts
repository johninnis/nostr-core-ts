import { assertEquals } from "@std/assert"
import { sourceFilesMatching } from "../support/source-files.ts"
import { isValidAuthChallenge, parseAuthChallenge } from "../../src/domain/value-object/auth-challenge.ts"
import { authChallengesEqual } from "../../src/domain/service/auth-challenge.ts"
import { authChallengeFixture } from "../../testing.ts"

Deno.test("parseAuthChallenge - brands any non-empty string unchanged", () => {
  assertEquals<string | null>(parseAuthChallenge("challenge with spaces"), "challenge with spaces")
})

Deno.test("parseAuthChallenge - returns null for an empty string or a non-string", () => {
  assertEquals([parseAuthChallenge(""), parseAuthChallenge(42), parseAuthChallenge(null)], [null, null, null])
})

Deno.test("isValidAuthChallenge - holds exactly for non-empty strings", () => {
  assertEquals([isValidAuthChallenge("x"), isValidAuthChallenge(""), isValidAuthChallenge(1)], [true, false, false])
})

Deno.test("authChallengesEqual - holds for the same challenge and not for another (shared ADR-0025)", () => {
  const challenge = authChallengeFixture("challenge-1")
  assertEquals(
    [
      authChallengesEqual(challenge, authChallengeFixture("challenge-1")),
      authChallengesEqual(challenge, authChallengeFixture("challenge-2")),
      authChallengesEqual(challenge, authChallengeFixture("challenge")),
    ],
    [true, false, false],
  )
})

Deno.test("value objects depend on no domain service", async () => {
  const importsService = await sourceFilesMatching(/from "\.\.\/service\//)
  assertEquals(importsService.filter((path) => path.startsWith("domain/value-object/")), [])
})
