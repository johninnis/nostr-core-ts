import { assertEquals } from "@std/assert"
import type { NutzapVerificationFailure } from "../../src/domain/failure/nutzap-verification-failure.ts"
import type { Nutzap } from "../../src/domain/service/zap-parser.ts"
import { verifyNutzap } from "../../src/domain/service/zap-parser.ts"
import type { Result } from "../../src/domain/value-object/result.ts"
import { failure, ok } from "../../src/domain/value-object/result.ts"
import type { WebUrl } from "../../src/domain/value-object/web-url.ts"
import {
  MINT,
  nutzapOf,
  OTHER_P2PK_KEY,
  P2PK_KEY,
  payingNutzap,
  proofTag,
  RECIPIENT,
  recipientsInfo,
} from "../support/nutzap.ts"

const STRANGER = "c".repeat(64)

type Verification = Result<Nutzap, NutzapVerificationFailure>

Deno.test("verifyNutzap - a nutzap paying a mint its recipient lists, in proofs locked to its key, verifies", () => {
  const nutzap = payingNutzap()
  assertEquals<Verification>(verifyNutzap(nutzap, recipientsInfo()), ok(nutzap))
})

Deno.test("verifyNutzap - a verified nutzap is listed, naming the mint its recipient lists", () => {
  const verified = verifyNutzap(payingNutzap(), recipientsInfo())
  const mint: WebUrl | undefined = verified.success ? verified.value.mint : undefined
  assertEquals(mint, MINT)
})

Deno.test("verifyNutzap - every proof locked to the recipient's key verifies", () => {
  const nutzap = payingNutzap([proofTag(5)])
  assertEquals<Verification>(verifyNutzap(nutzap, recipientsInfo()), ok(nutzap))
})

Deno.test("verifyNutzap - a lock written with an odd prefix verifies as the same key (shared ADR-0121)", () => {
  const nutzap = nutzapOf([["p", RECIPIENT], ["u", MINT], proofTag(21, `03${P2PK_KEY}`)])
  assertEquals<Verification>(verifyNutzap(nutzap, recipientsInfo()), ok(nutzap))
})

Deno.test("verifyNutzap - info authored by someone other than the recipient is a recipient mismatch", () => {
  assertEquals(verifyNutzap(payingNutzap(), recipientsInfo(STRANGER)), failure("recipient-mismatch"))
})

Deno.test("verifyNutzap - a nutzap naming no recipient is a recipient mismatch", () => {
  assertEquals(verifyNutzap(nutzapOf([["u", MINT], proofTag(21)]), recipientsInfo()), failure("recipient-mismatch"))
})

Deno.test("verifyNutzap - a mint the info does not list is not listed", () => {
  const nutzap = nutzapOf([["p", RECIPIENT], ["u", "https://other.example"], proofTag(21)])
  assertEquals(verifyNutzap(nutzap, recipientsInfo()), failure("mint-not-listed"))
})

Deno.test("verifyNutzap - a listed mint written another way is not listed (shared ADR-0121)", () => {
  const nutzap = nutzapOf([["p", RECIPIENT], ["u", "HTTPS://mint.example"], proofTag(21)])
  assertEquals(verifyNutzap(nutzap, recipientsInfo()), failure("mint-not-listed"))
})

Deno.test("verifyNutzap - a nutzap naming no mint is not listed", () => {
  assertEquals(verifyNutzap(nutzapOf([["p", RECIPIENT], proofTag(21)]), recipientsInfo()), failure("mint-not-listed"))
})

Deno.test("verifyNutzap - a nutzap with no proof stating an amount has no proof", () => {
  const nutzap = nutzapOf([["p", RECIPIENT], ["u", MINT], ["proof", "not a proof"]])
  assertEquals(verifyNutzap(nutzap, recipientsInfo()), failure("no-proof"))
})

Deno.test("verifyNutzap - a proof locked to another key is not locked to the recipient", () => {
  const nutzap = payingNutzap([proofTag(5, `02${OTHER_P2PK_KEY}`)])
  assertEquals(verifyNutzap(nutzap, recipientsInfo()), failure("proof-not-locked-to-recipient"))
})

Deno.test("verifyNutzap - a proof locked to the recipient's Nostr key is not locked to the recipient", () => {
  const nutzap = payingNutzap([proofTag(5, `02${RECIPIENT}`)])
  assertEquals(verifyNutzap(nutzap, recipientsInfo()), failure("proof-not-locked-to-recipient"))
})

Deno.test("verifyNutzap - a proof the sender can also spend is not locked to the recipient (shared ADR-0121)", () => {
  const secret = JSON.stringify(["P2PK", {
    nonce: "n",
    data: `02${P2PK_KEY}`,
    tags: [["pubkeys", `02${OTHER_P2PK_KEY}`]],
  }])
  const nutzap = payingNutzap([["proof", JSON.stringify({ amount: 5, secret })]])
  assertEquals(verifyNutzap(nutzap, recipientsInfo()), failure("proof-not-locked-to-recipient"))
})

Deno.test("verifyNutzap - the recipient is checked before the mint", () => {
  const nutzap = nutzapOf([["p", STRANGER], ["u", "https://other.example"], proofTag(21)])
  assertEquals(verifyNutzap(nutzap, recipientsInfo()), failure("recipient-mismatch"))
})

Deno.test("verifyNutzap - the mint is checked before the proofs", () => {
  const nutzap = nutzapOf([["p", RECIPIENT], ["u", "https://other.example"]])
  assertEquals(verifyNutzap(nutzap, recipientsInfo()), failure("mint-not-listed"))
})
