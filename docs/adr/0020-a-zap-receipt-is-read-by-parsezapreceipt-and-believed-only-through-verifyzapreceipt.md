# 0020. A zap receipt is read by `parseZapReceipt` and believed only through `verifyZapReceipt`

## Status

Accepted

## Context

Shared ADR-0038 decides how a zap receipt is parsed and verified, and that an application shows or counts only a receipt it has verified. What is this package's is the shape of the two functions and what it leaves to the application.

## Decision

- `parseZapReceipt(event)` returns a `ZapReceipt` — the receipt, the parsed request, the amount, and the request's author as `pubkey` — or `null`.
- `verifyZapReceipt(receipt, lnurlProviderPubkey, expectedLnurl?)` returns `Result<ZapReceipt, ZapReceiptVerificationFailure>` with the literals `provider-pubkey-mismatch`, `lnurl-mismatch`, `receipt-signature-invalid` and `zap-request-signature-invalid`, in that order.
- This package fetches no LNURL configuration. It parses the recipient's `lud16` or `lud06` into the pay endpoint (ADR-0024); the application fetches `nostrPubkey` from it, verifies, and holds back every receipt it cannot yet verify.

## Consequences

- An unverified `ZapReceipt` is data an application may hold while it fetches the provider key, never a zap to display or count.
- Do not fold verification into the parser, and do not fetch LNURL configuration here to make verification self-contained.
- Verification does not check NIP-57 Appendix E's description hash; shared ADR-0038 records why neither core does.
- Shared decision: nostr-adrs ADR-0038.
