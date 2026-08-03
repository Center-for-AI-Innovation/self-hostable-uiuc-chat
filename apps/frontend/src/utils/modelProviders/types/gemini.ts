export interface GeminiModel {
  id: string
  name: string
  tokenLimit: number
  enabled: boolean
  default?: boolean
  temperature?: number
}

export enum GeminiModelID {
  Gemini_3_1_Pro_Preview = 'gemini-3.1-pro-preview',
  Gemini_3_Flash_Preview = 'gemini-3-flash-preview',
  Gemini_3_1_Flash_Lite = 'gemini-3.1-flash-lite',
  Gemini_Pro_Latest = 'gemini-pro-latest',
  Gemini_Flash_Latest = 'gemini-flash-latest',
  Gemini_Flash_Lite_Latest = 'gemini-flash-lite-latest',
  LearnLM_1_5_Pro = 'learnlm-1.5-pro-experimental',
}

// Sort models by preference
export const preferredGeminiModelIds = [
  GeminiModelID.Gemini_3_1_Pro_Preview,
  GeminiModelID.Gemini_Pro_Latest,
  GeminiModelID.Gemini_3_Flash_Preview,
  GeminiModelID.Gemini_Flash_Latest,
  GeminiModelID.Gemini_3_1_Flash_Lite,
  GeminiModelID.Gemini_Flash_Lite_Latest,
  GeminiModelID.LearnLM_1_5_Pro,
]

export const GeminiModels: Record<GeminiModelID, GeminiModel> = {
  [GeminiModelID.Gemini_3_1_Pro_Preview]: {
    id: GeminiModelID.Gemini_3_1_Pro_Preview,
    name: 'Gemini 3.1 Pro Preview',
    tokenLimit: 1_048_576,
    enabled: true,
  },
  [GeminiModelID.Gemini_3_Flash_Preview]: {
    id: GeminiModelID.Gemini_3_Flash_Preview,
    name: 'Gemini 3 Flash Preview',
    tokenLimit: 1_048_576,
    enabled: true,
  },
  [GeminiModelID.Gemini_3_1_Flash_Lite]: {
    id: GeminiModelID.Gemini_3_1_Flash_Lite,
    name: 'Gemini 3.1 Flash-Lite',
    tokenLimit: 1_048_576,
    enabled: true,
  },
  [GeminiModelID.Gemini_Pro_Latest]: {
    id: GeminiModelID.Gemini_Pro_Latest,
    name: 'Gemini Pro (latest alias)',
    tokenLimit: 1_048_576,
    enabled: true,
  },
  [GeminiModelID.Gemini_Flash_Latest]: {
    id: GeminiModelID.Gemini_Flash_Latest,
    name: 'Gemini Flash (latest alias)',
    tokenLimit: 1_048_576,
    enabled: true,
  },
  [GeminiModelID.Gemini_Flash_Lite_Latest]: {
    id: GeminiModelID.Gemini_Flash_Lite_Latest,
    name: 'Gemini Flash-Lite (latest alias)',
    tokenLimit: 1_048_576,
    enabled: true,
  },
  [GeminiModelID.LearnLM_1_5_Pro]: {
    id: GeminiModelID.LearnLM_1_5_Pro,
    name: 'LearnLM 1.5 Pro (This is a tutor model, for teaching and learning)',
    tokenLimit: 1_000_000, // Not sure of the token limit for this model
    enabled: true,
  },
}
