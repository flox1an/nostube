// NOTE: This file is stable and usually should not be modified.
// It is important that all functionality in this file is preserved, and should only be modified if explicitly requested.

import React, { useRef, useState } from 'react'
import { Shield, Upload, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button.tsx'
import { Input } from '@/components/ui/input.tsx'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog.tsx'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs.tsx'
import { Alert, AlertDescription } from '@/components/ui/alert.tsx'
import { useLoginActions } from '@/hooks/useLoginActions'

interface LoginDialogProps {
  isOpen: boolean
  onClose: () => void
  onLogin: () => void
  onSignup?: () => void
}

const LoginDialog: React.FC<LoginDialogProps> = ({ isOpen, onClose, onLogin, onSignup }) => {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [nsec, setNsec] = useState('')
  const [bunkerUri, setBunkerUri] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const login = useLoginActions()

  const handleExtensionLogin = async () => {
    setIsLoading(true)
    setError(null)
    
    try {
      await login.extension()
      onLogin()
      onClose()
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Extension login failed. Please try again.'
      setError(errorMessage)
      console.error('Extension login failed:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleKeyLogin = async () => {
    if (!nsec.trim()) {
      setError('Please enter your nsec key')
      return
    }
    
    setIsLoading(true)
    setError(null)

    try {
      await login.nsec(nsec)
      setNsec('') // Clear nsec after successful login
      onLogin()
      onClose()
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Nsec login failed. Please check your key and try again.'
      setError(errorMessage)
      console.error('Nsec login failed:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleBunkerLogin = async () => {
    if (!bunkerUri.trim()) {
      setError('Please enter a bunker URI')
      return
    }
    
    if (!bunkerUri.startsWith('bunker://')) {
      setError('Bunker URI must start with bunker://')
      return
    }
    
    setIsLoading(true)
    setError(null)

    try {
      await login.bunker(bunkerUri)
      setBunkerUri('') // Clear bunker URI after successful login
      onLogin()
      onClose()
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Bunker login failed. Please check your URI and try again.'
      setError(errorMessage)
      console.error('Bunker login failed:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = event => {
      const content = event.target?.result as string
      setNsec(content.trim())
    }
    reader.readAsText(file)
  }

  const handleSignupClick = () => {
    onClose()
    if (onSignup) {
      onSignup()
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md p-0 overflow-hidden rounded-2xl">
        <DialogHeader className="px-6 pt-6 pb-0 relative">
          <DialogTitle className="text-xl font-semibold text-center">Log in</DialogTitle>
          <DialogDescription className="text-center text-muted-foreground mt-2">
            Access your account securely with your preferred method
          </DialogDescription>
        </DialogHeader>

        <div className="px-6 py-8 space-y-6">
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          
          <Tabs 
            defaultValue={'nostr' in window ? 'extension' : 'key'} 
            className="w-full"
            onValueChange={() => setError(null)}
          >
            <TabsList className="grid grid-cols-3 mb-6">
              <TabsTrigger value="extension">Extension</TabsTrigger>
              <TabsTrigger value="key">Nsec</TabsTrigger>
              <TabsTrigger value="bunker">Bunker</TabsTrigger>
            </TabsList>

            <TabsContent value="extension" className="space-y-4">
              <div className="text-center p-4 rounded-lg bg-card">
                <Shield className="w-12 h-12 mx-auto mb-3 text-primary" />
                <p className="text-sm mb-4">Login with one click using the browser extension</p>
                <Button
                  className="w-full rounded-full py-6"
                  onClick={handleExtensionLogin}
                  disabled={isLoading}
                >
                  {isLoading ? 'Logging in...' : 'Login with Extension'}
                </Button>
              </div>
            </TabsContent>

            <TabsContent value="key" className="space-y-4">
              <div className="space-y-4">
                <div className="space-y-2">
                  <label
                    htmlFor="nsec"
                    className="text-sm font-medium text-gray-700 dark:text-gray-400"
                  >
                    Enter your nsec
                  </label>
                  <Input
                    id="nsec"
                    value={nsec}
                    onChange={e => setNsec(e.target.value)}
                    className="rounded-lg focus-visible:ring-primary"
                    placeholder="nsec1..."
                  />
                </div>

                <div className="text-center">
                  <p className="text-sm mb-2">Or upload a key file</p>
                  <input
                    type="file"
                    accept=".txt"
                    className="hidden"
                    ref={fileInputRef}
                    onChange={handleFileUpload}
                  />
                  <Button
                    variant="secondary"
                    className="w-full"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Upload className="w-4 h-4 mr-2" />
                    Upload Nsec File
                  </Button>
                </div>

                <Button
                  className="w-full rounded-full py-6 mt-4"
                  onClick={handleKeyLogin}
                  disabled={isLoading || !nsec.trim()}
                >
                  {isLoading ? 'Verifying...' : 'Login with Nsec'}
                </Button>
              </div>
            </TabsContent>

            <TabsContent value="bunker" className="space-y-4">
              <div className="space-y-2">
                <label
                  htmlFor="bunkerUri"
                  className="text-sm font-medium text-gray-700 dark:text-gray-400"
                >
                  Bunker URI
                </label>
                <Input
                  id="bunkerUri"
                  value={bunkerUri}
                  onChange={e => setBunkerUri(e.target.value)}
                  className="rounded-lg border-gray-300 dark:border-gray-700 focus-visible:ring-primary"
                  placeholder="bunker://"
                />
                {bunkerUri && !bunkerUri.startsWith('bunker://') && (
                  <p className="text-red-500 text-xs">URI must start with bunker://</p>
                )}
              </div>

              <Button
                className="w-full rounded-full py-6"
                onClick={handleBunkerLogin}
                disabled={isLoading || !bunkerUri.trim() || !bunkerUri.startsWith('bunker://')}
              >
                {isLoading ? 'Connecting...' : 'Login with Bunker'}
              </Button>
            </TabsContent>
          </Tabs>

          <div className="text-center text-sm">
            <p className="text-gray-600 dark:text-gray-400">
              Don't have an account?{' '}
              <button
                onClick={handleSignupClick}
                className="text-primary hover:underline font-medium"
              >
                Sign up
              </button>
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export default LoginDialog
