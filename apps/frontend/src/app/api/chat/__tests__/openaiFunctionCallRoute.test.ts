import { beforeEach, describe, expect, it, vi } from 'vitest'

const hoisted = vi.hoisted(() => {
  return {
    persistMessageServer: vi.fn(async () => undefined),
    resolveToolRouter: vi.fn(),
    callToolRouter: vi.fn(),
  }
})

vi.mock('~/app/api/authorization', () => ({
  withCourseAccessFromRequest: () => (h: any) => h,
}))

vi.mock('~/pages/api/conversation', () => ({
  persistMessageServer: hoisted.persistMessageServer,
}))

vi.mock('~/utils/server/toolRouting', () => ({
  resolveToolRouter: hoisted.resolveToolRouter,
  callToolRouter: hoisted.callToolRouter,
}))

import { POST } from '../openaiFunctionCall/route'

const OPENAI_ROUTER = {
  source: 'custom',
  provider: 'OpenAI',
  endpointUrl: 'https://api.openai.com/v1/chat/completions',
  apiKey: 'sk-decrypted',
  modelId: 'gpt-4.1',
}

const baseConversation = (): any => ({
  prompt: 'p',
  projectName: 'CS101',
  userEmail: 'u@example.com',
  model: { id: 'Qwen/Qwen3.6-27B' },
  messages: [{ id: 'm1', role: 'user', content: 'hi' }],
})

describe('app/api/chat/openaiFunctionCall POST', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    hoisted.resolveToolRouter.mockResolvedValue(OPENAI_ROUTER)
  })

  it('returns 400 when conversation has no last message', async () => {
    const req = new Request('http://localhost', {
      method: 'POST',
      body: JSON.stringify({ conversation: { messages: [] }, tools: [] }),
    })
    const res = await POST(req as any)
    expect(res.status).toBe(400)
  })

  it('returns 503 when the router is offline', async () => {
    hoisted.resolveToolRouter.mockResolvedValue({
      source: 'offline',
      reason: 'nothing configured',
    })

    const req = new Request('http://localhost', {
      method: 'POST',
      body: JSON.stringify({ conversation: baseConversation(), tools: [] }),
    })
    const res = await POST(req as any)
    expect(res.status).toBe(503)
    const body = await res.json()
    expect(body.error).toContain('nothing configured')
    expect(hoisted.callToolRouter).not.toHaveBeenCalled()
  })

  it('resolves the router from course_name, client key, and selected model', async () => {
    hoisted.callToolRouter.mockResolvedValue({
      ok: true,
      toolCalls: [],
      content: 'no tools needed',
    })

    const req = new Request('http://localhost', {
      method: 'POST',
      body: JSON.stringify({
        conversation: baseConversation(),
        tools: [],
        course_name: 'CS101',
        openaiKey: 'v1.enc.iv',
      }),
    })
    const res = await POST(req as any)
    expect(res.status).toBe(200)
    expect(hoisted.resolveToolRouter).toHaveBeenCalledWith({
      projectName: 'CS101',
      clientOpenAIKey: 'v1.enc.iv',
      selectedModelId: 'Qwen/Qwen3.6-27B',
    })
    const body = await res.json()
    expect(body.choices?.[0]?.message?.content).toBe('no tools needed')
  })

  it('ignores legacy provider fields from old clients', async () => {
    hoisted.callToolRouter.mockResolvedValue({
      ok: true,
      toolCalls: [],
      content: '',
    })

    const req = new Request('http://localhost', {
      method: 'POST',
      body: JSON.stringify({
        conversation: baseConversation(),
        tools: [],
        providerBaseUrl: 'https://evil.example.com/v1',
        apiKey: 'attacker-supplied',
        modelId: 'whatever',
      }),
    })
    const res = await POST(req as any)
    expect(res.status).toBe(200)
    // The router is resolved from server-side config only.
    expect(hoisted.resolveToolRouter).toHaveBeenCalledWith({
      projectName: 'CS101',
      clientOpenAIKey: undefined,
      selectedModelId: 'Qwen/Qwen3.6-27B',
    })
    expect(hoisted.callToolRouter).toHaveBeenCalledWith(
      expect.objectContaining({ router: OPENAI_ROUTER }),
    )
  })

  it('passes through the router error status when the call fails', async () => {
    hoisted.callToolRouter.mockResolvedValue({
      ok: false,
      error: 'Tool router error: 502',
      status: 502,
    })

    const req = new Request('http://localhost', {
      method: 'POST',
      body: JSON.stringify({
        conversation: baseConversation(),
        tools: [],
        openaiKey: 'sk-real',
      }),
    })
    const res = await POST(req as any)
    expect(res.status).toBe(502)
  })

  it('returns 500 when the resolver throws (e.g. Redis down)', async () => {
    hoisted.resolveToolRouter.mockRejectedValue(new Error('redis down'))

    const req = new Request('http://localhost', {
      method: 'POST',
      body: JSON.stringify({ conversation: baseConversation(), tools: [] }),
    })
    const res = await POST(req as any)
    expect(res.status).toBe(500)
  })

  it('formats image_url parts and appends image info for array message content', async () => {
    hoisted.callToolRouter.mockResolvedValue({
      ok: true,
      toolCalls: [],
      content: 'ok',
    })

    const conversation: any = {
      ...baseConversation(),
      messages: [
        {
          id: 'm1',
          role: 'user',
          content: [
            { type: 'text', text: 'hello' },
            { type: 'image_url', image_url: { url: 'http://img' } },
          ],
        },
      ],
    }

    const req = new Request('http://localhost', {
      method: 'POST',
      body: JSON.stringify({
        conversation,
        tools: [],
        imageUrls: ['http://img'],
        imageDescription: 'desc',
        openaiKey: 'sk-real',
      }),
    })
    const res = await POST(req as any)
    expect(res.status).toBe(200)

    const call = hoisted.callToolRouter.mock.calls[0]?.[0]
    const last = call.messages[call.messages.length - 1]
    expect(Array.isArray(last.content)).toBe(true)
    expect(JSON.stringify(last.content)).toContain('image_url')
    expect(JSON.stringify(last.content)).toContain('Image URL(s):')
  })

  it('returns tool_calls JSON and persists message when tool calls exist', async () => {
    hoisted.callToolRouter.mockResolvedValue({
      ok: true,
      toolCalls: [{ id: 'call1', function: { name: 't', arguments: '{}' } }],
      content: '',
    })

    const req = new Request('http://localhost', {
      method: 'POST',
      body: JSON.stringify({
        conversation: baseConversation(),
        tools: [],
        openaiKey: 'sk-real',
      }),
    })
    const res = await POST(req as any)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.choices?.[0]?.message?.tool_calls?.[0]?.id).toBe('call1')
    expect(hoisted.persistMessageServer).toHaveBeenCalled()
  })
})
