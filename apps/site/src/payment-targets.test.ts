import { describe, expect, it } from 'vitest'
import { paymentTargets } from './payment-targets'

describe('paymentTargets', () => {
  it('reads payto tags with wallet links only where a scheme exists and the address is plain', () => {
    const targets = paymentTargets({
      tags: [
        ['payto', 'Bitcoin', 'bc1qxq66e0t8d7ugdecwnmv58e90tpry23nc84pg9k'],
        ['payto', 'silent payments', 'sp1qqexample'],
        ['payto', 'XMR', '4AdUndXHHZ6cfufTMvppY6JwXNouMBzSkbLYfpAV5Usx'],
        ['payto', 'monero', '4AdUndXHHZ6cfufTMvppY6JwXNouMBzSkbLYfpAV5Usx'],
        ['payto', 'nano', 'nano_1dctqbmq'],
        ['payto', 'bitcoin', 'bc1q?amount=21'],
        ['p', 'ignored'],
        ['payto', 'bitcoin', '  '],
        ['payto', 'bitcoin', 'bc1qxq66e0t8d7ugdecwnmv58e90tpry23nc84pg9k'],
      ],
    })
    expect(targets).toEqual([
      {
        type: 'bitcoin',
        address: 'bc1qxq66e0t8d7ugdecwnmv58e90tpry23nc84pg9k',
        uri: 'bitcoin:bc1qxq66e0t8d7ugdecwnmv58e90tpry23nc84pg9k',
      },
      { type: 'bip352', address: 'sp1qqexample', uri: 'bitcoin:?sp=sp1qqexample' },
      {
        type: 'monero',
        address: '4AdUndXHHZ6cfufTMvppY6JwXNouMBzSkbLYfpAV5Usx',
        uri: 'monero:4AdUndXHHZ6cfufTMvppY6JwXNouMBzSkbLYfpAV5Usx',
      },
      // No URI scheme: copy only.
      { type: 'nano', address: 'nano_1dctqbmq', uri: undefined },
      // Not a plain address: shown, but never turned into a link with extra parameters.
      { type: 'bitcoin', address: 'bc1q?amount=21', uri: undefined },
    ])
  })
})
