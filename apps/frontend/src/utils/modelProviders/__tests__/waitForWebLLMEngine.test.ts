import { describe, expect, it, vi } from 'vitest'

import { waitForWebLLMEngine } from '../waitForWebLLMEngine'

const makeEngine = (loading: boolean[] = []) => {
  const states = [...loading]
  return {
    isModelLoading: vi.fn(() => states.shift() ?? false),
  }
}

describe('waitForWebLLMEngine', () => {
  it('returns an engine that is already available and idle', async () => {
    const engine = makeEngine()
    await expect(
      waitForWebLLMEngine(() => engine, { engineTimeoutMs: 50, pollMs: 1 }),
    ).resolves.toBe(engine)
  })

  it('waits for the engine to appear (the dynamic-import window)', async () => {
    const engine = makeEngine()
    let current: typeof engine | null = null
    setTimeout(() => {
      current = engine
    }, 20)
    await expect(
      waitForWebLLMEngine(() => current, { engineTimeoutMs: 5000, pollMs: 1 }),
    ).resolves.toBe(engine)
  })

  it('keeps waiting while the model is loading, then returns the engine', async () => {
    const engine = makeEngine([true, true, true])
    const result = await waitForWebLLMEngine(() => engine, {
      engineTimeoutMs: 50,
      pollMs: 1,
    })
    expect(result).toBe(engine)
    // Polled through the loading states before returning.
    expect(engine.isModelLoading).toHaveBeenCalledTimes(4)
  })

  it('returns null when the engine never appears within the timeout', async () => {
    await expect(
      waitForWebLLMEngine(() => null, { engineTimeoutMs: 30, pollMs: 1 }),
    ).resolves.toBeNull()
  })
})
