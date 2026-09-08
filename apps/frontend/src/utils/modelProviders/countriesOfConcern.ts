/**
 * Countries-of-Concern registry.
 *
 * Maps individual LLM model IDs to a country flagged by the
 * U.S. Department of Commerce as a country of concern (China, Russia, Iran,
 * North Korea). UI surfaces (admin model toggles, chat model selector)
 * read this registry to render warning iconography and confirmation
 * popups before a user enables or selects a flagged model.
 */

export enum CountryOfConcern {
  China = 'China',
  Russia = 'Russia',
  Iran = 'Iran',
  NorthKorea = 'North Korea',
}

const CHINA_MODEL_IDS: ReadonlyArray<string> = [
  // DeepSeek (via OpenRouter)
  'deepseek/deepseek-chat-v3-0324',
  'deepseek/deepseek-chat-v3.1',
  'deepseek/deepseek-v3.1-terminus',
  'deepseek/deepseek-v3.2',
  'deepseek/deepseek-v3.2-exp',
  'deepseek/deepseek-v3.2-speciale',
  'deepseek/deepseek-r1-zero',
  'deepseek/deepseek-r1-0528-qwen3-8b',
  // DeepSeek (Ollama / self-hosted)
  'deepseek-r1:14b-qwen-distill-fp16',
  'deepseek-r1:32b',
  'deepseek-r1:70b',

  // Qwen / Alibaba
  'qwen/qwen3-32b',
  'qwen/qwen3-235b-a22b',
  'qwen/qwen3-vl-235b-a22b-thinking',
  'qwen/qwen3-coder-plus',
  'qwen/qwen3-vl-32b-instruct',
  'qwen/qwen2.5-vl-32b-instruct',
  'Qwen/Qwen2.5-VL-72B-Instruct',
  'qwen/qwen-2.5-72b-instruct',
  'eva-unit-01/eva-qwen-2.5-32b',
  // Qwen (Ollama / self-hosted)
  'qwen2.5:14b-instruct-fp16',
  'qwen2.5:7b-instruct-fp16',
  'qwen3:32b',
  // Qwen (Cerebras)
  'qwen-3-32b',
  'qwen-3-235b-a22b-instruct-2507',
  // Qwen (NCSA-hosted VLM)
  'Qwen/Qwen2-VL-72B-Instruct',
  'Qwen/Qwen2.5-VL-32B-Instruct',
  // Qwen (WebLLM in-browser)
  'Qwen2 7b Instruct',

  // Z.AI / THUDM / GLM
  'z-ai/glm-4.5',
  'z-ai/glm-4.5v',
  'z-ai/glm-4.5-air',
  'z-ai/glm-4.6',
  'thudm/glm-4.1v-9b-thinking',
  'zai-glm-4.6',

  // MoonshotAI Kimi
  'moonshotai/kimi-k2',
  'moonshotai/kimi-k2-0905',

  // MiniMax
  'minimax/minimax-m2',
]

const RUSSIA_MODEL_IDS: ReadonlyArray<string> = []
const IRAN_MODEL_IDS: ReadonlyArray<string> = []
const NORTH_KOREA_MODEL_IDS: ReadonlyArray<string> = []

/**
 * Model IDs are compared case-insensitively. Upstream catalogs are
 * inconsistent about casing for the same model — OpenRouter serves
 * `qwen/qwen2.5-vl-32b-instruct` while the NCSA-hosted VLM catalog serves
 * `Qwen/Qwen2.5-VL-32B-Instruct` — and `getOpenAICompatibleModels` already
 * lowercases IDs when matching saved preferences for this reason. Matching
 * case-sensitively here would let a casing change silently unflag a model
 * *and* flip it back to enabled-by-default.
 */
function normalizeModelId(modelId: string): string {
  return modelId.trim().toLowerCase()
}

/**
 * One entry per country whose model IDs we track. Kept as data rather than
 * four inlined `.map()` spreads so that adding a country is a one-line change
 * and the ID-normalizing callback is shared (an empty list would otherwise
 * leave its own copy of that callback unreachable).
 */
const COUNTRY_MODEL_ID_LISTS: ReadonlyArray<
  readonly [ReadonlyArray<string>, CountryOfConcern]
> = [
  [CHINA_MODEL_IDS, CountryOfConcern.China],
  [RUSSIA_MODEL_IDS, CountryOfConcern.Russia],
  [IRAN_MODEL_IDS, CountryOfConcern.Iran],
  [NORTH_KOREA_MODEL_IDS, CountryOfConcern.NorthKorea],
]

const MODEL_COUNTRY_MAP: ReadonlyMap<string, CountryOfConcern> = new Map<
  string,
  CountryOfConcern
>(
  COUNTRY_MODEL_ID_LISTS.flatMap(([ids, country]) =>
    ids.map(
      (id) => [normalizeModelId(id), country] as [string, CountryOfConcern],
    ),
  ),
)

/**
 * Vendor-family substrings, checked when an exact model ID isn't in the
 * registry above.
 *
 * This exists so the registry fails *closed*. An exact-ID allowlist silently
 * stops flagging the moment a vendor ships a new version or an Ollama tag
 * varies (`deepseek-r1:8b`, `qwen3:14b`, `glm-4.7`), and because flagged
 * models now also default to disabled, an unflagged model additionally
 * defaults back to enabled. For a control that exists to satisfy institutional
 * policy, a new DeepSeek release should be flagged until someone decides
 * otherwise — not silently exempt until someone remembers to add its ID.
 *
 * Order matters only if a substring could match more than one family; keep
 * these mutually exclusive. Add false positives to
 * COUNTRY_OF_CONCERN_EXCEPTIONS rather than narrowing a pattern.
 */
const VENDOR_PATTERNS: ReadonlyArray<readonly [string, CountryOfConcern]> = [
  // China
  ['deepseek', CountryOfConcern.China],
  ['qwen', CountryOfConcern.China],
  ['glm', CountryOfConcern.China],
  ['thudm', CountryOfConcern.China],
  ['z-ai', CountryOfConcern.China],
  ['zai-', CountryOfConcern.China],
  ['moonshot', CountryOfConcern.China],
  ['kimi', CountryOfConcern.China],
  ['minimax', CountryOfConcern.China],
  ['yi-', CountryOfConcern.China],
  ['internlm', CountryOfConcern.China],
  ['baichuan', CountryOfConcern.China],
  ['ernie', CountryOfConcern.China],
  ['hunyuan', CountryOfConcern.China],
]

/**
 * Normalized model IDs that a VENDOR_PATTERNS substring matches but which
 * should NOT be flagged. Empty today; this is the documented escape hatch so
 * a false positive is fixed by an explicit exception rather than by weakening
 * a pattern (which would re-open the fail-open hole above).
 */
const COUNTRY_OF_CONCERN_EXCEPTIONS: ReadonlySet<string> = new Set<string>([])

export function getCountryOfConcern(
  modelId: string | undefined | null,
): CountryOfConcern | null {
  if (!modelId) return null
  const normalized = normalizeModelId(modelId)
  if (!normalized) return null

  const exact = MODEL_COUNTRY_MAP.get(normalized)
  if (exact) return exact

  if (COUNTRY_OF_CONCERN_EXCEPTIONS.has(normalized)) return null

  for (const [pattern, country] of VENDOR_PATTERNS) {
    if (normalized.includes(pattern)) return country
  }

  return null
}

export function isCountryOfConcern(
  modelId: string | undefined | null,
): boolean {
  return getCountryOfConcern(modelId) !== null
}

/**
 * Short label used inline next to a model name (tooltip/icon hover).
 */
export function getCountryOfConcernShortMessage(
  country: CountryOfConcern,
): string {
  return `This model originates from ${country}, a country of concern flagged by the U.S. Department of Commerce. Use with caution.`
}

const ACK_STORAGE_KEY = 'coc-acknowledged-chatbots'

function readAcknowledgedSet(): Set<string> {
  if (typeof window === 'undefined') return new Set()
  try {
    const raw = window.localStorage.getItem(ACK_STORAGE_KEY)
    if (!raw) return new Set()
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return new Set()
    return new Set(parsed.filter((x): x is string => typeof x === 'string'))
  } catch {
    return new Set()
  }
}

function writeAcknowledgedSet(set: Set<string>): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(
      ACK_STORAGE_KEY,
      JSON.stringify(Array.from(set)),
    )
  } catch {
    // ignore quota / serialization errors — popup will simply re-fire next time
  }
}

/**
 * Whether the user has already acknowledged the country-of-concern warning
 * for this chatbot. Once acknowledged, no further popups fire for that
 * chatbot — across all flagged models.
 */
export function isChatbotCocAcknowledged(
  chatbotId: string | undefined | null,
): boolean {
  if (!chatbotId) return false
  return readAcknowledgedSet().has(chatbotId)
}

/**
 * Persist acknowledgment for a chatbot so the warning popup is shown
 * only on first enable of any flagged model. Subsequent enables anywhere
 * within this chatbot skip the modal.
 */
export function markChatbotCocAcknowledged(chatbotId: string): void {
  if (!chatbotId) return
  const set = readAcknowledgedSet()
  if (set.has(chatbotId)) return
  set.add(chatbotId)
  writeAcknowledgedSet(set)
}

/**
 * Longer message shown in the admin confirmation popup before enabling.
 */
export function getCountryOfConcernLongMessage(
  modelName: string,
  country: CountryOfConcern,
): string {
  return (
    `${modelName} originates from ${country}, which the U.S. Department of Commerce ` +
    `has identified as a country of concern. Models from these jurisdictions may carry ` +
    `data-handling, supply-chain, or compliance risks for your organization. ` +
    `You can still enable this model, but please confirm that doing so is consistent ` +
    `with your institution's policy.`
  )
}

/**
 * Providers that serve models from university-controlled infrastructure.
 *
 * Compared as plain strings (rather than importing the `ProviderNames` enum)
 * to keep this module dependency-free — `LLMProvider.ts` pulls in the model
 * fetchers, which import this module.
 */
const LOCALLY_HOSTED_PROVIDERS: ReadonlySet<string> = new Set([
  'NCSAHosted',
  'NCSAHostedVLM',
  'Ollama',
  'WebLLM', // runs in the browser — never leaves the user's machine
])

export function isLocallyHostedProvider(
  provider: string | undefined | null,
): boolean {
  if (!provider) return false
  return LOCALLY_HOSTED_PROVIDERS.has(provider)
}

/**
 * Banner prose shown above the chat input, up to the "further information"
 * link (which the caller renders as JSX).
 *
 * Two variants because the locality claim is only true for locally-hosted
 * models. The registry flags OpenRouter-routed models too, and telling a user
 * their data "never goes to foreign servers" on a model served by a
 * third-party API is a false guarantee on exactly the models with the most
 * exposure. When provenance is known but hosting is not, we fall back to the
 * variant that makes no locality promise.
 */
export function getCountryOfConcernBannerLede(
  country: CountryOfConcern,
  locallyHosted: boolean,
): string {
  if (locallyHosted) {
    return (
      `This model is hosted locally at the U of I, so Illinois Chat does not ` +
      `send your conversation to external servers. Users should still be ` +
      `aware that the model itself was initially developed in a country deemed ` +
      `worthy of extra caution.`
    )
  }
  return (
    `This model was developed in ${country}, a country deemed worthy of extra ` +
    `caution, and it is served by a third-party provider rather ` +
    `than hosted locally at the U of I. Your conversation leaves university ` +
    `infrastructure when you use this model, so please avoid sharing sensitive ` +
    `information.`
  )
}

export const COUNTRY_OF_CONCERN_INFO_URL =
  'https://ai.uillinois.edu/userfiles/public/ui_system_ai_guidance_countries_of_concern.pdf'

const BANNER_ACK_STORAGE_KEY = 'coc-banner-dismissed-pairs'

function readBannerDismissedSet(): Set<string> {
  if (typeof window === 'undefined') return new Set()
  try {
    const raw = window.localStorage.getItem(BANNER_ACK_STORAGE_KEY)
    if (!raw) return new Set()
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return new Set()
    return new Set(parsed.filter((x): x is string => typeof x === 'string'))
  } catch {
    return new Set()
  }
}

function writeBannerDismissedSet(set: Set<string>): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(
      BANNER_ACK_STORAGE_KEY,
      JSON.stringify(Array.from(set)),
    )
  } catch {
    // ignore quota / serialization errors — banner will simply re-fire next time
  }
}

function bannerKey(chatbotId: string, modelId: string): string {
  return `${chatbotId}::${modelId}`
}

/**
 * Whether the user has permanently dismissed the country-of-concern banner
 * for this (chatbot, model) pair. Banner remains dismissed across reloads
 * for that pair only; selecting a different flagged model re-shows it.
 */
export function isCocBannerDismissed(
  chatbotId: string | undefined | null,
  modelId: string | undefined | null,
): boolean {
  if (!chatbotId || !modelId) return false
  return readBannerDismissedSet().has(bannerKey(chatbotId, modelId))
}

/**
 * Persist banner dismissal for a (chatbot, model) pair.
 */
export function markCocBannerDismissed(
  chatbotId: string,
  modelId: string,
): void {
  if (!chatbotId || !modelId) return
  const set = readBannerDismissedSet()
  const key = bannerKey(chatbotId, modelId)
  if (set.has(key)) return
  set.add(key)
  writeBannerDismissedSet(set)
}
