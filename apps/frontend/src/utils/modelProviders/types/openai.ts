import { type ProviderNames } from '../LLMProvider'

export interface OpenAIProvider {
  provider: ProviderNames.OpenAI
  enabled: boolean
  baseUrl?: string
  apiKey?: string
  error?: string
  models?: OpenAIModel[]
}

export interface OpenAIModel {
  id: string
  name: string
  tokenLimit: number
  enabled: boolean
  default?: boolean
  temperature?: number
}

export enum OpenAIModelID {
  // We're not going to support o1 series - they are not worth including because replaced by o3.
  o3 = 'o3', // added - most powerful reasoning model
  o3_mini = 'o3-mini', // rolling model
  o4_mini = 'o4-mini', // added - faster, more affordable reasoning model
  GPT_4o_mini = 'gpt-4o-mini', // rolling model - currently points to gpt-4o-2024-05-13
  GPT_4o = 'gpt-4o', // rolling model - currently points to gpt-4o-2024-05-13
  GPT_4_1 = 'gpt-4.1', // rolling model
  GPT_4_1_mini = 'gpt-4.1-mini', // rolling model
  GPT_4_1_nano = 'gpt-4.1-nano', // rolling model
  // New GPT-5 family
  GPT_5_5 = 'gpt-5.5',
  GPT_5_4 = 'gpt-5.4',
  GPT_5_4_pro = 'gpt-5.4-pro',
  GPT_5_4_mini = 'gpt-5.4-mini',
  GPT_5_4_nano = 'gpt-5.4-nano',
  GPT_5_3_chat_latest = 'gpt-5.3-chat-latest',
  GPT_5_2 = 'gpt-5.2',
  GPT_5_2_codex = 'gpt-5.2-codex',
  GPT_5_1 = 'gpt-5.1',
  GPT_5_1_chat_latest = 'gpt-5.1-chat-latest',
  GPT_5_1_codex = 'gpt-5.1-codex',
  GPT_5_1_codex_mini = 'gpt-5.1-codex-mini',
  GPT_5 = 'gpt-5',
  GPT_5_mini = 'gpt-5-mini',
  GPT_5_nano = 'gpt-5-nano',
  GPT_5_thinking = 'gpt-5-thinking',
}

export const ModelIDsThatUseDeveloperMessage: readonly OpenAIModelID[] = [
  OpenAIModelID.o3_mini,
  OpenAIModelID.o3,
  OpenAIModelID.o4_mini,
] as const

export const GPT5Models: readonly OpenAIModelID[] = [
  OpenAIModelID.GPT_5_5,
  OpenAIModelID.GPT_5_4,
  OpenAIModelID.GPT_5_4_pro,
  OpenAIModelID.GPT_5_4_mini,
  OpenAIModelID.GPT_5_4_nano,
  OpenAIModelID.GPT_5_3_chat_latest,
  OpenAIModelID.GPT_5_2,
  OpenAIModelID.GPT_5_2_codex,
  OpenAIModelID.GPT_5_1,
  OpenAIModelID.GPT_5_1_chat_latest,
  OpenAIModelID.GPT_5_1_codex,
  OpenAIModelID.GPT_5_1_codex_mini,
  OpenAIModelID.GPT_5,
  OpenAIModelID.GPT_5_mini,
  OpenAIModelID.GPT_5_nano,
  OpenAIModelID.GPT_5_thinking,
] as const

export const OpenAIModels: Record<OpenAIModelID, OpenAIModel> = {
  // NOTE: We use these as default values for enabled: true/false.

  [OpenAIModelID.o3]: {
    id: OpenAIModelID.o3,
    name: 'o3 (Reasoning)',
    tokenLimit: 200000,
    enabled: true,
  },
  [OpenAIModelID.o3_mini]: {
    id: OpenAIModelID.o3_mini,
    name: 'o3-mini (Reasoning)',
    tokenLimit: 200000,
    enabled: true,
  },
  [OpenAIModelID.o4_mini]: {
    id: OpenAIModelID.o4_mini,
    name: 'o4-mini (Reasoning)',
    tokenLimit: 200000,
    enabled: true,
  },
  [OpenAIModelID.GPT_4o_mini]: {
    id: OpenAIModelID.GPT_4o_mini,
    name: 'GPT-4o mini',
    tokenLimit: 128000,
    enabled: true,
  },
  [OpenAIModelID.GPT_4o]: {
    id: OpenAIModelID.GPT_4o,
    name: 'GPT-4o',
    tokenLimit: 128000,
    enabled: true,
  },
  [OpenAIModelID.GPT_4_1]: {
    id: OpenAIModelID.GPT_4_1,
    name: 'GPT-4.1',
    tokenLimit: 1047576,
    enabled: true,
  },
  [OpenAIModelID.GPT_4_1_mini]: {
    id: OpenAIModelID.GPT_4_1_mini,
    name: 'GPT-4.1 Mini',
    tokenLimit: 1047576,
    enabled: true,
  },
  [OpenAIModelID.GPT_4_1_nano]: {
    id: OpenAIModelID.GPT_4_1_nano,
    name: 'GPT-4.1 Nano',
    tokenLimit: 1047576,
    enabled: true,
  },
  [OpenAIModelID.GPT_5_5]: {
    id: OpenAIModelID.GPT_5_5,
    name: 'GPT-5.5',
    tokenLimit: 1050000,
    enabled: true,
  },
  [OpenAIModelID.GPT_5_4]: {
    id: OpenAIModelID.GPT_5_4,
    name: 'GPT-5.4',
    tokenLimit: 1050000,
    enabled: true,
  },
  [OpenAIModelID.GPT_5_4_pro]: {
    id: OpenAIModelID.GPT_5_4_pro,
    name: 'GPT-5.4 Pro',
    tokenLimit: 1050000,
    enabled: true,
  },
  [OpenAIModelID.GPT_5_4_mini]: {
    id: OpenAIModelID.GPT_5_4_mini,
    name: 'GPT-5.4 Mini',
    tokenLimit: 400000,
    enabled: true,
  },
  [OpenAIModelID.GPT_5_4_nano]: {
    id: OpenAIModelID.GPT_5_4_nano,
    name: 'GPT-5.4 Nano',
    tokenLimit: 400000,
    enabled: true,
  },
  [OpenAIModelID.GPT_5_3_chat_latest]: {
    id: OpenAIModelID.GPT_5_3_chat_latest,
    name: 'GPT-5.3 Chat',
    tokenLimit: 128000,
    enabled: true,
  },
  [OpenAIModelID.GPT_5_2]: {
    id: OpenAIModelID.GPT_5_2,
    name: 'GPT-5.2',
    tokenLimit: 400000,
    enabled: true,
  },
  [OpenAIModelID.GPT_5_2_codex]: {
    id: OpenAIModelID.GPT_5_2_codex,
    name: 'GPT-5.2 Codex',
    tokenLimit: 400000,
    enabled: true,
  },
  [OpenAIModelID.GPT_5_1]: {
    id: OpenAIModelID.GPT_5_1,
    name: 'GPT-5.1',
    tokenLimit: 400000,
    enabled: true,
  },
  [OpenAIModelID.GPT_5_1_chat_latest]: {
    id: OpenAIModelID.GPT_5_1_chat_latest,
    name: 'GPT-5.1 Chat',
    tokenLimit: 128000,
    enabled: true,
  },
  [OpenAIModelID.GPT_5_1_codex]: {
    id: OpenAIModelID.GPT_5_1_codex,
    name: 'GPT-5.1 Codex',
    tokenLimit: 400000,
    enabled: true,
  },
  [OpenAIModelID.GPT_5_1_codex_mini]: {
    id: OpenAIModelID.GPT_5_1_codex_mini,
    name: 'GPT-5.1 Codex Mini',
    tokenLimit: 400000,
    enabled: true,
  },
  [OpenAIModelID.GPT_5]: {
    id: OpenAIModelID.GPT_5,
    name: 'GPT-5',
    tokenLimit: 400000,
    enabled: true,
  },
  [OpenAIModelID.GPT_5_mini]: {
    id: OpenAIModelID.GPT_5_mini,
    name: 'GPT-5 Mini',
    tokenLimit: 400000,
    enabled: true,
  },
  [OpenAIModelID.GPT_5_nano]: {
    id: OpenAIModelID.GPT_5_nano,
    name: 'GPT-5 Nano',
    tokenLimit: 400000,
    enabled: true,
  },
  [OpenAIModelID.GPT_5_thinking]: {
    id: OpenAIModelID.GPT_5_thinking,
    name: 'GPT-5 Thinking',
    tokenLimit: 400000,
    enabled: true,
  },
}
