import * as React from 'react'

/**
 * Local replacement for Mantine's `useMediaQuery` (`@mantine/hooks`).
 * Returns `false` on the server and until mount — matching Mantine's default
 * `getInitialValueInEffect: true` behavior — then tracks the query live via
 * `matchMedia`. Unlike `use-mobile.tsx`'s `useIsMobile`, this takes an
 * arbitrary query string rather than a fixed 768px breakpoint.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = React.useState(false)

  React.useEffect(() => {
    const mql = window.matchMedia(query)
    const onChange = () => setMatches(mql.matches)
    onChange()
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [query])

  return matches
}
