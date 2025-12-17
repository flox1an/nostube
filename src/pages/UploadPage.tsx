import { useState } from 'react'
import { VideoUpload } from '@/components/VideoUpload'
import { BlossomOnboardingStep } from '@/components/onboarding/BlossomOnboardingStep'
import { BlossomServerPicker } from '@/components/onboarding/BlossomServerPicker'
import { useAppContext } from '@/hooks'
import { deriveServerName } from '@/lib/blossom-servers'
import type { BlossomServerTag } from '@/contexts/AppContext'
import { Card, CardContent } from '@/components/ui/card'

export function UploadPage() {
  const { config, updateConfig } = useAppContext()
  const [onboardingComplete, setOnboardingComplete] = useState(
    () => localStorage.getItem('nostube_upload_onboarding_complete') === 'true'
  )

  const [showUploadPicker, setShowUploadPicker] = useState(false)
  const [showMirrorPicker, setShowMirrorPicker] = useState(false)

  // Initialize with existing configured servers
  const [uploadServers, setUploadServers] = useState<string[]>(() => {
    return (
      config.blossomServers?.filter(s => s.tags.includes('initial upload')).map(s => s.url) || []
    )
  })
  const [mirrorServers, setMirrorServers] = useState<string[]>(() => {
    return config.blossomServers?.filter(s => s.tags.includes('mirror')).map(s => s.url) || []
  })

  const handleOnboardingComplete = () => {
    // Save to config
    const blossomServers = [
      ...uploadServers.map(url => ({
        url,
        name: deriveServerName(url),
        tags: ['initial upload'] as BlossomServerTag[],
      })),
      ...mirrorServers.map(url => ({
        url,
        name: deriveServerName(url),
        tags: ['mirror'] as BlossomServerTag[],
      })),
    ]

    updateConfig(current => ({ ...current, blossomServers }))
    localStorage.setItem('nostube_upload_onboarding_complete', 'true')
    setOnboardingComplete(true)
  }

  const handleAddUploadServer = (url: string) => {
    setUploadServers(prev => [...prev, url])
    setShowUploadPicker(false)
  }

  const handleAddMirrorServer = (url: string) => {
    setMirrorServers(prev => [...prev, url])
    setShowMirrorPicker(false)
  }

  const handleRemoveUploadServer = (url: string) => {
    setUploadServers(prev => prev.filter(s => s !== url))
  }

  const handleRemoveMirrorServer = (url: string) => {
    setMirrorServers(prev => prev.filter(s => s !== url))
  }

  if (!onboardingComplete) {
    return (
      <>
        <div className="container mx-auto py-6 max-w-4xl">
          <h1 className="text-3xl font-bold mb-6 pl-4 md:pl-0">Upload Video</h1>
          <Card>
            <CardContent className="pt-6">
              <BlossomOnboardingStep
                uploadServers={uploadServers}
                mirrorServers={mirrorServers}
                onRemoveUploadServer={handleRemoveUploadServer}
                onRemoveMirrorServer={handleRemoveMirrorServer}
                onComplete={handleOnboardingComplete}
                onOpenUploadPicker={() => setShowUploadPicker(true)}
                onOpenMirrorPicker={() => setShowMirrorPicker(true)}
              />
            </CardContent>
          </Card>
        </div>

        {/* Blossom Server Picker Dialogs */}
        <BlossomServerPicker
          open={showUploadPicker}
          onOpenChange={setShowUploadPicker}
          excludeServers={uploadServers}
          onSelect={handleAddUploadServer}
          type="upload"
        />

        <BlossomServerPicker
          open={showMirrorPicker}
          onOpenChange={setShowMirrorPicker}
          excludeServers={mirrorServers}
          onSelect={handleAddMirrorServer}
          type="mirror"
        />
      </>
    )
  }

  return (
    <div className="container mx-auto py-6 max-w-3xl">
      <h1 className="text-3xl font-bold mb-6 pl-4 md:pl-0">Upload Video</h1>
      <VideoUpload />
    </div>
  )
}
