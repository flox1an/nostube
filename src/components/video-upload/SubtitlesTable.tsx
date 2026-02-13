import type { SubtitleVariant } from '@/types/upload-draft'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Trash2, LucideBookUp, Copy } from 'lucide-react'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { LANGUAGES } from '@/components/ui/language-select'

interface SubtitlesTableProps {
  subtitles: SubtitleVariant[]
  onRemove: (id: string) => void
  onLanguageChange: (id: string, lang: string) => void
}

export function SubtitlesTable({ subtitles, onRemove, onLanguageChange }: SubtitlesTableProps) {
  const { t } = useTranslation()

  if (subtitles.length === 0) {
    return null
  }

  return (
    <div className="border rounded-lg overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-12">#</TableHead>
            <TableHead className="w-40">
              {t('upload.subtitles.language', { defaultValue: 'Language' })}
            </TableHead>
            <TableHead>{t('upload.subtitles.filename', { defaultValue: 'Filename' })}</TableHead>
            <TableHead className="w-28">
              {t('upload.subtitles.status', { defaultValue: 'Status' })}
            </TableHead>
            <TableHead className="w-20 text-right">
              {t('upload.subtitles.actions', { defaultValue: 'Actions' })}
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {subtitles.map((subtitle, index) => (
            <TableRow key={subtitle.id}>
              <TableCell className="font-medium">{index + 1}</TableCell>
              <TableCell>
                <Select
                  value={subtitle.lang || 'none'}
                  onValueChange={value =>
                    onLanguageChange(subtitle.id, value === 'none' ? '' : value)
                  }
                >
                  <SelectTrigger className="w-36 h-8">
                    <SelectValue
                      placeholder={t('upload.subtitles.selectLanguage', {
                        defaultValue: 'Select...',
                      })}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">
                      {t('upload.subtitles.selectLanguage', { defaultValue: 'Select...' })}
                    </SelectItem>
                    {LANGUAGES.map(lang => (
                      <SelectItem key={lang.code} value={lang.code}>
                        {lang.flag} {lang.name}{' '}
                        {lang.name !== lang.englishName && `(${lang.englishName})`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </TableCell>
              <TableCell
                className="font-mono text-sm truncate max-w-[200px]"
                title={subtitle.filename}
              >
                {subtitle.filename}
              </TableCell>
              <TableCell>
                <TooltipProvider>
                  <div className="flex items-center gap-2">
                    {(subtitle.uploadedBlobs?.length ?? 0) > 0 && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className="flex items-center gap-1 cursor-help">
                            <LucideBookUp className="h-4 w-4 text-green-500" />
                            <span className="text-xs font-medium">
                              {subtitle.uploadedBlobs.length}
                            </span>
                          </div>
                        </TooltipTrigger>
                        <TooltipContent>
                          <div className="space-y-1">
                            <p className="font-semibold text-xs">
                              {t('upload.videoTable.uploadedTo', { defaultValue: 'Uploaded to' })}:
                            </p>
                            {subtitle.uploadedBlobs.map((blob, idx) => {
                              const url = new URL(blob.url)
                              return (
                                <p key={idx} className="text-xs">
                                  ✓ {url.hostname}
                                </p>
                              )
                            })}
                          </div>
                        </TooltipContent>
                      </Tooltip>
                    )}
                    {(subtitle.mirroredBlobs?.length ?? 0) > 0 && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className="flex items-center gap-1 cursor-help">
                            <Copy className="h-4 w-4 text-blue-500" />
                            <span className="text-xs font-medium">
                              {subtitle.mirroredBlobs.length}
                            </span>
                          </div>
                        </TooltipTrigger>
                        <TooltipContent>
                          <div className="space-y-1">
                            <p className="font-semibold text-xs">
                              {t('upload.videoTable.mirroredTo', { defaultValue: 'Mirrored to' })}:
                            </p>
                            {subtitle.mirroredBlobs.map((blob, idx) => {
                              const url = new URL(blob.url)
                              return (
                                <p key={idx} className="text-xs">
                                  ✓ {url.hostname}
                                </p>
                              )
                            })}
                          </div>
                        </TooltipContent>
                      </Tooltip>
                    )}
                    {(subtitle.uploadedBlobs?.length ?? 0) === 0 &&
                      (subtitle.mirroredBlobs?.length ?? 0) === 0 && (
                        <span className="text-xs text-muted-foreground">
                          {t('upload.subtitles.pending', { defaultValue: 'Pending' })}
                        </span>
                      )}
                  </div>
                </TooltipProvider>
              </TableCell>
              <TableCell className="text-right">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => onRemove(subtitle.id)}
                  className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                  title={t('upload.subtitles.remove', { defaultValue: 'Remove' })}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
