// React 19 + @types/react 19 removed the global `JSX` namespace; it now lives
// under `React.JSX`. This shim re-exposes the global namespace by delegating to
// React.JSX so that (a) our own code using `JSX.Element` still compiles and
// (b) dependencies that ship raw .ts source still referencing global `JSX`
// — notably react-markdown@8's lib/complex-types.ts, which skipLibCheck does
// not cover — continue to type-check. Remove once those deps are on React 19.
import type * as React from 'react'

declare global {
  namespace JSX {
    type ElementType = React.JSX.ElementType
    type Element = React.JSX.Element
    type ElementClass = React.JSX.ElementClass
    type ElementAttributesProperty = React.JSX.ElementAttributesProperty
    type ElementChildrenAttribute = React.JSX.ElementChildrenAttribute
    type LibraryManagedAttributes<C, P> = React.JSX.LibraryManagedAttributes<
      C,
      P
    >
    type IntrinsicAttributes = React.JSX.IntrinsicAttributes
    type IntrinsicClassAttributes<T> = React.JSX.IntrinsicClassAttributes<T>
    type IntrinsicElements = React.JSX.IntrinsicElements
  }
}
