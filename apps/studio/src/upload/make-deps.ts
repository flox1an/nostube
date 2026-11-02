import { randomUUID } from '@nostube/core/random-uuid'
import { generateEventLink } from '@nostube/core/video-event'
import { MP4_CONVERSION_VARIANT } from '@nostube/core/video-transcode'
import { runBrowserTranscodeJob } from '@nostube/core/browser-transcode-worker'
import { updatePublication } from '@nostube/widgets/publication'
import type { EventTemplate } from 'nostr-tools'
import i18n from '../i18n'
import { bootInstanceClient } from '../instance-client'
import { loadAdmin, usesMirrorUrls, type AdminState } from '../api'
import { outboxTargets } from '../delivery'
import type { SignedEvent, Signer } from '../signer'
import { uploadBlob } from './blossom-upload'
import { probeVideo } from './probe-video'
import type { UploadDeps } from './run-upload'
import { sha256File } from './sha256-file'
import { publishChecked, scheduleSigned, signFor, signUploadAuth } from './sign'
import { mirrorMedia } from './mirror-media'

const slug = (title: string) =>
  title
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40)

/** `my-clip-3f9a1c2b`: readable, and unique among the creator's videos. */
export const newIdentifier = (title: string) =>
  `${slug(title) || 'video'}-${randomUUID().slice(0, 8)}`

/**
 * What the upload pipeline needs from the browser and the network, bound to the signer and the
 * expected creator key: every signature is checked against that key. Each step reports its phase
 * and real byte or file counts to `activity`.
 */
export function makeUploadDeps({
  signer,
  pubkey,
  title,
  publishAt,
  state,
  activity,
  onMirrorWait,
}: {
  signer: Signer
  pubkey: string
  title: string
  state?: AdminState
  /** The shared publication activity this run reports to. */
  activity: string
  onMirrorWait?: () => void
  /** Unix seconds in the future: sign now, let the server publish then. */
  publishAt?: number
}): UploadDeps {
  // A retry of the same template sends the same signed event (no second signer prompt).
  let signed: { template: EventTemplate; event: SignedEvent } | undefined
  return {
    probe: probeVideo,
    convert: async (file, source, onProgress, signal = new AbortController().signal) => {
      updatePublication(activity, {
        phase: 'preparing',
        completed: undefined,
        total: undefined,
        unit: undefined,
      })
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
    hash: (blob, onProgress, signal) => {
      updatePublication(activity, {
        phase: 'preparing',
        completed: 0,
        total: blob.size,
        unit: 'bytes',
      })
      return sha256File(
        blob,
        (done, total) => {
          onProgress(done, total)
          updatePublication(activity, { completed: done, total })
        },
        signal
      )
    },
    upload: ({ blob, name, type, sha256, onProgress, resumeFrom, onOffset, signal }) => {
      updatePublication(activity, {
        phase: 'uploading',
        completed: resumeFrom ?? 0,
        total: blob.size,
        unit: 'bytes',
      })
      return uploadBlob({
        file: blob,
        fileName: name,
        type,
        sha256,
        onProgress: (sent, total) => {
          onProgress(sent, total)
          updatePublication(activity, { completed: sent, total })
        },
        resumeFrom,
        onOffset,
        signal,
        sign: template => signUploadAuth(activity, signer, template, pubkey),
      })
    },
    prepareMedia: async (template, signal) => {
      const current = state ?? (await loadAdmin())
      if (!current) throw new Error(i18n.t('studio.errors.notLoggedIn'))
      if (!usesMirrorUrls(current)) return template
      onMirrorWait?.()
      updatePublication(activity, {
        phase: 'mirroring',
        completed: undefined,
        total: undefined,
        unit: 'files',
      })
      return mirrorMedia(
        template,
        (done, total) => updatePublication(activity, { completed: done, total }),
        signal,
        jobs => updatePublication(activity, { targets: outboxTargets(jobs) })
      )
    },
    publish: async template => {
      if (signed?.template !== template) {
        signed = { template, event: await signFor(activity, signer, template, pubkey) }
      }
      const event = signed.event
      if (publishAt) {
        await scheduleSigned(activity, event)
        return { eventId: event.id, link: '', accepted: [], scheduledFor: publishAt }
      }
      const { config, client } = await bootInstanceClient()
      const identifier = template.tags.find(t => t[0] === 'd')?.[1] ?? ''
      const relays = config.videoSources
      const accepted = await publishChecked(
        client,
        relays,
        event,
        'studio.errors.noRelayAccepted',
        activity
      )
      return {
        eventId: event.id,
        link: generateEventLink(event, identifier, relays.slice(0, 3)),
        accepted,
      }
    },
    newIdentifier: () => newIdentifier(title),
  }
}
