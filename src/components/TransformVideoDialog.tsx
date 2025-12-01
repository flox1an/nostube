import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { CheckCircle, XCircle, Info } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { type VideoVariant } from '@/utils/video-event'
import {
  type TransformationSpec,
  getQualityFromVariant,
  extractCodecFromMimeType,
} from '@/lib/video-transformation-detection'
import { isCodecSupported } from '@/lib/codec-compatibility'
import { type Event as NostrEvent } from 'nostr-tools'

interface TransformVideoDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  videoEvent?: NostrEvent | null
  videoVariants: VideoVariant[]
  neededTransformations: TransformationSpec[]
}

/**
 * WIP dialog showing what video transformations are needed
 * Displays current variants, recommended transformations, and coming soon message
 */
export function TransformVideoDialog({
  open,
  onOpenChange,
  videoEvent: _videoEvent,
  videoVariants,
  neededTransformations,
}: TransformVideoDialogProps) {
  const { t } = useTranslation()

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{t('video.transform.dialogTitle')}</DialogTitle>
          <DialogDescription>{t('video.transform.dialogDescription')}</DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-6 py-4">
          {/* Current Video Variants Section */}
          {videoVariants.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-medium">{t('video.transform.currentVariants')}</h3>
              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('video.transform.quality')}</TableHead>
                      <TableHead>{t('video.transform.codec')}</TableHead>
                      <TableHead>{t('video.transform.dimensions')}</TableHead>
                      <TableHead className="text-center">
                        {t('video.transform.iosCompatible')}
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {videoVariants.map((variant, index) => {
                      const quality = getQualityFromVariant(variant)
                      const codec = extractCodecFromMimeType(variant.mimeType)
                      const isIOSCompatible = variant.mimeType
                        ? isCodecSupported(variant.mimeType)
                        : false

                      return (
                        <TableRow key={index}>
                          <TableCell className="font-medium">
                            {quality || <span className="text-muted-foreground">Unknown</span>}
                          </TableCell>
                          <TableCell className="font-mono text-sm">
                            {codec || <span className="text-muted-foreground">Unknown</span>}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {variant.dimensions || (
                              <span className="text-muted-foreground">Unknown</span>
                            )}
                          </TableCell>
                          <TableCell className="text-center">
                            {isIOSCompatible ? (
                              <CheckCircle className="h-4 w-4 text-green-500 inline-block" />
                            ) : (
                              <XCircle className="h-4 w-4 text-red-500 inline-block" />
                            )}
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}

          {/* Needed Transformations Section */}
          {neededTransformations.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-medium">{t('video.transform.neededTransforms')}</h3>
              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('video.transform.targetQuality')}</TableHead>
                      <TableHead>{t('video.transform.targetCodec')}</TableHead>
                      <TableHead>{t('video.transform.reason')}</TableHead>
                      <TableHead>{t('video.transform.priority')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {neededTransformations.map((transform, index) => (
                      <TableRow key={index}>
                        <TableCell className="font-medium">{transform.targetResolution}</TableCell>
                        <TableCell className="font-mono text-sm">{transform.targetCodec}</TableCell>
                        <TableCell className="text-sm">{transform.reason}</TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              transform.priority === 'high'
                                ? 'destructive'
                                : transform.priority === 'medium'
                                  ? 'default'
                                  : 'secondary'
                            }
                          >
                            {t(
                              `video.transform.priority${transform.priority.charAt(0).toUpperCase() + transform.priority.slice(1)}`
                            )}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}

          {/* WIP Message */}
          <Alert className="border-blue-500 bg-blue-50 dark:bg-blue-950">
            <Info className="h-4 w-4" />
            <AlertTitle>{t('video.transform.wipTitle')}</AlertTitle>
            <AlertDescription>{t('video.transform.wipMessage')}</AlertDescription>
          </Alert>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.close')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
