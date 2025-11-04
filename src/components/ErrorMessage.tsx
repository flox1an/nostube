import { AlertCircle, WifiOff, Lock, AlertTriangle } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { AppError } from '@/lib/error-utils'

interface ErrorMessageProps {
  error: AppError
  onRetry?: () => void
  className?: string
}

const errorIcons = {
  network: WifiOff,
  authentication: Lock,
  permission: Lock,
  validation: AlertTriangle,
  notfound: AlertCircle,
  unknown: AlertCircle,
}

const errorTitles = {
  network: 'Connection Error',
  authentication: 'Authentication Required',
  permission: 'Access Denied',
  validation: 'Invalid Input',
  notfound: 'Not Found',
  unknown: 'Error',
}

export function ErrorMessage({ error, onRetry, className }: ErrorMessageProps) {
  const Icon = errorIcons[error.category]
  const title = errorTitles[error.category]

  return (
    <Alert variant="destructive" className={className}>
      <Icon className="h-4 w-4" />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription className="mt-2 space-y-3">
        <p>{error.message}</p>
        {error.recoverable && onRetry && (
          <Button variant="outline" size="sm" onClick={onRetry}>
            Try Again
          </Button>
        )}
        {import.meta.env.DEV && error.originalError && (
          <details className="mt-2">
            <summary className="cursor-pointer text-xs">Debug Info</summary>
            <pre className="mt-2 text-xs overflow-auto p-2 bg-muted rounded">
              {error.originalError.message}
              {error.originalError.stack && `\n\n${error.originalError.stack}`}
            </pre>
          </details>
        )}
      </AlertDescription>
    </Alert>
  )
}
