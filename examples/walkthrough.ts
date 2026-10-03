/**
 * Walkthrough of the main features of @innis/nostr-core.
 *
 * Run with: `deno run examples/walkthrough.ts` (no permissions required — everything runs locally).
 *
 * @module
 */

import {
  buildDmGiftWraps,
  buildReaction,
  buildRumour,
  buildTextNote,
  compileFilter,
  createJsonCipher,
  createLocalSigner,
  decodeNostrEntity,
  defaultLocalSignerTools,
  encodeNevent,
  encodeNprofile,
  encodePubkeyToNpub,
  generateSecretKey,
  KIND_PRIVATE_MESSAGE,
  KIND_REACTION,
  type LocalSignerTools,
  nip44Decrypt,
  nip44Encrypt,
  now,
  parsePublicKey,
  parseRelayUrl,
  type PublicKey,
  type Signer,
  unwrapGiftWrap,
  verifyEventSignature,
} from "../mod.ts"

const banner = (title: string): void => {
  console.log(`\n--- ${title} ---`)
}

const makeIdentity = async (): Promise<{ signer: Signer; pubkey: PublicKey }> => {
  const signer = createLocalSigner(generateSecretKey())
  const pubkey = await signer.getPublicKey()
  if (!pubkey.success) throw new Error(`a local signer always has its key: ${pubkey.error.message}`)
  return { signer, pubkey: pubkey.value }
}

const alice = await makeIdentity()
const bob = await makeIdentity()

banner("1. Keys, signer and branding untrusted input")
console.log("alice pubkey:", alice.pubkey)
console.log("alice npub:  ", encodePubkeyToNpub(alice.pubkey))
console.log("parse upper-case hex:", parsePublicKey(alice.pubkey.toUpperCase()) === alice.pubkey)
console.log("parse garbage:       ", parsePublicKey("not a key"))

banner("2. Build + sign + verify a text note")
const signedNoteResult = await alice.signer.signEvent(
  buildTextNote("hello nostr from #innis — nostr:" + encodePubkeyToNpub(bob.pubkey)),
)
if (!signedNoteResult.success) throw new Error(`sign failed: ${signedNoteResult.error.type}`)
const signedNote = signedNoteResult.value
console.log("event id:       ", signedNote.id)
console.log("auto-tagged:    ", signedNote.tags)
console.log("signature ok:   ", verifyEventSignature(signedNote))

banner("3. NIP-19 bech32 encoding")
const aliceRelay = parseRelayUrl("WSS://Relay.Example/")
if (aliceRelay === null) throw new Error("expected a valid relay URL")
const nevent = encodeNevent(signedNote.id, {
  relayUrls: [aliceRelay],
  authorPubkey: alice.pubkey,
  kind: signedNote.kind,
})
console.log("nevent:        ", nevent)
console.log("decoded type:  ", decodeNostrEntity(nevent ?? "")?.type)
console.log("nprofile(bob): ", encodeNprofile(bob.pubkey, [aliceRelay]))

banner("4. Reaction + compiled filters")
const reactionResult = await bob.signer.signEvent(
  buildReaction(signedNote),
)
if (!reactionResult.success) throw new Error(`sign failed: ${reactionResult.error.type}`)
const reaction = reactionResult.value
console.log("matches { kinds: [7] }:         ", compileFilter({ kinds: [KIND_REACTION] }).matches(reaction))
console.log("matches { #e: [signedNote.id] }:", compileFilter({ "#e": [signedNote.id] }).matches(reaction))

banner("5. createJsonCipher (NIP-44)")
const encrypted = await createJsonCipher(alice.signer).encrypt(bob.pubkey, { secret: "for bob's eyes only", at: now() })
if (!encrypted.success) throw new Error(`encrypt failed: ${encrypted.error.type}`)
console.log("ciphertext (first 40):", encrypted.value.slice(0, 40) + "...")
const decrypted = await createJsonCipher(bob.signer).decrypt(alice.pubkey, encrypted.value)
console.log("decrypted payload:    ", decrypted.success ? decrypted.value : decrypted.error.type)

banner("6. NIP-17 gift-wrapped DM")
const wraps = await buildDmGiftWraps({
  signer: alice.signer,
  createEphemeralSigner: () => createLocalSigner(generateSecretKey()),
  rumour: buildRumour({
    kind: KIND_PRIVATE_MESSAGE,
    pubkey: alice.pubkey,
    created_at: now(),
    tags: [["p", bob.pubkey]],
    content: "psst — a private message inside a gift wrap",
  }),
})
if (!wraps.success) throw new Error(`gift wrap failed: ${wraps.error.type}`)
console.log("gift wraps produced:", wraps.value.length, "(one for each member of the room: bob and alice)")
const forBob = wraps.value.find((wrap) => wrap.targetPubkey === bob.pubkey)
if (!forBob) throw new Error("expected a gift wrap addressed to bob")
const unwrapped = await unwrapGiftWrap(bob.signer, forBob.event)
if (!unwrapped.success) throw new Error(`unwrap failed: ${unwrapped.error}`)
console.log("bob sees sender:    ", unwrapped.value.senderPubkey === alice.pubkey ? "alice (ok)" : "wrong")
console.log("bob reads message:  ", unwrapped.value.rumour.content)

banner("7. Raising the NIP-44 plaintext ceiling")
// The codecs refuse a plaintext over 256 KiB by default. A host that needs more passes its own ceiling to both codecs
// through the tools its local signers are built with, on every end of the exchange.
const ceiling = 1024 * 1024
const raisedTools: LocalSignerTools = {
  ...defaultLocalSignerTools,
  nip44Encrypt: (conversationKey, plaintext) => nip44Encrypt(conversationKey, plaintext, ceiling),
  nip44Decrypt: (conversationKey, payload) => nip44Decrypt(conversationKey, payload, ceiling),
}
const bigAlice = createLocalSigner(generateSecretKey(), raisedTools)
const bigBobSecret = generateSecretKey()
const bigBob = createLocalSigner(bigBobSecret, raisedTools)
const bigAliceKey = await bigAlice.getPublicKey()
const bigBobKey = await bigBob.getPublicKey()
if (!bigAliceKey.success || !bigBobKey.success) throw new Error("a local signer always has its key")
const bigPayload = await bigAlice.nip44Encrypt(bigBobKey.value, "z".repeat(500000))
if (!bigPayload.success) throw new Error(`encrypt failed: ${bigPayload.error.message}`)
const bigPlaintext = await bigBob.nip44Decrypt(bigAliceKey.value, bigPayload.value)
console.log("raised ceiling reads 500000 bytes:    ", bigPlaintext.success && bigPlaintext.value.length === 500000)
const defaultReader = await createLocalSigner(bigBobSecret).nip44Decrypt(bigAliceKey.value, bigPayload.value)
console.log(
  "bob at the default ceiling refuses it:",
  defaultReader.success ? "read it (unexpected)" : defaultReader.error.type,
)
