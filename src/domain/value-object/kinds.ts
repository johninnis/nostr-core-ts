/** NIP-01 kind 0 — user metadata (profile) event. */
export const KIND_METADATA = 0 as const
/** NIP-01 kind 1 — short text note. */
export const KIND_SHORT_NOTE = 1 as const
/** NIP-02 kind 3 — contact list / follow list. */
export const KIND_CONTACT_LIST = 3 as const
/** NIP-04 kind 4 — legacy encrypted direct message (deprecated; prefer NIP-17). */
export const KIND_ENCRYPTED_DM = 4 as const
/** NIP-09 kind 5 — event deletion request. */
export const KIND_DELETION = 5 as const
/** NIP-18 kind 6 — repost of a kind-1 short note. */
export const KIND_REPOST = 6 as const
/** NIP-25 kind 7 — reaction event (`+`, `-`, emoji). */
export const KIND_REACTION = 7 as const
/** NIP-17 kind 13 — sealed rumor (the inner event of a gift wrap). */
export const KIND_SEAL = 13 as const
/** NIP-17 kind 14 — private message rumor (the payload inside a seal). */
export const KIND_PRIVATE_MESSAGE = 14 as const
/** NIP-18 kind 16 — generic repost of any non-kind-1 event. */
export const KIND_GENERIC_REPOST = 16 as const
/** NIP-71 kind 21 — long-form video event. */
export const KIND_VIDEO = 21 as const
/** NIP-71 kind 22 — short-form video event. */
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
/** NIP-104 kind 443 — MLS key package. */
export const KIND_MLS_KEY_PACKAGE = 443 as const
/** NIP-104 kind 444 — MLS welcome message. */
export const KIND_MLS_WELCOME = 444 as const
/** NIP-104 kind 445 — MLS group message. */
export const KIND_MLS_GROUP_MESSAGE = 445 as const
/** NIP-59 kind 1059 — gift wrap (the outer event of a sealed rumor). */
export const KIND_GIFT_WRAP = 1059 as const
/** NIP-94 kind 1063 — file metadata (url, hashes, mime, dimensions, blurhash, alt …). */
export const KIND_FILE_METADATA = 1063 as const
/** NIP-51 kind 1068 — curated set (deprecated; superseded by 30000-range sets). */
export const KIND_CURATED_SET = 1068 as const
/** NIP-22 kind 1111 — comment on an event (the universal reply kind). */
export const KIND_COMMENT = 1111 as const
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
/** NIP-51 kind 10009 — replaceable user-groups list. */
export const KIND_USER_GROUPS_LIST = 10009 as const
/** NIP-37 kind 10013 — replaceable private-relays list (encrypted). */
export const KIND_PRIVATE_RELAYS = 10013 as const
/** NIP-51 kind 10015 — replaceable interests list. */
export const KIND_INTERESTS_LIST = 10015 as const
/** NIP-34 kind 10017 — replaceable git-authors list. */
export const KIND_GIT_AUTHORS_LIST = 10017 as const
/** NIP-34 kind 10018 — replaceable git-repositories list. */
export const KIND_GIT_REPOSITORIES_LIST = 10018 as const
/** NIP-51 kind 10020 — replaceable media-follows list. */
export const KIND_MEDIA_FOLLOWS_LIST = 10020 as const
/** NIP-51 kind 10030 — replaceable custom-emoji list. */
export const KIND_CUSTOM_EMOJI_LIST = 10030 as const
/** NIP-17 kind 10050 — replaceable DM-relay list (relays the user reads DMs from). */
export const KIND_DM_RELAY_LIST = 10050 as const
/** NIP-104 kind 10051 — replaceable MLS key-package relays list. */
export const KIND_KEY_PACKAGE_RELAYS = 10051 as const
/** BUD-03 kind 10063 — replaceable Blossom server list. */
export const KIND_BLOSSOM_SERVER_LIST = 10063 as const

/** NIP-42 kind 22242 — relay client authentication challenge response. */
export const KIND_CLIENT_AUTH = 22242 as const
/** NIP-46 kind 24133 — nostr-connect (remote signer) RPC. */
export const KIND_NOSTR_CONNECT = 24133 as const
/** NIP-98 kind 27235 — HTTP auth event (`Authorization: Nostr <base64>`). */
export const KIND_HTTP_AUTH = 27235 as const

/** NIP-51 kind 30000 — parameterised-replaceable people set. */
export const KIND_PEOPLE_SET = 30000 as const
/** NIP-51 kind 30002 — parameterised-replaceable relay set. */
export const KIND_RELAY_SET = 30002 as const
/** NIP-51 kind 30003 — parameterised-replaceable note set. */
export const KIND_NOTE_SET = 30003 as const
/** NIP-51 kind 30004 — parameterised-replaceable curation set (articles). */
export const KIND_CURATION_SET_ARTICLES = 30004 as const
/** NIP-51 kind 30005 — parameterised-replaceable curation set (videos). */
export const KIND_CURATION_SET_VIDEO = 30005 as const
/** NIP-51 kind 30006 — parameterised-replaceable curation set (pictures). */
export const KIND_CURATION_SET_PICTURES = 30006 as const
/** NIP-51 kind 30007 — parameterised-replaceable mute set. */
export const KIND_MUTE_SET = 30007 as const
/** NIP-51 kind 30015 — parameterised-replaceable interest set. */
export const KIND_INTEREST_SET = 30015 as const
/** NIP-23 kind 30023 — parameterised-replaceable long-form article (published). */
export const KIND_LONGFORM = 30023 as const
/** NIP-23 kind 30024 — parameterised-replaceable long-form article (draft). */
export const KIND_LONGFORM_DRAFT = 30024 as const
/** NIP-51 kind 30030 — parameterised-replaceable emoji set. */
export const KIND_EMOJI_SET = 30030 as const
/** NIP-51 kind 30063 — parameterised-replaceable release-artifact set. */
export const KIND_RELEASE_ARTIFACT_SET = 30063 as const
/** NIP-78 kind 30078 — parameterised-replaceable app-settings event. */
export const KIND_APP_SETTINGS = 30078 as const
/** NIP-53 kind 30311 — parameterised-replaceable live-event metadata. */
export const KIND_LIVE_EVENT = 30311 as const
/** NIP-52 kind 31924 — parameterised-replaceable calendar event. */
export const KIND_CALENDAR = 31924 as const
/** NIP-71 kind 34235 — parameterised-replaceable horizontal-video event. */
export const KIND_VIDEO_HORIZONTAL = 34235 as const
/** NIP-71 kind 34236 — parameterised-replaceable vertical-video event. */
export const KIND_VIDEO_VERTICAL = 34236 as const
/** NIP-51 kind 39089 — parameterised-replaceable starter pack. */
export const KIND_STARTER_PACK = 39089 as const
