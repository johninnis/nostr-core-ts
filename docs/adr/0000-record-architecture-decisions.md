# 0000. Record architecture decisions

## Status

Accepted

## Context

Much of this library looks, at first reading, like duplication or an anti-pattern: an `add*` helper that overwrites, a relay-URL rule set written out in several packages, a catch kept in an inner layer. Each of those was chosen and paid for. Without a record, a well-meaning refactor undoes them and the reasoning has to be rediscovered from the failure it reintroduces. The rationale used to live in the README, mixed in with user documentation, where it was neither versioned per decision nor easy to supersede.

## Decision

Architectural decisions are recorded in `docs/adr/`, one file per decision, numbered sequentially from `0001`, each with the sections Status, Context, Decision and Consequences.

A decision about Nostr protocol behaviour that every implementation of that part of the protocol must reach identically — a canonical form, a validation rule, what a reader does with an ambiguous tag — is not recorded here. It is recorded once in the shared `nostr-adrs` repository, which the PHP `innis/nostr-core` and the other `nostr-*` libraries follow too, and is cited from here as "shared ADR-NNNN". A record here holds only what is this library's own: how a shared decision is expressed in TypeScript (a type, a function's shape, a failure literal), and decisions about this package alone (its scope, its dependencies, its runtime). Where a record here touches a shared decision, it states the shared decision only by reference and decides nothing about the protocol itself; a change to the protocol half is made in `nostr-adrs` first. An accepted record is never edited to change its decision: a new record supersedes it, restating the whole current decision, and the old record's status becomes `Superseded by ADR-NNNN`. A record holds one decision; aspects that could be revised independently get their own record. Where a deliberate choice would read like a mistake at the call site, a one-line `// Deliberate: … see ADR-NNNN` comment points at the record.

A record's filename is its four-digit number and a kebab-case slug of its title, at most 95 characters including the `.md` extension, the longest path component JSR accepts. A longer title is shortened in the filename, never in the record's heading.

## Consequences

Reviewers read `docs/adr/` and the shared records it cites before judging the code, and a disagreement is resolved by a superseding record rather than a silent change. A protocol question answered only here, and not in `nostr-adrs`, is a decision the other libraries cannot see, and belongs in a shared record. The README is user documentation only. Writing a record costs a few minutes per decision; the history of why the API looks as it does survives the people who shaped it.
