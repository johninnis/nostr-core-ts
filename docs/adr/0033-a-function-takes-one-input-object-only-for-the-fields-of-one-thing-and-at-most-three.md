# 0033. A function takes one input object only for the fields of one thing, and at most three parameters otherwise

## Status

Accepted

## Context

A function that grows past three parameters is usually doing more than one job, and the cheap fix, gathering its arguments into an "options" object, hides that instead of resolving it. But some inputs genuinely are one thing: the fields of an event a builder writes, or of an entity an encoder encodes. Refusing an input object for those would force long positional calls whose argument order means nothing. This policy was first written down inside ADR-0007 beside the clock's, which it outlived: the two are revised for different reasons, so it has its own record.

## Decision

- A function takes one input object only when every field in it is a field of one thing. The input-object builders take the fields of the one event they build, `createdAt` among them: `BuildLongformInput`, `BuildZapRequestInput`, `buildNip98AuthEvent`'s input, `buildNewListEvent`'s and `buildReplaceableListEvent`'s, and `BuildDmGiftWrapsInput`, the rumour and what its wraps are sealed, signed and stamped with. `EncodeNeventOptions` holds the optional fields of the one `nevent` encoded, `ChatRoom` the members of one room, and `createStubSigner`'s input the members of the one `Signer` it builds.
- An optional field of an input object is spelled `field?: T` and is absent by being left out. `null` is never a second spelling of absent, the rule ADR-0007 states for `createdAt`: `title?: string | null` would give the builder two ways to say "no title" and every reader of the field a double check. A caller holding a nullable value spreads the field in only when it has one. Compile-time tests refuse `null` for `BuildLongformInput`, `BuildZapRequestInput` and `EncodeNeventOptions`.
- Settings that describe no one thing are not bundled into an options object: each is its own parameter, at most three to a function.
- A collaborator is injected rather than configured through settings: the `HttpClient`, built for the targets it may reach; the NIP-05 verifier's listener.
- What the platform already carries is not repeated: an `AbortSignal` carries its own deadline, so no request or lookup takes a `timeoutMs`.

## Consequences

- An options object that gathers unrelated settings is split rather than renamed, and a new input object is added only for the fields of one event, entity, room or port.
- A function that needs a fourth unrelated parameter is decomposed, not given an options bag.
