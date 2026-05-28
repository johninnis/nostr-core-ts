export {
  decodeNostrEntity,
  encodeEventIdToNote,
  encodeNaddr,
  encodeNevent,
  encodeNprofile,
  encodePubkeyToNpub,
  NOSTR_ENTITY_REGEX,
  pubkeyFromNip19,
  stripNostrUriPrefix,
} from "./bech32.ts"
export type {
  DecodedEntity,
  DecodedNaddr,
  DecodedNevent,
  DecodedNote,
  DecodedNprofile,
  DecodedNpub,
  EncodeNeventOptions,
} from "./bech32.ts"

export {
  buildDeletion,
  buildHighlightFromEvent,
  buildHighlightFromUrl,
  buildLongform,
  buildReaction,
  buildRepost,
  buildTextNote,
  buildZapRequest,
} from "./builder.ts"
export type { BuildLongformInput, DeletionTarget, ReplyContext } from "./builder.ts"
export { buildReplaceableListEvent } from "./replaceable-list.ts"
export type {
  BuildReplaceableListEventInput,
  BuildReplaceableListEventResult,
  ListVisibility,
} from "./replaceable-list.ts"

export { computeEventId } from "./event-id.ts"
export type { EventToSign } from "./event-id.ts"
export { buildEventFilter, parseNostrEvent, parseNostrInput, validateEventStructure } from "./event-utils.ts"
export type { EventStructureCheck, EventStructureField, ParsedNostrInput } from "./event-utils.ts"
export { computeSha256, sha256Hex } from "./sha256.ts"
export { verifyEventSignature } from "./verify.ts"

export { matchesAnyFilter, matchesFilter } from "./filter.ts"
export { byCreatedAtAsc, byCreatedAtDesc } from "./sort.ts"

export { isParameterisedReplaceable, isReplaceable, isRepostKind, REPOST_KINDS } from "./kinds.ts"
export { replaceableStorageKey } from "./replaceable.ts"

export {
  addEventTag,
  addPubkeyTag,
  addRelayTag,
  addTag,
  decryptPrivateEntries,
  extractEventIds,
  extractEventRefs,
  extractFullList,
  extractPubkeys,
  extractRelayEntries,
  extractTagValues,
  getRelayEntryMarker,
  getTagValue,
  hasEventId,
  hasPubkey,
  hasRelayEntry,
  hasTag,
  removeEventTag,
  removePubkeyTag,
  removeRelayTag,
  removeTag,
} from "./tags.ts"
export type { DecryptFn, EventRef, FullList, PrivateEntriesError, RelayEntry, RelayMarker } from "./tags.ts"

export { transformEvent } from "./transformer.ts"
export type {
  EventOrAddressRef,
  EventRefs,
  HighlightData,
  KindData,
  LongformData,
  ReactionData,
  RepostData,
  TransformedEvent,
} from "./transformer.ts"

export { DEFAULT_REACTION, formatReactionEmoji } from "./reaction.ts"
export { parseAmountSats, parseBolt11Amount, parseNutzap, parseZapReceipt } from "./zap-parser.ts"
export type { ZapInfo } from "./zap-parser.ts"

export { decryptJson, encryptJson } from "./json-crypto.ts"

export type { Signer, SignerKind } from "./signer.ts"

export {
  buildNip98AuthEvent,
  DEFAULT_AUTH_EXPIRATION_SECONDS,
  encodeAuthHeader,
  NIP98_AUTH_HEADER_PREFIX,
} from "./nip98-builder.ts"
export type { BuildNip98AuthEventInput } from "./nip98-builder.ts"
export { createNip98Validator, parseAuthHeader } from "./nip98-validator.ts"
export type {
  Nip98ReplayGuard,
  Nip98Validator,
  Nip98ValidatorOptions,
  ValidateAuthHeaderRequest,
  ValidateEventRequest,
} from "./nip98-validator.ts"

export { errorMessage, reportUnhandledError } from "./error-utils.ts"
export { randomBytes, randomUint32 } from "./random.ts"
export type { RandomBytesFn, RandomUint32Fn } from "./random.ts"
export { coalesce, debounce } from "./timers.ts"
export type { CancellableScheduler } from "./timers.ts"
