import { type ReactNode } from 'react'
import { toast } from 'sonner'

export type ToastType = 'success' | 'error' | 'warning' | 'info'

interface ToastOptions {
  title?: string
  message: string
  type?: ToastType
  autoClose?: number
  icon?: ReactNode
}

// Default auto-close durations per type, preserved from the previous
// @mantine/notifications behavior. Sonner's <Toaster> (mounted in _app)
// supplies the per-type icons + theming, so we no longer pass those here.
const DEFAULT_AUTO_CLOSE: Record<ToastType, number> = {
  success: 5000,
  error: 8000,
  warning: 6000,
  info: 5000,
}

export const showToast = ({
  title,
  message,
  type = 'info',
  autoClose,
  icon,
}: ToastOptions) => {
  const duration = autoClose ?? DEFAULT_AUTO_CLOSE[type]

  // Mantine had a bold `title` heading + `message` body. Sonner uses the first
  // argument as the heading and `description` as the body, so when a title is
  // provided it becomes the heading and the message becomes the description.
  const heading = title ?? message
  const description = title ? message : undefined

  toast[type](heading, {
    description,
    duration,
    ...(icon ? { icon } : {}),
  })
}

// Convenience functions for common use cases
export const showSuccessToast = (message: string, title?: string) => {
  showToast({ message, title, type: 'success' })
}

export const showErrorToast = (message: string, title?: string) => {
  showToast({ message, title, type: 'error' })
}

export const showWarningToast = (message: string, title?: string) => {
  showToast({ message, title, type: 'warning' })
}

export const showInfoToast = (message: string, title?: string) => {
  showToast({ message, title, type: 'info' })
}
