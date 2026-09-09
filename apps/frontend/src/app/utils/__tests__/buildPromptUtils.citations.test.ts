import { describe, expect, it, vi } from 'vitest'

import {
  CITATION_DISABLED_PROMPT,
  CITATION_GUIDELINES_PROMPT,
} from '~/utils/app/const'
import type { Conversation } from '~/types/chat'
import type { CourseMetadata } from '~/types/courseMetadata'

vi.mock('~/pages/api/conversation', () => ({
  persistMessageServer: vi.fn(async () => undefined),
}))

vi.mock('~/pages/api/UIUC-api/getCourseMetadata', () => ({
  getCourseMetadata: vi.fn(async () => undefined),
}))

const { buildPrompt } = await import('../buildPromptUtils')

function makeConversation(): Conversation {
  return {
    id: 'conversation-1',
    name: 'TestProject',
    messages: [
      {
        id: 'message-1',
        role: 'user',
        content: 'What is the late submission policy?',
      },
    ],
    model: {
      id: 'test-model',
      name: 'Test Model',
      tokenLimit: 8000,
      enabled: true,
    },
    prompt: '',
    temperature: 0.7,
    folderId: null,
    userEmail: 'student@illinois.edu',
  } as unknown as Conversation
}

function makeCourseMetadata(
  overrides: Partial<CourseMetadata> = {},
): CourseMetadata {
  return {
    is_private: false,
    course_owner: 'owner@illinois.edu',
    course_admins: [],
    approved_emails_list: [],
    example_questions: [],
    course_intro_message: '',
    system_prompt: 'You are a helpful assistant.',
    documentsOnly: false,
    guidedLearning: false,
    systemPromptOnly: false,
    disableCitations: false,
    ...overrides,
  } as unknown as CourseMetadata
}

function occurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1
}

async function buildSystemPrompt(courseMetadata: CourseMetadata) {
  const conversation = makeConversation()
  const built = await buildPrompt({
    conversation,
    projectName: 'TestProject',
    courseMetadata,
  })
  return built.messages[built.messages.length - 1]!.latestSystemMessage ?? ''
}

describe('buildPrompt citation instructions', () => {
  it('appends the disabled-citation instructions from disableCitations alone', async () => {
    const systemPrompt = await buildSystemPrompt(
      makeCourseMetadata({ disableCitations: true }),
    )

    expect(occurrences(systemPrompt, CITATION_DISABLED_PROMPT.trim())).toBe(1)
    expect(systemPrompt).not.toContain(CITATION_GUIDELINES_PROMPT.trim())
  })

  it('appends the citation guidelines when disableCitations is off', async () => {
    const systemPrompt = await buildSystemPrompt(
      makeCourseMetadata({ disableCitations: false }),
    )

    expect(occurrences(systemPrompt, CITATION_GUIDELINES_PROMPT.trim())).toBe(1)
    expect(systemPrompt).not.toContain(CITATION_DISABLED_PROMPT.trim())
  })

  it('does not double up when the stored prompt already carries the block', async () => {
    const systemPrompt = await buildSystemPrompt(
      makeCourseMetadata({
        disableCitations: true,
        system_prompt: `You are a helpful assistant.${CITATION_DISABLED_PROMPT}`,
      }),
    )

    // The prompt editor writes the block into the saved prompt so admins can
    // see it; the builder must not append a second copy. See issue #192.
    expect(occurrences(systemPrompt, CITATION_DISABLED_PROMPT.trim())).toBe(1)
  })

  it('does not double up the guidelines block either', async () => {
    const systemPrompt = await buildSystemPrompt(
      makeCourseMetadata({
        disableCitations: false,
        system_prompt: `You are a helpful assistant.${CITATION_GUIDELINES_PROMPT}`,
      }),
    )

    expect(occurrences(systemPrompt, CITATION_GUIDELINES_PROMPT.trim())).toBe(1)
    expect(systemPrompt).not.toContain(CITATION_DISABLED_PROMPT.trim())
  })

  it('still applies disableCitations in systemPromptOnly (raw prompt) mode', async () => {
    const systemPrompt = await buildSystemPrompt(
      makeCourseMetadata({ disableCitations: true, systemPromptOnly: true }),
    )

    // joinPromptSections trims each section, so match on the trimmed block.
    expect(occurrences(systemPrompt, CITATION_DISABLED_PROMPT.trim())).toBe(1)
    expect(systemPrompt).not.toContain(CITATION_GUIDELINES_PROMPT.trim())
  })
})
