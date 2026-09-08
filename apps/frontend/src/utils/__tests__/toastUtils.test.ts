import { describe, expect, it, vi } from 'vitest'

const makeToastMock = () => ({
  success: vi.fn(),
  error: vi.fn(),
  warning: vi.fn(),
  info: vi.fn(),
})

describe('toastUtils', () => {
  it('showToast maps the type to the matching sonner method with a default duration', async () => {
    const toast = makeToastMock()
    vi.doMock('sonner', () => ({ toast }))

    vi.resetModules()
    const { showToast } = await import('../toastUtils')

    showToast({ message: 'm', type: 'success' })
    expect(toast.success).toHaveBeenCalledWith(
      'm',
      expect.objectContaining({ duration: 5000, description: undefined }),
    )
  })

  it('uses title as heading + message as description, and allows overriding duration + icon', async () => {
    const toast = makeToastMock()
    vi.doMock('sonner', () => ({ toast }))

    vi.resetModules()
    const { showToast } = await import('../toastUtils')

    const customIcon = { type: 'icon' } as any
    showToast({
      title: 't',
      message: 'm',
      type: 'error',
      autoClose: 123,
      icon: customIcon,
    })
    expect(toast.error).toHaveBeenCalledWith(
      't',
      expect.objectContaining({
        description: 'm',
        duration: 123,
        icon: customIcon,
      }),
    )
  })

  it('convenience helpers call the correct sonner method', async () => {
    const toast = makeToastMock()
    vi.doMock('sonner', () => ({ toast }))

    vi.resetModules()
    const {
      showSuccessToast,
      showErrorToast,
      showWarningToast,
      showInfoToast,
    } = await import('../toastUtils')

    showSuccessToast('a')
    showErrorToast('b')
    showWarningToast('c')
    showInfoToast('d')

    expect(toast.success).toHaveBeenCalledWith('a', expect.any(Object))
    expect(toast.error).toHaveBeenCalledWith('b', expect.any(Object))
    expect(toast.warning).toHaveBeenCalledWith('c', expect.any(Object))
    expect(toast.info).toHaveBeenCalledWith('d', expect.any(Object))
  })
})
