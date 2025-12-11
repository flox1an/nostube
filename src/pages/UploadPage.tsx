import { useState } from 'react'
import { VideoUpload } from '@/components/VideoUpload'
import { BlossomOnboardingStep } from '@/components/onboarding/BlossomOnboardingStep'

export function UploadPage() {
  const [onboardingComplete, setOnboardingComplete] = useState(
    () => localStorage.getItem('nostube_upload_onboarding_complete') === 'true'
  )

  const handleOnboardingComplete = () => {
    localStorage.setItem('nostube_upload_onboarding_complete', 'true')
    setOnboardingComplete(true)
  }

  if (!onboardingComplete) {
    return (
      <div className="container mx-auto py-6 max-w-4xl">
        <h1 className="text-3xl font-bold mb-6 pl-4 md:pl-0">Upload Video</h1>
        <BlossomOnboardingStep onComplete={handleOnboardingComplete} />
      </div>
    )
  }

  return (
    <div className="container mx-auto py-6 max-w-3xl">
      <h1 className="text-3xl font-bold mb-6 pl-4 md:pl-0">Upload Video</h1>
      <VideoUpload />
    </div>
  )
}
