import { secp256k1 } from "@noble/curves/secp256k1"
import { concatBytes } from "@noble/hashes/utils"
import { parseHex } from "./hex.ts"
import { sha256Digest, sha256Hex } from "./sha256.ts"
import { textEncoder } from "./text-codec.ts"
import type { NutzapProof } from "./zap-parser.ts"
import { lowerAscii } from "../value-object/ascii-case.ts"

type CurvePoint = typeof secp256k1.Point.BASE

interface DleqStatement {
  readonly mintKey: CurvePoint
  readonly unblindedSignature: CurvePoint
  readonly secretPoint: CurvePoint
  readonly challenge: bigint
  readonly response: bigint
  readonly blindingFactor: bigint
}

const { Point } = secp256k1
const HASH_TO_CURVE_DOMAIN = textEncoder.encode("Secp256k1_HashToCurve_Cashu_")
const EVEN_POINT_PREFIX = Uint8Array.of(0x02)
const HASH_TO_CURVE_COUNTERS = 2 ** 16
const SCALAR_HEX = /^[0-9a-f]{64}$/i

const littleEndianUint32 = (value: number): Uint8Array => {
  const bytes = new Uint8Array(4)
  new DataView(bytes.buffer).setUint32(0, value, true)
  return bytes
}

const compressedPointOf = (bytes: Uint8Array): CurvePoint | null =>
  secp256k1.utils.isValidPublicKey(bytes, true) ? Point.fromBytes(bytes) : null

/**
 * NUT-00's `hash_to_curve`: the first `02 || SHA256(msg_hash || counter)` that is a secp256k1 point, the counter a
 * little-endian uint32 from 0 to 2^16 − 1 and `msg_hash` being `SHA256("Secp256k1_HashToCurve_Cashu_" || message)`, or
 * `null` when no counter gives one.
 */
export const hashToCurve = (message: Uint8Array): CurvePoint | null => {
  const messageHash = sha256Digest(concatBytes(HASH_TO_CURVE_DOMAIN, message))
  for (let counter = 0; counter < HASH_TO_CURVE_COUNTERS; counter += 1) {
    const candidate = concatBytes(
      EVEN_POINT_PREFIX,
      sha256Digest(concatBytes(messageHash, littleEndianUint32(counter))),
    )
    const point = compressedPointOf(candidate)
    if (point !== null) return point
  }
  return null
}

// Deliberate: a point is read only compressed, as NUT-00 writes one, though cashu-ts also reads it uncompressed — see shared ADR-0121
const pointOf = (hex: string | null): CurvePoint | null => {
  const bytes = hex === null ? null : parseHex(lowerAscii(hex))
  return bytes === null ? null : compressedPointOf(bytes)
}

const scalarOf = (hex: string | null): bigint | null => {
  const scalar = hex !== null && SCALAR_HEX.test(hex) ? BigInt(`0x${hex}`) : null
  return scalar !== null && Point.Fn.isValidNot0(scalar) ? scalar : null
}

const dleqStatementOf = (proof: NutzapProof, mintKey: string): DleqStatement | null => {
  const mintPoint = pointOf(mintKey)
  const unblindedSignature = pointOf(proof.unblindedSignature)
  const challenge = scalarOf(proof.dleq?.e ?? null)
  const response = scalarOf(proof.dleq?.s ?? null)
  const blindingFactor = scalarOf(proof.dleq?.r ?? null)
  if (mintPoint === null || unblindedSignature === null || challenge === null || response === null) return null
  if (blindingFactor === null || proof.secret === null) return null
  const secretPoint = hashToCurve(textEncoder.encode(proof.secret))
  if (secretPoint === null) return null
  return { mintKey: mintPoint, unblindedSignature, secretPoint, challenge, response, blindingFactor }
}

const isInfinity = (point: CurvePoint): boolean => point.is0()

const challengeOf = (points: ReadonlyArray<CurvePoint>): bigint =>
  BigInt(`0x${sha256Hex(points.map((point) => point.toHex(false)).join(""))}`)

const reproducesItsChallenge = (statement: DleqStatement): boolean => {
  const { mintKey, unblindedSignature, secretPoint, challenge, response, blindingFactor } = statement
  const blindSignature = unblindedSignature.add(mintKey.multiply(blindingFactor))
  const blindedMessage = secretPoint.add(Point.BASE.multiply(blindingFactor))
  if ([blindSignature, blindedMessage].some(isInfinity)) return false
  const keyCommitment = Point.BASE.multiply(response).subtract(mintKey.multiply(challenge))
  const signatureCommitment = blindedMessage.multiply(response).subtract(blindSignature.multiply(challenge))
  if ([keyCommitment, signatureCommitment].some(isInfinity)) return false
  return challengeOf([keyCommitment, signatureCommitment, mintKey, blindSignature]) === challenge
}

/**
 * Whether `proof` carries a NUT-12 DLEQ proof that `mintKey` signed it, checked as NUT-12's receiving user "Carol"
 * checks one (shared ADR-0121): with `Y = hash_to_curve(secret)`, `C' = C + r·A` and `B' = Y + r·G`, the challenge `e`
 * must be the SHA-256 of the uncompressed hex of `s·G − e·A`, `s·B' − e·C'`, `A` and `C'`. The mint key and `C` must be
 * compressed points in hex of either case, `e`, `s` and `r` 32 bytes of hex of either case from 1 to n − 1, and the
 * secret, `C` and every DLEQ field present; a point at infinity along the way fails the check. Total: `false` for
 * anything else, never a throw.
 */
export const hasValidDleq = (proof: NutzapProof, mintKey: string): boolean => {
  const statement = dleqStatementOf(proof, mintKey)
  return statement !== null && reproducesItsChallenge(statement)
}
