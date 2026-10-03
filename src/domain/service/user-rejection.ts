const REJECTION_PATTERN = /\b(rejected|denied|cancel(?:led|ed)?)\b/i

// Deliberate: a decline is recognised by the words of a signer's free-text error — see shared ADR-0041
/**
 * Whether a signer's free-text error `message` says the user declined the request. NIP-07 and NIP-46 define no error
 * code for a decline, so a signer adapter classifies the extension's thrown message or the bunker's `error` field with
 * this one heuristic and returns a `rejected` `SignerFailure`. The match is English-only and whole-word.
 */
export const isUserRejection = (message: string): boolean => REJECTION_PATTERN.test(message)
