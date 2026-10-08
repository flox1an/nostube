import { Navigate } from 'react-router-dom'

export function MissingVideosSettingsPage() {
  return <Navigate to="/settings/storage" replace />
}
