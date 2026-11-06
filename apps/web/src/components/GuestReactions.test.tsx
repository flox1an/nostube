import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import { AuthDialog as SharedAuthDialog } from '@nostube/widgets/components/auth/AuthDialog'
import i18n from '@/i18n/config'
import { VideoReactionButtons } from './VideoReactionButtons'
import { ZapButton } from './ZapButton'
import { CommentReactions } from './CommentReactions'

const state = vi.hoisted(() => ({
  user: undefined as { pubkey: string } | undefined,
  publish: vi.fn().mockResolvedValue({}),
  zap: vi.fn().mockResolvedValue(true),
  generateInvoice: vi.fn(),
  add: vi.fn(),
}))

// The hoisted mock must load the real state helper after Vitest installs module mocks.
vi.mock('@/hooks', async () => ({
  ...(await vi.importActual('@/hooks/useDialogState')),
  useCurrentUser: () => ({ user: state.user }),
  useNostrPublish: () => ({ publish: state.publish, isPending: false }),
  useAppContext: () => ({ config: { relays: [] } }),
  useEventStats: () => ({ upvoteCount: 0, downvoteCount: 0, reactions: [], totalSats: 0 }),
  useEventZaps: () => ({ totalSats: 0 }),
  useUserReactionStatus: () => ({ hasUpvoted: false, hasDownvoted: false }),
  useProfile: () => ({}),
}))
vi.mock('@/hooks/useUserRelays', () => ({ useInteractionRelays: () => async () => [] }))
vi.mock('@/hooks/useEventStats', () => ({ isUpvoteReaction: () => false }))
vi.mock('applesauce-react/hooks', () => ({
  useEventStore: () => ({ getEvent: () => undefined, add: state.add }),
}))
vi.mock('@/hooks/useZap', () => ({
  useZap: () => ({
    zap: state.zap,
    generateInvoice: state.generateInvoice,
    isZapping: false,
    isConnected: true,
  }),
}))
vi.mock('@/contexts/WalletContext', () => ({
  useWalletContext: () => ({ defaultZapAmount: 21 }),
}))
vi.mock('@/hooks/useWallet', () => ({ useWallet: () => ({ defaultZapAmount: 21 }) }))
vi.mock('./ReactionsDialog', () => ({ ReactionsDialog: () => null }))
vi.mock('./ZapDialog', () => ({ ZapDialog: () => null }))
vi.mock('./auth/AuthDialog', () => ({
  AuthDialog: (props: Omit<React.ComponentProps<typeof SharedAuthDialog>, 'relays'>) => (
    <SharedAuthDialog {...props} relays={[]} />
  ),
}))
vi.mock('@nostube/widgets/components/auth/LoginDialog', () => ({
  default: ({ onLogin }: { onLogin: () => void }) => (
    <button
      onClick={() => {
        state.user = { pubkey: 'viewer' }
        onLogin()
      }}
    >
      Complete sign-in
    </button>
  ),
}))
vi.mock('@nostube/widgets/components/auth/SignupDialog', () => ({ default: () => null }))

const props = { eventId: 'video', authorPubkey: 'creator', kind: 1 }
const wrap = (node: React.ReactNode) => <I18nextProvider i18n={i18n}>{node}</I18nextProvider>

describe('guest reaction onboarding', () => {
  beforeEach(() => {
    state.user = undefined
    vi.clearAllMocks()
  })

  it.each(['inline', 'vertical'] as const)(
    'requires another deliberate upvote after signing in in the %s layout',
    async layout => {
      const { rerender } = render(wrap(<VideoReactionButtons {...props} layout={layout} />))
      fireEvent.click(screen.getByRole('button', { name: 'Sign in to upvote' }))
      expect(screen.getByRole('dialog')).toHaveTextContent('tap the thumbs-up again')
      expect(state.publish).not.toHaveBeenCalled()
      fireEvent.click(screen.getByRole('button', { name: 'Close' }))
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      fireEvent.click(screen.getByRole('button', { name: 'Sign in to downvote' }))
      expect(screen.getByRole('dialog')).toHaveTextContent('tap the thumbs-down again')
      fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
      fireEvent.click(screen.getByRole('button', { name: 'Complete sign-in' }))
      rerender(wrap(<VideoReactionButtons {...props} layout={layout} />))
      expect(state.publish).not.toHaveBeenCalled()
      fireEvent.click(screen.getByRole('button', { name: 'Upvote, 0 reactions' }))
      await waitFor(() =>
        expect(state.publish).toHaveBeenCalledWith(
          expect.objectContaining({ event: expect.objectContaining({ kind: 7, content: '+' }) })
        )
      )
    }
  )

  it.each(['inline', 'vertical'] as const)(
    'never queues a guest payment in the %s layout',
    layout => {
      const { rerender } = render(wrap(<ZapButton {...props} layout={layout} />))
      const zap = screen.getByRole('button', { name: i18n.t('auth.context.signInZap') })
      fireEvent.pointerDown(zap)
      fireEvent.pointerUp(zap)
      fireEvent.click(zap)
      expect(screen.getByRole('dialog')).toHaveTextContent('No payment is sent by signing in')
      expect(state.zap).not.toHaveBeenCalled()
      expect(state.generateInvoice).not.toHaveBeenCalled()
      fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
      fireEvent.click(screen.getByRole('button', { name: 'Complete sign-in' }))
      rerender(wrap(<ZapButton {...props} layout={layout} />))
      expect(state.zap).not.toHaveBeenCalled()
      fireEvent.click(screen.getByRole('button', { name: 'Support creator with a zap' }))
      expect(state.zap).toHaveBeenCalledTimes(1)
    }
  )

  it('gives guest comment reactions the same sign-in boundary', () => {
    render(wrap(<CommentReactions {...props} />))
    fireEvent.click(screen.getByRole('button', { name: 'Sign in to upvote' }))
    expect(screen.getByRole('dialog')).toHaveTextContent('tap the thumbs-up again')
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    fireEvent.click(screen.getByRole('button', { name: 'Sign in to support with a zap' }))
    expect(screen.getByRole('dialog')).toHaveTextContent('No payment is sent by signing in')
    expect(state.publish).not.toHaveBeenCalled()
    expect(state.zap).not.toHaveBeenCalled()
  })
})
