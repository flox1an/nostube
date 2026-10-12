import { generateEventLink } from '@nostube/core/video-event'
import { MP4_CONVERSION_VARIANT } from '@nostube/core/video-transcode'
import { runBrowserTranscodeJob } from '@nostube/core/browser-transcode-worker'
import i18n from '../i18n'
import { bootInstanceClient } from '../instance-client'
import { scheduleVideo } from '../api'
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
 * What the upload pipeline needs from the browser and the network, bound to the signer and the
 * expected creator key: every signature is checked against that key.
 */
export function makeUploadDeps({
  signer,
  pubkey,
  title,
  publishAt,
}: {
  signer: Signer
  pubkey: string
  title: string
  /** Unix seconds in the future: sign now, let the server publish then. */
  publishAt?: number
}): UploadDeps {
  return {
    probe: probeVideo,
    convert: async (file, source, onProgress, signal = new AbortController().signal) => {
      let failure: string | undefined
      const result = await runBrowserTranscodeJob(
        file,
        [MP4_CONVERSION_VARIANT],
        source,
        ({ progress }) => onProgress(progress, 1),
        (_, message) => (failure = message),
        signal
      ).catch((error: unknown) => {
        if (failure === undefined || signal.aborted) throw error
        throw new Error(i18n.t('studio.errors.conversionFailed', { reason: failure }))
      })
      // One MP4 variant: the worker answers with that one file.
      const [converted] = result as File[]
      return new File([converted], `${file.name.replace(/\.[^.]+$/, '')}.mp4`, {
        type: 'video/mp4',
      })
    },
    hash: (blob, onProgress, signal) => sha256File(blob, onProgress, signal),
    upload: ({ blob, name, type, sha256, onProgress, resumeFrom, onOffset, signal }) =>
      uploadBlob({
        file: blob,
        fileName: name,
        type,
        sha256,
        onProgress,
        resumeFrom,
        onOffset,
        signal,
        sign: template => signChecked(signer, template, pubkey),
      }),
    publish: async template => {
      const signed = await signChecked(signer, template, pubkey)
      if (publishAt) {
        await scheduleVideo(signed)
        return { eventId: signed.id, link: '', accepted: [], scheduledFor: publishAt }
      }
      const { config, client } = await bootInstanceClient()
      const identifier = template.tags.find(t => t[0] === 'd')?.[1] ?? ''
      const relays = config.videoSources
      const accepted = await publishChecked(client, relays, signed, 'studio.errors.noRelayAccepted')
      return {
        eventId: signed.id,
        link: generateEventLink(signed, identifier, relays.slice(0, 3)),
        accepted,
      }
    },
    newIdentifier: () => newIdentifier(title),
  }
}
