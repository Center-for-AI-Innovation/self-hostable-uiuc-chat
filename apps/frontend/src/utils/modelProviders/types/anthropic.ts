export interface AnthropicModel {
  id: string
  name: string
  tokenLimit: number
  enabled: boolean
  default?: boolean
  temperature?: number
  extendedThinking?: boolean
}

/** Model ids per https://docs.claude.com/en/docs/about-claude/models/overview */
export enum AnthropicModelID {
  Claude_3_7_Sonnet = 'claude-3-7-sonnet-latest',
  Claude_3_7_Sonnet_Thinking = 'claude-3-7-sonnet-latest-thinking',

  // Claude 4.6 / Haiku 4.5 (current flagship tier, dateless where documented)
  Claude_Sonnet_4_6 = 'claude-sonnet-4-6',
  Claude_Sonnet_4_6_Thinking = 'claude-sonnet-4-6-thinking',
  Claude_Opus_4_6 = 'claude-opus-4-6',
  Claude_Opus_4_6_Thinking = 'claude-opus-4-6-thinking',
  Claude_Haiku_4_5 = 'claude-haiku-4-5',
  Claude_Haiku_4_5_Thinking = 'claude-haiku-4-5-thinking',

  // Claude 4.5 (aliases resolve to dated snapshots; still available per docs)
  Claude_Sonnet_4_5 = 'claude-sonnet-4-5',
  Claude_Sonnet_4_5_Thinking = 'claude-sonnet-4-5-thinking',
  Claude_Opus_4_5 = 'claude-opus-4-5',
  Claude_Opus_4_5_Thinking = 'claude-opus-4-5-thinking',

  // Claude 4.0 snapshots (deprecated 2026-06-15; keep for migration only)
  Claude_Sonnet_4 = 'claude-sonnet-4-20250514',
  Claude_Sonnet_4_Thinking = 'claude-sonnet-4-20250514-thinking',
  Claude_Opus_4 = 'claude-opus-4-20250514',
  Claude_Opus_4_Thinking = 'claude-opus-4-20250514-thinking',

  Claude_Opus_4_1 = 'claude-opus-4-1-20250805',
  Claude_Opus_4_1_Thinking = 'claude-opus-4-1-20250805-thinking',
}

// hardcoded anthropic models
export const AnthropicModels: Record<string, AnthropicModel> = {
  [AnthropicModelID.Claude_3_7_Sonnet]: {
    id: AnthropicModelID.Claude_3_7_Sonnet,
    name: 'Claude 3.7 Sonnet',
    tokenLimit: 200000,
    enabled: true,
  },
  [AnthropicModelID.Claude_3_7_Sonnet_Thinking]: {
    id: AnthropicModelID.Claude_3_7_Sonnet_Thinking,
    name: 'Claude 3.7 Sonnet with Extended Thinking',
    tokenLimit: 200000,
    enabled: true,
    extendedThinking: true,
  },

  [AnthropicModelID.Claude_Sonnet_4_6]: {
    id: AnthropicModelID.Claude_Sonnet_4_6,
    name: 'Claude Sonnet 4.6',
    tokenLimit: 1_048_576,
    enabled: true,
  },
  [AnthropicModelID.Claude_Sonnet_4_6_Thinking]: {
    id: AnthropicModelID.Claude_Sonnet_4_6_Thinking,
    name: 'Claude Sonnet 4.6 with Extended Thinking',
    tokenLimit: 1_048_576,
    enabled: true,
    extendedThinking: true,
  },
  [AnthropicModelID.Claude_Opus_4_6]: {
    id: AnthropicModelID.Claude_Opus_4_6,
    name: 'Claude Opus 4.6',
    tokenLimit: 1_048_576,
    enabled: false,
  },
  [AnthropicModelID.Claude_Opus_4_6_Thinking]: {
    id: AnthropicModelID.Claude_Opus_4_6_Thinking,
    name: 'Claude Opus 4.6 with Extended Thinking',
    tokenLimit: 1_048_576,
    enabled: false,
    extendedThinking: true,
  },
  [AnthropicModelID.Claude_Haiku_4_5]: {
    id: AnthropicModelID.Claude_Haiku_4_5,
    name: 'Claude Haiku 4.5',
    tokenLimit: 200000,
    enabled: true,
  },
  [AnthropicModelID.Claude_Haiku_4_5_Thinking]: {
    id: AnthropicModelID.Claude_Haiku_4_5_Thinking,
    name: 'Claude Haiku 4.5 with Extended Thinking',
    tokenLimit: 200000,
    enabled: true,
    extendedThinking: true,
  },

  [AnthropicModelID.Claude_Sonnet_4_5]: {
    id: AnthropicModelID.Claude_Sonnet_4_5,
    name: 'Claude Sonnet 4.5',
    tokenLimit: 200000,
    enabled: false,
  },
  [AnthropicModelID.Claude_Sonnet_4_5_Thinking]: {
    id: AnthropicModelID.Claude_Sonnet_4_5_Thinking,
    name: 'Claude Sonnet 4.5 with Extended Thinking',
    tokenLimit: 200000,
    enabled: false,
    extendedThinking: true,
  },
  [AnthropicModelID.Claude_Opus_4_5]: {
    id: AnthropicModelID.Claude_Opus_4_5,
    name: 'Claude Opus 4.5',
    tokenLimit: 200000,
    enabled: false,
  },
  [AnthropicModelID.Claude_Opus_4_5_Thinking]: {
    id: AnthropicModelID.Claude_Opus_4_5_Thinking,
    name: 'Claude Opus 4.5 with Extended Thinking',
    tokenLimit: 200000,
    enabled: false,
    extendedThinking: true,
  },

  [AnthropicModelID.Claude_Sonnet_4]: {
    id: AnthropicModelID.Claude_Sonnet_4,
    name: 'Claude Sonnet 4 (deprecated June 2026)',
    tokenLimit: 200000,
    enabled: false,
  },
  [AnthropicModelID.Claude_Sonnet_4_Thinking]: {
    id: AnthropicModelID.Claude_Sonnet_4_Thinking,
    name: 'Claude Sonnet 4 with Extended Thinking (deprecated June 2026)',
    tokenLimit: 200000,
    enabled: false,
    extendedThinking: true,
  },
  [AnthropicModelID.Claude_Opus_4]: {
    id: AnthropicModelID.Claude_Opus_4,
    name: 'Claude Opus 4 (deprecated June 2026)',
    tokenLimit: 200000,
    enabled: false,
  },
  [AnthropicModelID.Claude_Opus_4_Thinking]: {
    id: AnthropicModelID.Claude_Opus_4_Thinking,
    name: 'Claude Opus 4 with Extended Thinking (deprecated June 2026)',
    tokenLimit: 200000,
    enabled: false,
    extendedThinking: true,
  },

  [AnthropicModelID.Claude_Opus_4_1]: {
    id: AnthropicModelID.Claude_Opus_4_1,
    name: 'Claude Opus 4.1',
    tokenLimit: 200000,
    enabled: false,
  },
  [AnthropicModelID.Claude_Opus_4_1_Thinking]: {
    id: AnthropicModelID.Claude_Opus_4_1_Thinking,
    name: 'Claude Opus 4.1 with Extended Thinking',
    tokenLimit: 200000,
    enabled: false,
    extendedThinking: true,
  },
}
