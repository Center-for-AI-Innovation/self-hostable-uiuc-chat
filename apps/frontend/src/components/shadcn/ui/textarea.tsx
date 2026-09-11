import * as React from 'react'

import { cn } from '@/components/shadcn/lib/utils'

function Textarea({ className, ...props }: React.ComponentProps<'textarea'>) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        'border-input placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 aria-[invalid]:border-destructive aria-[invalid]:ring-destructive/20 dark:bg-input/30 dark:aria-[invalid]:border-destructive/50 dark:aria-[invalid]:ring-destructive/40 flex min-h-16 w-full rounded-md border bg-transparent px-2.5 py-2 text-base shadow-xs outline-hidden transition-[color,box-shadow] focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50 aria-[invalid]:ring-[3px] md:text-sm',
        className,
      )}
      {...props}
    />
  )
}

export { Textarea }
