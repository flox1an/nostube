import { VideoUpload } from '@/components/VideoUpload';

export function UploadPage() {
  return (
    <div className="container mx-auto py-6 max-w-3xl">
      <h1 className="text-3xl font-bold mb-6">Upload Video</h1>
      <VideoUpload />
    </div>
  );
}