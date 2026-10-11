import { assertEquals } from "@std/assert"
import type { NutzapDleqFailure } from "../../src/domain/failure/nutzap-dleq-failure.ts"
import type { MintKeyset } from "../../src/domain/service/mint-keyset.ts"
import { parseMintKeysets } from "../../src/domain/service/mint-keyset.ts"
import type { ListedNutzap, Nutzap } from "../../src/domain/service/zap-parser.ts"
import { verifyNutzap, verifyNutzapDleq } from "../../src/domain/service/zap-parser.ts"
import type { Result } from "../../src/domain/value-object/result.ts"
import { failure, ok } from "../../src/domain/value-object/result.ts"
import { CASHU_DLEQ_VECTORS, cashuProofTag, PROOF_OF_2, PROOF_OF_8 } from "../support/cashu-dleq.ts"
import { MINT, nutzapOf, RECIPIENT, recipientsInfo } from "../support/nutzap.ts"

const KEYSETS = parseMintKeysets(CASHU_DLEQ_VECTORS.keysResponse)
const OTHER_KEYSET_ID = "00ffffffffffffff"

type DleqVerification = Result<Nutzap, NutzapDleqFailure>

const signingKeyset = (): MintKeyset => {
  const keyset = KEYSETS[0]
  if (keyset === undefined) throw new Error("the shared keys response holds no keyset")
  return keyset
}

const SIGNING_KEYSET = signingKeyset()

const keyFor = (amount: number): string => {
  const key = SIGNING_KEYSET.keys.get(amount)
  if (key === undefined) throw new Error(`the shared keyset has no key for ${amount}`)
  return key
}

const keysetWith = (fields: Partial<MintKeyset>): MintKeyset => ({ ...SIGNING_KEYSET, ...fields })
const keysOnlyFor = (amount: number): ReadonlyMap<number, string> => new Map([[amount, keyFor(amount)]])
const tamperedProofOf8 = { ...PROOF_OF_8, dleq: { ...PROOF_OF_8.dleq, s: PROOF_OF_2.dleq.s } }

const listedNutzap = (): ListedNutzap => {
  const nutzap = nutzapOf([["p", RECIPIENT], ["u", MINT], cashuProofTag(PROOF_OF_8), cashuProofTag(PROOF_OF_2)])
  const verified = verifyNutzap(nutzap, recipientsInfo())
  if (!verified.success) throw new Error(`the fixture nutzap does not verify: ${verified.error}`)
  return verified.value
}

Deno.test("verifyNutzapDleq - a nutzap whose every proof its mint signed verifies", () => {
  const nutzap = nutzapOf([cashuProofTag(PROOF_OF_8), cashuProofTag(PROOF_OF_2)])
  assertEquals<DleqVerification>(verifyNutzapDleq(nutzap, KEYSETS), ok(nutzap))
})

Deno.test("verifyNutzapDleq - a verified nutzap verifies against its mint's keys response, still listed", () => {
  const listed = listedNutzap()
  const verified: Result<ListedNutzap, NutzapDleqFailure> = verifyNutzapDleq(listed, KEYSETS)
  assertEquals(verified, ok(listed))
})

Deno.test("verifyNutzapDleq - a nutzap with no proof has no proof", () => {
  assertEquals<DleqVerification>(verifyNutzapDleq(nutzapOf([["p", RECIPIENT]]), KEYSETS), failure("no-proof"))
})

Deno.test("verifyNutzapDleq - a proof naming a keyset not supplied is of an unknown keyset", () => {
  const nutzap = nutzapOf([cashuProofTag({ ...PROOF_OF_8, id: OTHER_KEYSET_ID })])
  assertEquals<DleqVerification>(verifyNutzapDleq(nutzap, KEYSETS), failure("unknown-keyset"))
})

Deno.test("verifyNutzapDleq - a proof naming no keyset is of an unknown keyset", () => {
  const nutzap = nutzapOf([cashuProofTag({ ...PROOF_OF_8, id: undefined })])
  assertEquals<DleqVerification>(verifyNutzapDleq(nutzap, KEYSETS), failure("unknown-keyset"))
})

Deno.test("verifyNutzapDleq - a keyset id is matched exactly as written", () => {
  const nutzap = nutzapOf([cashuProofTag({ ...PROOF_OF_8, id: "00AABBCCDDEEFF00" })])
  assertEquals<DleqVerification>(
    verifyNutzapDleq(nutzap, [keysetWith({ id: "00aabbccddeeff00" })]),
    failure("unknown-keyset"),
  )
})

Deno.test("verifyNutzapDleq - no keysets leave every proof of an unknown keyset", () => {
  assertEquals<DleqVerification>(verifyNutzapDleq(nutzapOf([cashuProofTag(PROOF_OF_8)]), []), failure("unknown-keyset"))
})

Deno.test("verifyNutzapDleq - a keyset in a unit other than the nutzap's is a unit mismatch", () => {
  const nutzap = nutzapOf([["unit", "usd"], cashuProofTag(PROOF_OF_8)])
  assertEquals<DleqVerification>(verifyNutzapDleq(nutzap, KEYSETS), failure("unit-mismatch"))
})

Deno.test("verifyNutzapDleq - a unit is compared exactly as written", () => {
  const nutzap = nutzapOf([cashuProofTag(PROOF_OF_8)])
  assertEquals<DleqVerification>(verifyNutzapDleq(nutzap, [keysetWith({ unit: "SAT" })]), failure("unit-mismatch"))
})

Deno.test("verifyNutzapDleq - a keyset with no key for the proof's amount has no mint key", () => {
  const nutzap = nutzapOf([cashuProofTag(PROOF_OF_8)])
  assertEquals<DleqVerification>(
    verifyNutzapDleq(nutzap, [keysetWith({ keys: keysOnlyFor(2) })]),
    failure("no-mint-key"),
  )
})

Deno.test("verifyNutzapDleq - a proof whose DLEQ does not verify is DLEQ invalid", () => {
  const nutzap = nutzapOf([cashuProofTag(PROOF_OF_2), cashuProofTag(tamperedProofOf8)])
  assertEquals<DleqVerification>(verifyNutzapDleq(nutzap, KEYSETS), failure("dleq-invalid"))
})

Deno.test("verifyNutzapDleq - a proof without a DLEQ is DLEQ invalid", () => {
  const nutzap = nutzapOf([cashuProofTag({ ...PROOF_OF_8, dleq: undefined })])
  assertEquals<DleqVerification>(verifyNutzapDleq(nutzap, KEYSETS), failure("dleq-invalid"))
})

Deno.test("verifyNutzapDleq - a proof checked against another amount's key is DLEQ invalid", () => {
  const nutzap = nutzapOf([cashuProofTag(PROOF_OF_8)])
  assertEquals<DleqVerification>(
    verifyNutzapDleq(nutzap, [keysetWith({ keys: new Map([[8, keyFor(2)]]) })]),
    failure("dleq-invalid"),
  )
})

Deno.test("verifyNutzapDleq - the first keyset with a proof's id is the one it is checked against", () => {
  const nutzap = nutzapOf([cashuProofTag(PROOF_OF_8)])
  assertEquals<DleqVerification>(
    verifyNutzapDleq(nutzap, [keysetWith({ keys: new Map() }), SIGNING_KEYSET]),
    failure("no-mint-key"),
  )
})

Deno.test("verifyNutzapDleq - no proof is checked before the keysets", () => {
  assertEquals<DleqVerification>(verifyNutzapDleq(nutzapOf([]), []), failure("no-proof"))
})

Deno.test("verifyNutzapDleq - every proof's keyset is found before any unit is compared", () => {
  const nutzap = nutzapOf([
    ["unit", "usd"],
    cashuProofTag(PROOF_OF_8),
    cashuProofTag({ ...PROOF_OF_2, id: OTHER_KEYSET_ID }),
  ])
  assertEquals<DleqVerification>(verifyNutzapDleq(nutzap, KEYSETS), failure("unknown-keyset"))
})

Deno.test("verifyNutzapDleq - every unit is compared before any mint key is looked up", () => {
  const nutzap = nutzapOf([cashuProofTag(PROOF_OF_8), cashuProofTag({ ...PROOF_OF_2, id: OTHER_KEYSET_ID })])
  const keysets = [keysetWith({ keys: new Map() }), keysetWith({ id: OTHER_KEYSET_ID, unit: "usd" })]
  assertEquals<DleqVerification>(verifyNutzapDleq(nutzap, keysets), failure("unit-mismatch"))
})

Deno.test("verifyNutzapDleq - every mint key is looked up before any DLEQ is checked", () => {
  const nutzap = nutzapOf([cashuProofTag(tamperedProofOf8), cashuProofTag(PROOF_OF_2)])
  assertEquals<DleqVerification>(
    verifyNutzapDleq(nutzap, [keysetWith({ keys: keysOnlyFor(8) })]),
    failure("no-mint-key"),
  )
})
