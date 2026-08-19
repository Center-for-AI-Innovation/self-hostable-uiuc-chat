/**
 * Wait for the lazily-imported WebLLM engine to become available, then for any
 * in-flight model load to finish.
 *
 * `ChatUI` is constructed only after the dynamic `import('@mlc-ai/web-llm')`
 * resolves, so callers that fire during the import window would otherwise see
 * `null` — and an optional-chained wait loop (`chat_ui?.isModelLoading()`)
 * exits immediately on `null`, letting `runChatCompletion` return `undefined`.
 *
 * The engine is read through a getter (not a captured variable) because the
 * caller's closure may hold a stale `null` from the render that created it.
 *
 * The wait for the engine itself is bounded (the import either resolves in
 * well under `engineTimeoutMs` or has failed outright); the wait for model
 * loading is unbounded, matching the previous behavior — model downloads can
 * legitimately take minutes.
 */
export async function waitForWebLLMEngine<
  T extends { isModelLoading: () => boolean },
>(
  getEngine: () => T | null,
  {
    engineTimeoutMs = 15_000,
    pollMs = 10,
  }: { engineTimeoutMs?: number; pollMs?: number } = {},
): Promise<T | null> {
  const deadline = Date.now() + engineTimeoutMs
  while (getEngine() === null) {
    if (Date.now() >= deadline) return null
    await new Promise((resolve) => setTimeout(resolve, pollMs))
  }
  const engine = getEngine() as T
  while (engine.isModelLoading()) {
    await new Promise((resolve) => setTimeout(resolve, pollMs))
  }
  return engine
}
