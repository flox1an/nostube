import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { generateSecretKey, getPublicKey, verifyEvent } from 'nostr-tools'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { Login } from './Login'
import { installExtension, logOut } from './test-account'
import i18n from './i18n'

vi.mock('./accounts', async importOriginal => ({
  ...(await importOriginal<typeof import('./accounts')>()),
  loadAccounts: async () => ({ clientName: 'Studio (localhost)', relays: [] }),
}))

/** The server's login endpoints: `/admin/login` answers `password`, `/admin/login/nostr` 200. */
function serve(password: { redirected?: boolean; status?: number; retryAfter?: string }) {
  const fetch = vi.fn(async (url: string) =>
    url === '/admin/login'
      ? ({
          redirected: password.redirected ?? false,
          status: password.status ?? 200,
          headers: new Headers(password.retryAfter ? { 'Retry-After': password.retryAfter } : {}),
        } as Response)
      : new Response('ok')
  )
  vi.stubGlobal('fetch', fetch)
  return fetch
}

beforeEach(async () => {
  await i18n.changeLanguage('en')
})
afterEach(() => {
  logOut()
  vi.unstubAllGlobals()
})

const typePassword = () => {
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'secret' } })
  fireEvent.click(screen.getByRole('button', { name: 'Log in' }))
}

it('logs in with the password once the server redirects into the studio', async () => {
  const fetch = serve({ redirected: true })
  const onLoggedIn = vi.fn()
  render(<Login onLoggedIn={onLoggedIn} />)
  typePassword()
  await waitFor(() => expect(onLoggedIn).toHaveBeenCalled())
  const [, init] = fetch.mock.calls[0] as unknown as [string, RequestInit]
  expect(String(init.body)).toBe('password=secret')
})

it('says the password is wrong when the server answers its login page again', async () => {
  serve({})
  const onLoggedIn = vi.fn()
  render(<Login onLoggedIn={onLoggedIn} />)
  typePassword()
  expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Wrong password.')
  expect(onLoggedIn).not.toHaveBeenCalled()
})

it('names the wait while the server throttles wrong passwords', async () => {
  serve({ status: 429, retryAfter: '8' })
  render(<Login onLoggedIn={vi.fn()} />)
  typePassword()
  expect((await screen.findByRole('alert')).textContent).toMatch(/Try again in 8 s/)
})

it('logs in with a Nostr key from the login dialog through a NIP-98 event', async () => {
  const secret = generateSecretKey()
  installExtension(secret)
  const fetch = serve({})
  const onLoggedIn = vi.fn()
  render(<Login onLoggedIn={onLoggedIn} />)
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Log in with Nostr' })).toHaveProperty(
      'disabled',
      false
    )
  )
  fireEvent.click(screen.getByRole('button', { name: 'Log in with Nostr' }))
  const dialog = await screen.findByRole('dialog')
  fireEvent.click(await within(dialog).findByRole('button', { name: 'Login with Extension' }))
  await waitFor(() => expect(onLoggedIn).toHaveBeenCalled())
  const [url, init] = fetch.mock.calls[fetch.mock.calls.length - 1] as unknown as [
    string,
    RequestInit,
  ]
  expect(url).toBe('/admin/login/nostr')
  const auth = (init.headers as Record<string, string>).Authorization
  const event = JSON.parse(atob(auth.replace('Nostr ', '')))
  expect(verifyEvent(event)).toBe(true)
  expect(event).toMatchObject({ kind: 27235, pubkey: getPublicKey(secret) })
  expect(event.tags).toEqual([
    ['u', `${location.origin}/admin/login/nostr`],
    ['method', 'POST'],
  ])
})
