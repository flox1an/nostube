import { generateEventLink } from '@nostube/core/video-event'
import { bootInstanceClient } from '../instance-client'
import type { Signer } from '../signer'
import { uploadBlob } from './blossom-upload'
import { probeVideo } from './probe-video'
import type { UploadDeps } from './run-upload'
import { sha256File } from './sha256-file'
import { publishChecked, signChecked } from './sign'

const slug = (title: string) =>
  title
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40)

/** `my-clip-3f9a1c2b`: readable, and unique among the creator's videos. */
export const newIdentifier = (title: string) =>
  `${slug(title) || 'video'}-${crypto.randomUUID().slice(0, 8)}`

/**
 * What the upload pipeline needs from the browser and the network, bound to the signer and the key
 * that was just connected. Built per upload from the key `connect()` returned: the page's state
 * may not have caught up with it yet.
 */
export function makeUploadDeps({
  signer,
  pubkey,
  title,
}: {
  signer: Signer
  pubkey: string
  title: string
}): UploadDeps {
  return {
    probe: probeVideo,
    hash: (blob, onProgress) => sha256File(blob, onProgress),
    upload: ({ blob, name, type, sha256, onProgress, resumeFrom, onOffset }) =>
      uploadBlob({
        file: blob,
        fileName: name,
        type,
        sha256,
        onProgress,
        resumeFrom,
        onOffset,
        sign: template => signChecked(signer, template, pubkey),
      }),
    publish: async template => {
      const { config, client } = await bootInstanceClient()
      const signed = await signChecked(signer, template, pubkey)
      const relays = config.videoSources
      const accepted = await publishChecked(client, relays, signed, 'studio.errors.noRelayAccepted')
      const identifier = template.tags.find(t => t[0] === 'd')?.[1] ?? ''
      return {
        eventId: signed.id,
        link: generateEventLink(signed, identifier, relays.slice(0, 3)),
        accepted,
      }
    },
    newIdentifier: () => newIdentifier(title),
  }
}
