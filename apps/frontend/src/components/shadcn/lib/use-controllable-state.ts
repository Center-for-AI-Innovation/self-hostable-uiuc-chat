import * as React from 'react'

// Local replacement for @radix-ui/react-use-controllable-state, kept during the
// Base UI migration so no @radix-ui/* dependency remains. Same API/behavior:
// useControllableState({ prop, defaultProp, onChange }) => [value, setValue].

type UseControllableStateParams<T> = {
  prop?: T | undefined
  defaultProp?: T | undefined
  onChange?: (state: T) => void
}

type SetStateFn<T> = (prevState?: T) => T

function useCallbackRef<T extends (...args: never[]) => unknown>(
  callback: T | undefined,
): T {
  const callbackRef = React.useRef(callback)
  React.useEffect(() => {
    callbackRef.current = callback
  })
  return React.useMemo(
    () => ((...args) => callbackRef.current?.(...args)) as T,
    [],
  )
}

function useUncontrolledState<T>({
  defaultProp,
  onChange,
}: Omit<UseControllableStateParams<T>, 'prop'>) {
  const uncontrolledState = React.useState<T | undefined>(defaultProp)
  const [value] = uncontrolledState
  const prevValueRef = React.useRef(value)
  const handleChange = useCallbackRef(onChange)

  React.useEffect(() => {
    if (prevValueRef.current !== value) {
      handleChange(value as T)
      prevValueRef.current = value
    }
  }, [value, prevValueRef, handleChange])

  return uncontrolledState
}

function useControllableState<T>({
  prop,
  defaultProp,
  onChange = () => {},
}: UseControllableStateParams<T>) {
  const [uncontrolledProp, setUncontrolledProp] = useUncontrolledState({
    defaultProp,
    onChange,
  })
  const isControlled = prop !== undefined
  const value = isControlled ? prop : uncontrolledProp
  const handleChange = useCallbackRef(onChange)

  const setValue: React.Dispatch<React.SetStateAction<T | undefined>> =
    React.useCallback(
      (nextValue) => {
        if (isControlled) {
          const setter = nextValue as SetStateFn<T>
          const next =
            typeof nextValue === 'function' ? setter(prop) : nextValue
          if (next !== prop) handleChange(next as T)
        } else {
          setUncontrolledProp(nextValue)
        }
      },
      [isControlled, prop, setUncontrolledProp, handleChange],
    )

  return [value, setValue] as const
}

export { useControllableState }
