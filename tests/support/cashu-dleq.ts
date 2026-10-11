import type { NutzapProof } from "../../src/domain/service/zap-parser.ts"
import type { Tag } from "../../src/domain/value-object/nostr-event.ts"
import { nutzapOf } from "./nutzap.ts"

/** A Cashu proof as a nutzap's `proof` tag writes it: NUT-00's fields and NUT-12's DLEQ. */
export interface CashuProof {
  readonly amount: number
  readonly id: string
  readonly secret: string
  readonly C: string
  readonly dleq: { readonly e: string; readonly s: string; readonly r: string }
}

interface CashuDleqVectors {
  readonly hashToCurve: ReadonlyArray<readonly [string, string]>
  readonly proofs: ReadonlyArray<readonly [string, string, CashuProof, boolean]>
  readonly lockKey: string
  readonly keysResponse: unknown
}

/** The shared Cashu DLEQ vectors (shared ADR-0121). */
export const CASHU_DLEQ_VECTORS: CashuDleqVectors = JSON.parse(
  await Deno.readTextFile(new URL("../event/cashu-dleq-vectors.json", import.meta.url)),
)

/** The proof and mint key of the shared vector `description` names, failing the test when none does. */
export const dleqVector = (description: string): { readonly proof: CashuProof; readonly mintKey: string } => {
  const vector = CASHU_DLEQ_VECTORS.proofs.find(([named]) => named === description)
  if (vector === undefined) throw new Error(`no shared DLEQ vector "${description}"`)
  return { proof: vector[2], mintKey: vector[1] }
}

/** The proof of 8 the vectors' keyset signed, locked to the fixture recipient's P2PK key. */
export const PROOF_OF_8: CashuProof = dleqVector("a P2PK-locked proof of 8").proof

/** The proof of 2 the vectors' keyset signed, locked to the fixture recipient's P2PK key. */
export const PROOF_OF_2: CashuProof = dleqVector("a P2PK-locked proof of 2").proof

/** `proof`, as written, in a nutzap's `proof` tag. */
export const cashuProofTag = (proof: unknown): Tag => ["proof", JSON.stringify(proof)]

/** `proof` as `parseNutzap` reads it, failing the test when it reads none. */
export const readProof = (proof: unknown): NutzapProof => {
  const read = nutzapOf([cashuProofTag(proof)]).proofs[0]
  if (read === undefined) throw new Error("invalid fixture proof")
  return read
}
