import type { AuthChallenge } from "../value-object/auth-challenge.ts"
import { constantTimeEqual } from "./constant-time-equal.ts"

/**
 * `true` when `a` and `b` are the same challenge. The comparison runs in constant time over equal-length challenges, so
 * how long it takes does not reveal how much of a guess matched (shared ADR-0025).
 */
export const authChallengesEqual = (a: AuthChallenge, b: AuthChallenge): boolean => constantTimeEqual(a, b)
