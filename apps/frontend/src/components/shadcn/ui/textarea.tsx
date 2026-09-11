import * as React from 'react'

import { cn } from '@/components/shadcn/lib/utils'

function Textarea({ className, ...props }: React.ComponentProps<'textarea'>) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        'flex min-h-16 w-full rounded-md border border-input bg-transparent px-2.5 py-2 text-base shadow-sm outline-none transition-[color,box-shadow] placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-[invalid]:border-destructive aria-[invalid]:ring-[3px] aria-[invalid]:ring-destructive/20 dark:bg-input/30 dark:aria-[invalid]:border-destructive/50 dark:aria-[invalid]:ring-destructive/40 md:text-sm',
        className,
      )}
      {...props}
    />
  )
}

export { Textarea }
