interface ErrorMessageProps {
  message: string
}

export function ErrorMessage({ message }: ErrorMessageProps) {
  return (
    <div className="w-full h-full bg-black flex items-center justify-center">
      <div className="text-center p-6">
        <div className="text-4xl mb-4">😕</div>
        <p className="text-white/70 text-sm">{message}</p>
      </div>
    </div>
  )
}
