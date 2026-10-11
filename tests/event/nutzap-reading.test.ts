import { assertEquals } from "@std/assert"
import type { NutzapProof } from "../../src/domain/service/zap-parser.ts"
import type { Tag } from "../../src/domain/value-object/nostr-event.ts"
import {
  DLEQ_E,
  DLEQ_R,
  DLEQ_S,
  KEYSET_ID,
  MINT,
  nutzapOf,
  P2PK_KEY,
  proofTag,
  RECIPIENT,
  secretFor,
  UNBLINDED_SIGNATURE,
} from "../support/nutzap.ts"

const proofOf = (tag: Tag): NutzapProof | undefined => nutzapOf([tag]).proofs[0]
const proofFrom = (json: string): NutzapProof | undefined => proofOf(["proof", json])

Deno.test("parseNutzap - its recipient is its p tag", () => {
  assertEquals(nutzapOf([["p", RECIPIENT]]).recipient, RECIPIENT)
})

Deno.test("parseNutzap - p tags that disagree name no recipient (shared ADR-0014)", () => {
  assertEquals(nutzapOf([["p", RECIPIENT], ["p", "e".repeat(64)]]).recipient, null)
})

Deno.test("parseNutzap - a p tag that is no public key names no recipient", () => {
  assertEquals(nutzapOf([["p", RECIPIENT.toUpperCase()]]).recipient, null)
})

Deno.test("parseNutzap - its mint is its u tag kept exactly as written (shared ADR-0121)", () => {
  assertEquals(nutzapOf([["u", "HTTPS://Mint.example"]]).mint, "HTTPS://Mint.example")
})

Deno.test("parseNutzap - a repeated identical u tag is one mint (shared ADR-0014)", () => {
  assertEquals(nutzapOf([["u", MINT], ["u", MINT]]).mint, MINT)
})

for (
  const [what, tags] of [
    ["no u tag", []],
    ["u tags that disagree", [["u", MINT], ["u", "https://other.example"]]],
    ["two spellings of one mint", [["u", MINT], ["u", "HTTPS://mint.example"]]],
    ["a u tag that is no web URL", [["u", "wss://mint.example"]]],
  ] as const
) {
  Deno.test(`parseNutzap - a nutzap with ${what} names no mint (shared ADR-0121)`, () => {
    assertEquals(nutzapOf(tags).mint, null)
  })
}

Deno.test("parseNutzap - its proofs are the proof tags that state an amount (shared ADR-0080)", () => {
  const nutzap = nutzapOf([proofTag(10), ["proof", "not a proof"], proofTag(5)])
  assertEquals(nutzap.proofs.map((proof) => proof.amount), [10, 5])
})

Deno.test("parseNutzap - each proof carries the key its secret locks it to (shared ADR-0121)", () => {
  assertEquals(nutzapOf([proofTag(10)]).proofs[0]?.lockKey, P2PK_KEY)
})

Deno.test("parseNutzap - a proof whose secret is not a string has no lock key", () => {
  const proof = JSON.stringify({ amount: 10, secret: ["P2PK", { nonce: "n", data: `02${P2PK_KEY}` }] })
  assertEquals(nutzapOf([["proof", proof]]).proofs[0]?.lockKey, null)
})

Deno.test("parseNutzap - a proof with no secret has no lock key", () => {
  assertEquals(nutzapOf([["proof", JSON.stringify({ amount: 10 })]]).proofs[0]?.lockKey, null)
})

Deno.test("parseNutzap - a nutzap without proof tags has no proofs", () => {
  assertEquals(nutzapOf([["p", RECIPIENT]]).proofs, [])
})

Deno.test("parseNutzap - a proof carries its keyset id as written (shared ADR-0121)", () => {
  assertEquals(proofOf(proofTag(21))?.keysetId, KEYSET_ID)
})

Deno.test("parseNutzap - a proof carries its secret as written (shared ADR-0121)", () => {
  assertEquals(proofOf(proofTag(21))?.secret, secretFor(`02${P2PK_KEY}`))
})

Deno.test("parseNutzap - a proof carries its unblinded signature as written (shared ADR-0121)", () => {
  assertEquals(proofOf(proofTag(21))?.unblindedSignature, UNBLINDED_SIGNATURE)
})

Deno.test("parseNutzap - a proof carries its DLEQ challenge", () => {
  assertEquals(proofOf(proofTag(21))?.dleq?.e, DLEQ_E)
})

Deno.test("parseNutzap - a proof carries its DLEQ response", () => {
  assertEquals(proofOf(proofTag(21))?.dleq?.s, DLEQ_S)
})

Deno.test("parseNutzap - a proof carries its DLEQ blinding factor", () => {
  assertEquals(proofOf(proofTag(21))?.dleq?.r, DLEQ_R)
})

Deno.test("parseNutzap - a proof without a DLEQ carries none", () => {
  assertEquals(proofFrom('{"amount":21}')?.dleq, null)
})

for (
  const [what, json] of [
    ["a string", '{"amount":21,"dleq":"e"}'],
    ["a JSON array", '{"amount":21,"dleq":["e","s","r"]}'],
    ["null", '{"amount":21,"dleq":null}'],
  ] as const
) {
  Deno.test(`parseNutzap - a DLEQ that is ${what} is absent`, () => {
    assertEquals(proofFrom(json)?.dleq, null)
  })
}

Deno.test("parseNutzap - an empty DLEQ object is a DLEQ stating nothing", () => {
  assertEquals(proofFrom('{"amount":21,"dleq":{}}')?.dleq?.e, null)
})

Deno.test("parseNutzap - a DLEQ without a blinding factor keeps what it has", () => {
  assertEquals(proofFrom('{"amount":21,"dleq":{"e":"e","s":"s"}}')?.dleq?.e, "e")
})

Deno.test("parseNutzap - a DLEQ without a blinding factor has none", () => {
  assertEquals(proofFrom('{"amount":21,"dleq":{"e":"e","s":"s"}}')?.dleq?.r, null)
})

Deno.test("parseNutzap - a DLEQ value that is not a string is absent", () => {
  assertEquals(proofFrom('{"amount":21,"dleq":{"e":1,"s":"s","r":"r"}}')?.dleq?.e, null)
})

for (
  const [what, json] of [
    ["missing", '{"amount":21}'],
    ["a number", '{"amount":21,"id":7}'],
  ] as const
) {
  Deno.test(`parseNutzap - a keyset id that is ${what} is absent`, () => {
    assertEquals(proofFrom(json)?.keysetId, null)
  })
}

for (
  const [what, json] of [
    ["missing", '{"amount":21}'],
    ["an object", '{"amount":21,"C":{}}'],
  ] as const
) {
  Deno.test(`parseNutzap - an unblinded signature that is ${what} is absent`, () => {
    assertEquals(proofFrom(json)?.unblindedSignature, null)
  })
}

Deno.test("parseNutzap - a secret that is not a string is absent", () => {
  const proof = JSON.stringify({ amount: 10, secret: ["P2PK", { nonce: "n", data: `02${P2PK_KEY}` }] })
  assertEquals(proofFrom(proof)?.secret, null)
})

Deno.test("parseNutzap - its keyset ids are those its proofs name, each once, in the order first named", () => {
  const proofs = ["00bb", "00aa", "00bb"].map((id): Tag => ["proof", JSON.stringify({ amount: 1, id })])
  assertEquals(nutzapOf(proofs).keysetIds, ["00bb", "00aa"])
})

Deno.test("parseNutzap - a proof naming no keyset adds no keyset id", () => {
  assertEquals(nutzapOf([["proof", '{"amount":21}'], proofTag(5)]).keysetIds, [KEYSET_ID])
})

Deno.test("parseNutzap - a keyset id is kept as written", () => {
  assertEquals(nutzapOf([["proof", '{"amount":21,"id":"00AB"}']]).keysetIds, ["00AB"])
})

Deno.test("parseNutzap - a proof that states no amount names no keyset", () => {
  assertEquals(nutzapOf([["proof", '{"id":"00aa"}']]).keysetIds, [])
})

Deno.test("parseNutzap - a nutzap without proofs names no keyset", () => {
  assertEquals(nutzapOf([["p", RECIPIENT]]).keysetIds, [])
})
