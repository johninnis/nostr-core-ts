import { assertEquals } from "@std/assert"
import { secp256k1 } from "@noble/curves/secp256k1"
import { hashToCurve, hasValidDleq } from "../../src/domain/service/cashu-dleq.ts"
import { parseHex } from "../../src/domain/service/hex.ts"
import { textEncoder } from "../../src/domain/service/text-codec.ts"
import { CASHU_DLEQ_VECTORS, dleqVector, PROOF_OF_2, PROOF_OF_8, readProof } from "../support/cashu-dleq.ts"

const CURVE_ORDER = secp256k1.Point.CURVE().n.toString(16)
const KEY_OF_8 = dleqVector("a P2PK-locked proof of 8").mintKey
const NUT12_VECTOR = dleqVector("NUT-12's own proof vector, signed by the generator's key")

const signatureLeavingR2AtInfinity = (): string => {
  const { Fn } = secp256k1.Point
  const blindingFactor = BigInt(`0x${PROOF_OF_8.dleq.r}`)
  const ratio = Fn.mul(BigInt(`0x${PROOF_OF_8.dleq.s}`), Fn.inv(BigInt(`0x${PROOF_OF_8.dleq.e}`)))
  const secretPoint = hashToCurve(textEncoder.encode(PROOF_OF_8.secret))
  if (secretPoint === null) throw new Error("the fixture secret maps to no point")
  const blindedMessage = secretPoint.add(secp256k1.Point.BASE.multiply(blindingFactor))
  const mintKey = secp256k1.Point.fromHex(KEY_OF_8)
  return blindedMessage.multiply(ratio).subtract(mintKey.multiply(blindingFactor)).toHex(true)
}

Deno.test("hashToCurve - the shared vectors are fully loaded", () => {
  assertEquals(CASHU_DLEQ_VECTORS.hashToCurve.length, 3)
})

Deno.test("hashToCurve - maps every shared message to the point NUT-00 gives it", () => {
  const disagreements = CASHU_DLEQ_VECTORS.hashToCurve.filter(([message, point]) => {
    const bytes = parseHex(message)
    return bytes === null || hashToCurve(bytes)?.toHex(true) !== point
  })
  assertEquals(disagreements, [])
})

Deno.test("hasValidDleq - the shared vectors are fully loaded", () => {
  assertEquals(CASHU_DLEQ_VECTORS.proofs.length, 19)
})

Deno.test("hasValidDleq - judges every shared proof as the PHP CashuDleqVerifier judges it", () => {
  const disagreements = CASHU_DLEQ_VECTORS.proofs
    .filter(([, mintKey, proof, valid]) => hasValidDleq(readProof(proof), mintKey) !== valid)
    .map(([description]) => description)
  assertEquals(disagreements, [])
})

Deno.test("hasValidDleq - a mint key in upper-case hex is the same key", () => {
  assertEquals(hasValidDleq(readProof(PROOF_OF_8), KEY_OF_8.toUpperCase()), true)
})

Deno.test("hasValidDleq - a mint key written uncompressed is refused, as NUT-01 writes keys compressed", () => {
  const uncompressed = secp256k1.Point.fromHex(KEY_OF_8).toHex(false)
  assertEquals(hasValidDleq(readProof(PROOF_OF_8), uncompressed), false)
})

for (
  const [what, proof] of [
    ["no secret", { ...PROOF_OF_8, secret: undefined }],
    ["no unblinded signature", { ...PROOF_OF_8, C: undefined }],
    ["no DLEQ", { ...PROOF_OF_8, dleq: undefined }],
    ["a DLEQ without its challenge", { ...PROOF_OF_8, dleq: { s: PROOF_OF_8.dleq.s, r: PROOF_OF_8.dleq.r } }],
    ["a DLEQ without its response", { ...PROOF_OF_8, dleq: { e: PROOF_OF_8.dleq.e, r: PROOF_OF_8.dleq.r } }],
    ["a DLEQ without its blinding factor", { ...PROOF_OF_8, dleq: { e: PROOF_OF_8.dleq.e, s: PROOF_OF_8.dleq.s } }],
  ] as const
) {
  Deno.test(`hasValidDleq - a proof with ${what} has no valid DLEQ`, () => {
    assertEquals(hasValidDleq(readProof(proof), KEY_OF_8), false)
  })
}

for (
  const [what, dleq] of [
    ["an e of zero", { ...PROOF_OF_8.dleq, e: "0".repeat(64) }],
    ["an e equal to the curve order", { ...PROOF_OF_8.dleq, e: CURVE_ORDER }],
    ["an r equal to the curve order", { ...PROOF_OF_8.dleq, r: CURVE_ORDER }],
    ["an s above the curve order", { ...PROOF_OF_8.dleq, s: "f".repeat(64) }],
    ["an s of 33 bytes", { ...PROOF_OF_8.dleq, s: `00${PROOF_OF_8.dleq.s}` }],
    ["an e with a 0x prefix", { ...PROOF_OF_8.dleq, e: `0x${PROOF_OF_8.dleq.e.slice(2)}` }],
  ] as const
) {
  Deno.test(`hasValidDleq - a proof with ${what} has no valid DLEQ`, () => {
    assertEquals(hasValidDleq(readProof({ ...PROOF_OF_8, dleq }), KEY_OF_8), false)
  })
}

Deno.test("hasValidDleq - a C with no prefix is refused", () => {
  assertEquals(hasValidDleq(readProof({ ...PROOF_OF_8, C: PROOF_OF_8.C.slice(2) }), KEY_OF_8), false)
})

Deno.test("hasValidDleq - an s that leaves R1 at infinity has no valid DLEQ", () => {
  const proof = {
    ...NUT12_VECTOR.proof,
    C: PROOF_OF_2.C,
    dleq: { ...NUT12_VECTOR.proof.dleq, s: NUT12_VECTOR.proof.dleq.e },
  }
  assertEquals(hasValidDleq(readProof(proof), NUT12_VECTOR.mintKey), false)
})

Deno.test("hasValidDleq - a C that leaves R2 at infinity has no valid DLEQ", () => {
  assertEquals(hasValidDleq(readProof({ ...PROOF_OF_8, C: signatureLeavingR2AtInfinity() }), KEY_OF_8), false)
})
