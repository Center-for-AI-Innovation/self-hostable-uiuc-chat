import { cn } from '@/components/shadcn/lib/utils'

function AspectRatio({
  ratio,
  className,
  ...props
}: React.ComponentProps<'div'> & { ratio: number }) {
  return (
    <div
      data-slot="aspect-ratio"
      style={
        {
          '--ratio': ratio,
        } as React.CSSProperties
      }
      className={cn('relative aspect-[var(--ratio)]', className)}
      {...props}
    />
  )
}

export { AspectRatio }
