// deno-lint-ignore-file no-console

/**
 * Walkthrough of the main features of @innis/nostr-core.
 *
 * Run with: `deno run example.ts` (no permissions required — everything runs locally).
 *
 * Each section is self-contained; comment sections in/out to focus on one area.
 */

import {
  buildDmGiftWraps,
  buildReaction,
  buildTextNote,
  computeEventId,
  createLocalSigner,
  decodeNostrEntity,
  decryptJson,
  encodeNevent,
  encodeNprofile,
  encodePubkeyToNpub,
  encryptJson,
  generateSecretKey,
  KIND_SHORT_NOTE,
  matchesFilter,
  now,
  parseRelayUrl,
  type PublicKey,
  type Signer,
  unwrapGiftWrap,
  verifyEventSignature,
} from "./mod.ts"

const banner = (title: string): void => {
  console.log(`\n--- ${title} ---`)
}

const makeIdentity = async (): Promise<{ signer: Signer; pubkey: PublicKey; secretKey: Uint8Array }> => {
  const secretKey = generateSecretKey()
  const signer = createLocalSigner(secretKey)
  const pubkey = await signer.getPublicKey()
  return { signer, pubkey, secretKey }
}

const alice = await makeIdentity()
const bob = await makeIdentity()

// 1. Branded primitives + a local signer.
banner("1. Keys and signer")
console.log("alice pubkey:", alice.pubkey)
console.log("alice npub:  ", encodePubkeyToNpub(alice.pubkey))

// 2. Build, sign, and verify a kind-1 note.
banner("2. Build + sign + verify a text note")
const unsigned = buildTextNote("hello nostr from #innis — nostr:" + encodePubkeyToNpub(bob.pubkey))
const signedNote = await alice.signer.signEvent(unsigned)
console.log("event id:       ", signedNote.id)
console.log("auto-tagged:    ", signedNote.tags)
console.log("computed id ok: ", (await computeEventId(signedNote)) === signedNote.id)
console.log("signature ok:   ", await verifyEventSignature(signedNote))

// 3. NIP-19 round-trip (npub / nevent with kind).
banner("3. NIP-19 bech32 encoding")
const aliceRelay = parseRelayUrl("wss://relay.example/")
const nevent = encodeNevent(signedNote.id, {
  relayUrls: [aliceRelay],
  authorPubkey: alice.pubkey,
  kind: signedNote.kind,
})
console.log("nevent:", nevent)
const decoded = decodeNostrEntity(nevent)
console.log("decoded type:  ", decoded?.type)
console.log("nprofile(bob): ", encodeNprofile(bob.pubkey, [aliceRelay]))

// 4. Reaction + filter matching (no relay needed).
banner("4. Reaction + matchesFilter")
const reaction = await bob.signer.signEvent(
  buildReaction(signedNote.id, alice.pubkey),
)
console.log(
  "matches { kinds: [1] }:",
  matchesFilter(reaction, { kinds: [KIND_SHORT_NOTE] }),
)
console.log(
  "matches { #e: [signedNote.id] }:",
  matchesFilter(reaction, { ["#e"]: [signedNote.id] }),
)

// 5. encryptJson / decryptJson — the only sanctioned NIP-44 JSON path.
banner("5. encryptJson / decryptJson (NIP-44)")
const payload = { secret: "for bob's eyes only", at: now() }
const encrypted = await encryptJson(alice.signer, bob.pubkey, payload)
if (!encrypted.success) throw encrypted.error
console.log("ciphertext (first 40):", encrypted.value.slice(0, 40) + "...")
const decrypted = await decryptJson(bob.signer, alice.pubkey, encrypted.value)
console.log("round-trip success:   ", decrypted.success)
if (decrypted.success) console.log("decrypted payload:    ", decrypted.value)

// 6. NIP-17 gift-wrapped DM round-trip.
banner("6. NIP-17 gift-wrapped DM")
const wrapsResult = await buildDmGiftWraps({
  signer: alice.signer,
  ephemeralSignerFactory: (sk) => createLocalSigner(sk),
  generateSecretKey,
  content: "psst — this is a kind-14 rumor inside a kind-1059 wrap",
  recipientPubkey: bob.pubkey,
  myPubkey: alice.pubkey,
})
if (!wrapsResult.success) throw wrapsResult.error
const wraps = wrapsResult.value
console.log("gift wraps produced:", wraps.length, "(one for recipient, one for sender)")
const forBob = wraps.find((w) => w.targetPubkey === bob.pubkey)
if (!forBob) throw new Error("expected a gift wrap addressed to bob")
const unwrapped = await unwrapGiftWrap(bob.signer, forBob.event)
if (!unwrapped.success) throw unwrapped.error
console.log("bob sees sender:    ", unwrapped.value.senderPubkey === alice.pubkey ? "alice (ok)" : "wrong")
console.log("bob reads message:  ", unwrapped.value.rumor.content)
