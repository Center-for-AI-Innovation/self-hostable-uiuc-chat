import React from 'react'
import { Spinner } from '@/components/shadcn/ui/spinner'

// The union is load-bearing: it turns a numeric size like "0.5rem" into a
// compile error rather than a silently-dropped class.
export type LoadingSpinnerSize = 'xs' | 'sm' | 'md' | 'lg'

// `loading-${size}` was a template literal, so Tailwind's scanner never saw it:
// only `loading-xs` reached the CSS, and sm/md/lg fell through to `.loading`'s
// 1.5rem default. This reproduces that. A real size scale is a follow-up.
export const LoadingSpinner = ({
  size = 'md',
}: {
  size?: LoadingSpinnerSize
}) => (
  <Spinner
    className={`${size === 'xs' ? 'size-4' : 'size-6'} text-[--spinner]`}
  />
)
