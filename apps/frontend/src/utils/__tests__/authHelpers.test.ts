import { describe, expect, it, vi } from 'vitest'
import {
  getKeycloakBaseFromHost,
  getKeycloakBaseUrl,
  getKeycloakIssuerUrl,
  initiateSignIn,
} from '../authHelpers'

function decodeBase64Url(input: string) {
  const normalized = input.replace(/-/g, '+').replace(/_/g, '/')
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4)
  return atob(padded)
}

describe('initiateSignIn', () => {
  it('passes URL-safe base64 state to signinRedirect', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(1234))

    const auth = { signinRedirect: vi.fn().mockResolvedValue('ok') }
    initiateSignIn(auth, '/course/CS101')

    expect(auth.signinRedirect).toHaveBeenCalledTimes(1)
    const state = auth.signinRedirect.mock.calls[0]?.[0]?.state as string
    expect(state).toBeTruthy()
    expect(state).not.toMatch(/[+/=]/)

    const decoded = JSON.parse(decodeBase64Url(state))
    expect(decoded.redirect).toBe('/course/CS101')
    expect(decoded.timestamp).toBe(1234)

    vi.useRealTimers()
  })
})

describe('keycloak base URL helpers', () => {
  it('getKeycloakBaseFromHost handles common hostnames', () => {
    expect(getKeycloakBaseFromHost('localhost')).toBe('http://localhost:8080/')
    expect(getKeycloakBaseFromHost('uiuc.chat')).toBe(
      'https://login.uiuc.chat/',
    )
    expect(getKeycloakBaseFromHost('example.com')).toBe(
      'https://example.com/keycloak/',
    )
  })

  it('getKeycloakBaseFromHost prefers KEYCLOAK_URL when set', () => {
    vi.stubEnv('KEYCLOAK_URL', 'http://keycloak:8080/')
    vi.stubEnv('NEXT_PUBLIC_KEYCLOAK_URL', 'https://override.example/')
    expect(getKeycloakBaseFromHost('example.com')).toBe('http://keycloak:8080/')
    vi.stubEnv('KEYCLOAK_URL', '')
    vi.stubEnv('NEXT_PUBLIC_KEYCLOAK_URL', '')
  })

  it('getKeycloakBaseFromHost falls back to NEXT_PUBLIC_KEYCLOAK_URL', () => {
    vi.stubEnv('KEYCLOAK_URL', '')
    vi.stubEnv('NEXT_PUBLIC_KEYCLOAK_URL', 'https://override.example/')
    expect(getKeycloakBaseFromHost('example.com')).toBe(
      'https://override.example/',
    )
    vi.stubEnv('NEXT_PUBLIC_KEYCLOAK_URL', '')
  })

  it('getKeycloakBaseUrl prefers NEXT_PUBLIC_KEYCLOAK_URL when set', () => {
    vi.stubEnv('NEXT_PUBLIC_KEYCLOAK_URL', 'https://override.example/')
    expect(getKeycloakBaseUrl()).toBe('https://override.example/')
  })

  it('getKeycloakIssuerUrl uses the public issuer URL', () => {
    vi.stubEnv('KEYCLOAK_URL', 'http://keycloak:8080/')
    vi.stubEnv('NEXT_PUBLIC_KEYCLOAK_URL', '')
    expect(getKeycloakIssuerUrl('localhost')).toBe(
      'http://localhost:8080/realms/illinois_chat_realm',
    )
    vi.stubEnv('KEYCLOAK_URL', '')
  })

  it('getKeycloakIssuerUrl prefers NEXT_PUBLIC_KEYCLOAK_URL when set', () => {
    vi.stubEnv('KEYCLOAK_URL', '')
    vi.stubEnv('NEXT_PUBLIC_KEYCLOAK_URL', 'https://override.example/')
    expect(getKeycloakIssuerUrl('example.com')).toBe(
      'https://override.example/realms/illinois_chat_realm',
    )
    vi.stubEnv('NEXT_PUBLIC_KEYCLOAK_URL', '')
  })

  it('getKeycloakIssuerUrl handles known and custom hostnames', () => {
    vi.stubEnv('KEYCLOAK_URL', '')
    vi.stubEnv('NEXT_PUBLIC_KEYCLOAK_URL', '')
    expect(getKeycloakIssuerUrl('uiuc.chat')).toBe(
      'https://login.uiuc.chat/realms/illinois_chat_realm',
    )
    expect(getKeycloakIssuerUrl('example.com')).toBe(
      'https://example.com/keycloak/realms/illinois_chat_realm',
    )
  })
})
