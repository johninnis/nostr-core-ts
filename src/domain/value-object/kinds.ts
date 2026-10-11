/** NIP-01 kind 0 — user metadata (profile) event. */
export const KIND_METADATA = 0 as const
/** NIP-01 kind 1 — short text note. */
export const KIND_TEXT_NOTE = 1 as const
/** NIP-02 kind 3 — contact list / follow list. */
export const KIND_FOLLOW_LIST = 3 as const
/** NIP-04 kind 4 — legacy encrypted direct message (deprecated; prefer NIP-17). */
export const KIND_ENCRYPTED_DIRECT_MESSAGE = 4 as const
/** NIP-09 kind 5 — event deletion request. */
export const KIND_EVENT_DELETION = 5 as const
/** NIP-18 kind 6 — repost of a kind-1 short note. */
export const KIND_REPOST = 6 as const
/** NIP-25 kind 7 — reaction event (`+`, `-`, emoji). */
export const KIND_REACTION = 7 as const
/** NIP-58 kind 8 — badge award: a badge definition awarded to one or more pubkeys. */
export const KIND_BADGE_AWARD = 8 as const
/** NIP-C7 kind 9 — chat message; a reply quotes its parent in a `q` tag. */
export const KIND_CHAT_MESSAGE = 9 as const
/** NIP-7D kind 11 — thread: a titled post that opens a forum-style thread. */
export const KIND_THREAD = 11 as const
/** NIP-59 kind 13 — seal: the signed, encrypted rumour inside a gift wrap. */
export const KIND_SEAL = 13 as const
/** NIP-17 kind 14 — private message rumour (the payload inside a seal). */
export const KIND_PRIVATE_MESSAGE = 14 as const
/** NIP-17 kind 15 — file message rumour: an encrypted file shared in a private chat. */
export const KIND_FILE_MESSAGE = 15 as const
/** NIP-18 kind 16 — generic repost of any non-kind-1 event. */
export const KIND_GENERIC_REPOST = 16 as const
/** NIP-25 kind 17 — reaction to a website, named by its `r` tag. */
export const KIND_WEBSITE_REACTION = 17 as const
/** NIP-68 kind 20 — picture-first post. */
export const KIND_PICTURE = 20 as const
/** NIP-71 kind 21 — video event (a normal, mostly horizontal video). */
export const KIND_VIDEO = 21 as const
/** NIP-71 kind 22 — short-form portrait video event. */
export const KIND_SHORT_FORM_VIDEO = 22 as const
/** NIP-28 kind 40 — channel creation. */
export const KIND_CHANNEL_CREATION = 40 as const
/** NIP-28 kind 41 — channel metadata update. */
export const KIND_CHANNEL_METADATA = 41 as const
/** NIP-28 kind 42 — channel chat message. */
export const KIND_CHANNEL_MESSAGE = 42 as const
/** NIP-28 kind 43 — hide channel message (per user). */
export const KIND_CHANNEL_HIDE_MESSAGE = 43 as const
/** NIP-28 kind 44 — mute channel user (per user). */
export const KIND_CHANNEL_MUTE_USER = 44 as const
/** NIP-62 kind 62 — request to vanish: asks relays to delete everything its author published. */
export const KIND_VANISH_REQUEST = 62 as const
/** Marmot kind 443 — MLS KeyPackage. */
export const KIND_MLS_KEY_PACKAGE = 443 as const
/** Marmot kind 444 — MLS Welcome message. */
export const KIND_MLS_WELCOME = 444 as const
/** Marmot kind 445 — MLS group event. */
export const KIND_MLS_GROUP_MESSAGE = 445 as const
/** NIP-88 kind 1018 — poll response. */
export const KIND_POLL_RESPONSE = 1018 as const
/** NIP-03 kind 1040 — OpenTimestamps attestation for an event. */
export const KIND_OPENTIMESTAMPS = 1040 as const
/** NIP-59 kind 1059 — gift wrap (the outer event of a sealed rumour). */
export const KIND_GIFT_WRAP = 1059 as const
/** NIP-94 kind 1063 — file metadata (url, hashes, mime, dimensions, blurhash, alt …). */
export const KIND_FILE_METADATA = 1063 as const
/** NIP-88 kind 1068 — poll. */
export const KIND_POLL = 1068 as const
/** NIP-22 kind 1111 — comment on an event (the universal reply kind). */
export const KIND_COMMENT = 1111 as const
/** NIP-A0 kind 1222 — voice message: a root audio message. */
export const KIND_VOICE_MESSAGE = 1222 as const
/** NIP-A0 kind 1244 — voice message comment: an audio reply, threaded as a NIP-22 comment is. */
export const KIND_VOICE_MESSAGE_COMMENT = 1244 as const
/** NIP-53 kind 1311 — live chat message: its `a` tag names the live activity, its `e` tag the message it answers. */
export const KIND_LIVE_CHAT_MESSAGE = 1311 as const
/** NIP-56 kind 1984 — reporting (flags content or a user to relays and clients). */
export const KIND_REPORTING = 1984 as const
/** NIP-72 kind 4550 — community post approval. */
export const KIND_COMMUNITY_POST_APPROVAL = 4550 as const
/** NIP-60 kind 7374 — reserved Cashu wallet tokens: a mint quote awaiting payment. */
export const KIND_CASHU_RESERVED_TOKENS = 7374 as const
/** NIP-60 kind 7375 — Cashu wallet tokens: unspent proofs, encrypted. */
export const KIND_CASHU_WALLET_TOKENS = 7375 as const
/** NIP-60 kind 7376 — Cashu wallet history: spending history, encrypted. */
export const KIND_CASHU_WALLET_HISTORY = 7376 as const
/** NIP-75 kind 9041 — zap goal. */
export const KIND_ZAP_GOAL = 9041 as const
/** NIP-61 kind 9321 — nutzap (Cashu-backed zap). */
export const KIND_NUTZAP = 9321 as const
/** NIP-57 kind 9734 — zap request (signed by payer, sent to LNURL endpoint). */
export const KIND_ZAP_REQUEST = 9734 as const
/** NIP-57 kind 9735 — zap receipt (signed by LNURL server after payment). */
export const KIND_ZAP_RECEIPT = 9735 as const
/** NIP-84 kind 9802 — highlight of text quoted from a URL or another event. */
export const KIND_HIGHLIGHT = 9802 as const

/** NIP-51 kind 10000 — replaceable mute list. */
export const KIND_MUTE_LIST = 10000 as const
/** NIP-51 kind 10001 — replaceable pinned-notes list. */
export const KIND_PIN_LIST = 10001 as const
/** NIP-65 kind 10002 — replaceable relay list (user's read/write relay preferences). */
export const KIND_RELAY_LIST = 10002 as const
/** NIP-51 kind 10003 — replaceable bookmark list. */
export const KIND_BOOKMARK_LIST = 10003 as const
/** NIP-51 kind 10004 — replaceable communities list. */
export const KIND_COMMUNITIES_LIST = 10004 as const
/** NIP-51 kind 10005 — replaceable public-chats list. */
export const KIND_PUBLIC_CHATS_LIST = 10005 as const
/** NIP-51 kind 10006 — replaceable blocked-relays list. */
export const KIND_BLOCKED_RELAYS_LIST = 10006 as const
/** NIP-51 kind 10007 — replaceable search-relays list. */
export const KIND_SEARCH_RELAYS_LIST = 10007 as const
/** NIP-58 kind 10008 — replaceable profile badges: the badges a user displays. */
export const KIND_PROFILE_BADGES = 10008 as const
/** NIP-51 kind 10009 — replaceable simple-groups list (the NIP-29 groups the user is in). */
export const KIND_SIMPLE_GROUPS_LIST = 10009 as const
/** NIP-39 kind 10011 — replaceable external identities: claims to identities on other platforms. */
export const KIND_EXTERNAL_IDENTITIES = 10011 as const
/** NIP-51 kind 10012 — replaceable relay feeds list: favourite browsable relays and relay sets. */
export const KIND_RELAY_FEEDS_LIST = 10012 as const
/** NIP-37 kind 10013 — replaceable private-relays list (encrypted). */
export const KIND_PRIVATE_EVENT_RELAY_LIST = 10013 as const
/** NIP-51 kind 10015 — replaceable interests list. */
export const KIND_INTERESTS_LIST = 10015 as const
/** NIP-51 kind 10017 — replaceable git-authors list (people who produce NIP-34 events). */
export const KIND_GIT_AUTHORS_LIST = 10017 as const
/** NIP-51 kind 10018 — replaceable git-repositories list (NIP-34 repository announcements followed). */
export const KIND_GIT_REPOSITORIES_LIST = 10018 as const
/** NIP-61 kind 10019 — replaceable nutzap mint recommendation: the mints and relays a user takes nutzaps on. */
export const KIND_NUTZAP_MINT_RECOMMENDATION = 10019 as const
/** NIP-51 kind 10020 — replaceable media-follows list. */
export const KIND_MEDIA_FOLLOWS_LIST = 10020 as const
/** NIP-51 kind 10021 — replaceable favourite follow-sets list (kind-30000 follow sets the user favours). */
export const KIND_FAVOURITE_FOLLOW_SETS_LIST = 10021 as const
/** NIP-51 kind 10030 — replaceable custom-emoji list. */
export const KIND_CUSTOM_EMOJI_LIST = 10030 as const
/** NIP-17 kind 10050 — replaceable DM-relay list (relays the user reads DMs from). */
export const KIND_DM_RELAY_LIST = 10050 as const
/** Marmot kind 10051 — replaceable KeyPackage relays list. */
export const KIND_KEY_PACKAGE_RELAYS = 10051 as const
/** NIP-51 kind 10054 — replaceable favourite-podcasts list (NIP-F4 podcast pubkeys and RSS feed URLs). */
export const KIND_FAVOURITE_PODCASTS_LIST = 10054 as const
/** NIP-B7 (Blossom BUD-03) kind 10063 — replaceable user server list. */
export const KIND_BLOSSOM_SERVER_LIST = 10063 as const
/** NIP-51 kind 10064 — replaceable authored-podcasts list (NIP-F4 podcast pubkeys the user authors). */
export const KIND_AUTHORED_PODCASTS_LIST = 10064 as const
/** NIP-51 kind 10101 — replaceable good wiki authors list: NIP-54 authors the user recommends. */
export const KIND_GOOD_WIKI_AUTHORS_LIST = 10101 as const
/** NIP-51 kind 10102 — replaceable good wiki relays list: relays hosting only useful NIP-54 articles. */
export const KIND_GOOD_WIKI_RELAYS_LIST = 10102 as const
/** NIP-66 kind 10166 — replaceable relay monitor announcement. */
export const KIND_RELAY_MONITOR_ANNOUNCEMENT = 10166 as const
/** NIP-53 kind 10312 — replaceable room presence: the interactive room a user is in. */
export const KIND_ROOM_PRESENCE = 10312 as const
/** NIP-47 kind 13194 — replaceable wallet info: the commands a Nostr Wallet Connect service supports. */
export const KIND_WALLET_INFO = 13194 as const
/** NIP-60 kind 17375 — replaceable Cashu wallet: its mints and private key, encrypted. */
export const KIND_CASHU_WALLET = 17375 as const

/** NIP-42 kind 22242 — relay client authentication challenge response. */
export const KIND_CLIENT_AUTH = 22242 as const
/** NIP-59 kind 21059 — ephemeral gift wrap (a kind-1059 gift wrap with ephemeral semantics; relays do not store it). */
export const KIND_EPHEMERAL_GIFT_WRAP = 21059 as const
/** NIP-47 kind 23194 — Nostr Wallet Connect request. */
export const KIND_WALLET_REQUEST = 23194 as const
/** NIP-47 kind 23195 — Nostr Wallet Connect response. */
export const KIND_WALLET_RESPONSE = 23195 as const
/** NIP-46 kind 24133 — nostr-connect (remote signer) RPC. */
export const KIND_NOSTR_CONNECT = 24133 as const
/** BUD-11 kind 24242 — Blossom authorisation (the `t`-tag verb names the blob operation it permits). */
export const KIND_BLOSSOM_AUTHORISATION = 24242 as const
/** NIP-98 kind 27235 — HTTP auth event (`Authorization: Nostr <base64>`). */
export const KIND_HTTP_AUTH = 27235 as const

/** NIP-51 kind 30000 — addressable follow set. */
export const KIND_FOLLOW_SET = 30000 as const
/** NIP-51 kind 30002 — addressable relay set. */
export const KIND_RELAY_SET = 30002 as const
/** NIP-51 kind 30003 — addressable bookmark set. */
export const KIND_BOOKMARK_SET = 30003 as const
/** NIP-51 kind 30004 — addressable curation set (articles and notes). */
export const KIND_CURATION_SET_ARTICLES = 30004 as const
/** NIP-51 kind 30005 — addressable curation set (videos). */
export const KIND_CURATION_SET_VIDEO = 30005 as const
/** NIP-51 kind 30006 — addressable curation set (pictures). */
export const KIND_CURATION_SET_PICTURES = 30006 as const
/** NIP-51 kind 30007 — addressable kind mute set. */
export const KIND_KIND_MUTE_SET = 30007 as const
/** NIP-58 kind 30008 — addressable badge set. */
export const KIND_BADGE_SET = 30008 as const
/** NIP-58 kind 30009 — addressable badge definition. */
export const KIND_BADGE_DEFINITION = 30009 as const
/** NIP-51 kind 30015 — addressable interest set. */
export const KIND_INTEREST_SET = 30015 as const
/** NIP-23 kind 30023 — addressable long-form article (published). */
export const KIND_LONGFORM_CONTENT = 30023 as const
/**
 * NIP-23 kind 30024 — addressable long-form draft, deprecated: NIP-23 says it "was used for long-form drafts
 * (self-encrypted nip04, same format as `kind:30023`)" and prefers NIP-37 drafts.
 */
export const KIND_LONGFORM_CONTENT_DRAFT = 30024 as const
/** NIP-51 kind 30030 — addressable emoji set. */
export const KIND_EMOJI_SET = 30030 as const
/** NIP-51 kind 30063 — addressable release-artifact set. */
export const KIND_RELEASE_ARTIFACT_SET = 30063 as const
/** NIP-78 kind 30078 — addressable app-settings event. */
export const KIND_APPLICATION_SPECIFIC_DATA = 30078 as const
/** NIP-66 kind 30166 — addressable relay discovery: a monitor's report on one relay. */
export const KIND_RELAY_DISCOVERY = 30166 as const
/** NIP-51 kind 30267 — addressable app curation set. */
export const KIND_APP_CURATION_SET = 30267 as const
/** NIP-53 kind 30311 — addressable live-event metadata. */
export const KIND_LIVE_EVENT = 30311 as const
/** NIP-53 kind 30312 — addressable interactive room. */
export const KIND_INTERACTIVE_ROOM = 30312 as const
/** NIP-53 kind 30313 — addressable conference event. */
export const KIND_CONFERENCE_EVENT = 30313 as const
/** NIP-38 kind 30315 — addressable user status. */
export const KIND_USER_STATUS = 30315 as const
/** NIP-54 kind 30818 — addressable wiki article. */
export const KIND_WIKI_ARTICLE = 30818 as const
/** NIP-54 kind 30819 — addressable wiki redirect. */
export const KIND_WIKI_REDIRECT = 30819 as const
/**
 * NIP-37 kind 31234 — addressable draft wrap: `content` is a draft event, JSON-serialised and NIP-44-encrypted to
 * the signer's own pubkey, with a `d` tag naming the draft and a `k` tag naming the draft's kind. An empty `content`
 * signals the draft was deleted.
 */
export const KIND_DRAFT_WRAP = 31234 as const
/** NIP-52 kind 31922 — addressable date-based calendar event. */
export const KIND_CALENDAR_EVENT_DATE = 31922 as const
/** NIP-52 kind 31923 — addressable time-based calendar event. */
export const KIND_CALENDAR_EVENT_TIME = 31923 as const
/** NIP-51 kind 31924 — addressable calendar: a set of NIP-52 calendar events. */
export const KIND_CALENDAR = 31924 as const
/** NIP-52 kind 31925 — addressable calendar event RSVP. */
export const KIND_CALENDAR_EVENT_RSVP = 31925 as const
/** NIP-89 kind 31989 — addressable handler recommendation. */
export const KIND_HANDLER_RECOMMENDATION = 31989 as const
/** NIP-89 kind 31990 — addressable handler information. */
export const KIND_HANDLER_INFORMATION = 31990 as const
/** NIP-71 kind 34235 — addressable video event. */
export const KIND_VIDEO_ADDRESSABLE = 34235 as const
/** NIP-71 kind 34236 — addressable short video event. */
export const KIND_SHORT_FORM_VIDEO_ADDRESSABLE = 34236 as const
/** NIP-72 kind 34550 — addressable community definition. */
export const KIND_COMMUNITY_DEFINITION = 34550 as const
/** NIP-87 kind 38172 — addressable Cashu mint announcement. */
export const KIND_CASHU_MINT_ANNOUNCEMENT = 38172 as const
/** NIP-87 kind 38173 — addressable Fedimint announcement. */
export const KIND_FEDIMINT_ANNOUNCEMENT = 38173 as const
/** NIP-29 kind 39000 — addressable group metadata, written and signed by the relay that hosts the group. */
export const KIND_GROUP_METADATA = 39000 as const
/** NIP-51 kind 39089 — addressable starter pack. */
export const KIND_STARTER_PACK = 39089 as const
/** NIP-51 kind 39092 — addressable media starter pack. */
export const KIND_MEDIA_STARTER_PACK = 39092 as const

/**
 * The two NIP-18 repost kinds: `KIND_REPOST` (kind 6, kind-1 reposts) and `KIND_GENERIC_REPOST` (kind 16, all other
 * kinds).
 */
export const REPOST_KINDS: ReadonlyArray<number> = [KIND_REPOST, KIND_GENERIC_REPOST]

/** `true` when `kind` is a NIP-18 repost (kind 6 or 16). */
export const isRepostKind = (kind: number): boolean => REPOST_KINDS.includes(kind)

/** `true` when `value` is a NIP-01 event kind: an integer from 0 to 65535. */
export const isValidKind = (value: unknown): value is number =>
  Number.isSafeInteger(value) && Number(value) >= 0 && Number(value) <= 65535

/**
 * The four NIP-01 storage behaviours an event kind has: stored, replaced per author, not stored, or replaced per
 * address.
 */
export type KindCategory = "regular" | "replaceable" | "ephemeral" | "addressable"

// Deliberate: total, every kind outside the replaceable, ephemeral and addressable ranges regular — see shared ADR-0010
/**
 * The NIP-01 category of `kind`: `replaceable` for 0, 3 and 10000–19999, `ephemeral` for 20000–29999, `addressable` for
 * 30000–39999, and `regular` for every other kind.
 */
export const kindCategory = (kind: number): KindCategory => {
  if (kind === KIND_METADATA || kind === KIND_FOLLOW_LIST || (kind >= 10000 && kind < 20000)) return "replaceable"
  if (kind >= 20000 && kind < 30000) return "ephemeral"
  if (kind >= 30000 && kind < 40000) return "addressable"
  return "regular"
}
