/**
 * Comment Item Component
 *
 * Recursive component for rendering individual comments with threading.
 * Supports replies, reactions, and report functionality.
 */

import React, { useState } from 'react'
import { formatDistance } from 'date-fns/formatDistance'
import { Reply, MoreVertical, Flag, ChevronDown, ChevronUp } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useProfile } from '@/hooks'
import { Button } from '@/components/ui/button'
import { UserAvatar } from '@/components/UserAvatar'
import { RichTextContent } from '@/components/RichTextContent'
import { CommentInput } from '@/components/CommentInput'
import { CommentReactions } from '@/components/CommentReactions'
import { ReportDialog } from '@/components/ReportDialog'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu'
import { getDateLocale } from '@/lib/date-locale'
import type { Comment } from './types'

export interface CommentItemProps {
  comment: Comment
  link: string
  depth?: number
  onReply?: (comment: Comment) => void
  replyingTo?: string | null
  replyContent?: string
  onReplyContentChange?: (content: string) => void
  onSubmitReply?: (e: React.FormEvent) => void
  onCancelReply?: () => void
  expandedComments: Set<string>
  onToggleExpanded: (commentId: string) => void
  highlightedCommentId?: string | null
  currentUserAvatar?: string
  currentUserName?: string
  currentUserPubkey?: string
  onScrollToComment?: (commentId: string) => void
}

export const CommentItem = React.memo(function CommentItem({
  comment,
  link,
  depth = 0,
  onReply,
  replyingTo,
  replyContent,
  onReplyContentChange,
  onSubmitReply,
  onCancelReply,
  expandedComments,
  onToggleExpanded,
  highlightedCommentId,
  currentUserAvatar,
  currentUserName,
  currentUserPubkey,
  onScrollToComment,
}: CommentItemProps) {
  const { t, i18n } = useTranslation()
  const metadata = useProfile({ pubkey: comment.pubkey })
  const name = metadata?.name || comment.pubkey.slice(0, 8)
  const maxDepth = 5 // Maximum nesting level
  const dateLocale = getDateLocale(i18n.language)
  const isReplying = replyingTo === comment.id
  const isExpanded = expandedComments.has(comment.id)
  const hasReplies = comment.replies && comment.replies.length > 0
  const isHighlighted = highlightedCommentId === comment.id
  const [showReportDialog, setShowReportDialog] = useState(false)

  // Root comments (depth=0) have big avatars, nested have small avatars
  const isRootComment = depth === 0
  const avatarSize = isRootComment ? 'h-10 w-10' : 'h-6 w-6'

  return (
    <div
      id={`comment-${comment.id}`}
      className={`transition-colors duration-500 ${isHighlighted ? 'highlight-comment' : ''}`}
    >
      <div className="flex gap-3 pb-4">
        <UserAvatar
          picture={metadata?.picture}
          pubkey={comment.pubkey}
          name={name}
          className={`${avatarSize} shrink-0`}
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <div className="font-semibold text-sm">{name}</div>
            <div className="text-xs text-muted-foreground">
              {formatDistance(new Date(comment.created_at * 1000), new Date(), {
                addSuffix: true,
                locale: dateLocale,
              })}
            </div>
            <div className="ml-auto">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0 hover:bg-muted"
                    aria-label="More actions"
                  >
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onSelect={() => setShowReportDialog(true)}>
                    <Flag className="w-4 h-4 mr-2" />
                    {t('video.comments.reportComment')}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
          <RichTextContent
            content={comment.content}
            videoLink={link}
            className="mt-1 break-all text-sm"
          />
          {/* Reactions, reply, and expand buttons in same row */}
          <div className="flex items-center gap-1 mt-1">
            <CommentReactions eventId={comment.id} authorPubkey={comment.pubkey} />
            {onReply && !isReplying && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => onReply(comment)}
              >
                <Reply className="w-3 h-3 mr-1" />
                {t('video.comments.replyButton')}
              </Button>
            )}
            {/* Only show expand/collapse when more than 1 reply */}
            {hasReplies && comment.replies!.length > 1 && depth < maxDepth && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
                onClick={() => onToggleExpanded(comment.id)}
              >
                {isExpanded ? (
                  <>
                    <ChevronUp className="w-3 h-3 mr-1" />
                    {t('video.comments.hideReplies')} ({comment.replies!.length})
                  </>
                ) : (
                  <>
                    <ChevronDown className="w-3 h-3 mr-1" />
                    {t('video.comments.showReplies')} ({comment.replies!.length})
                  </>
                )}
              </Button>
            )}
          </div>

          {/* Inline reply form */}
          {isReplying && onSubmitReply && onReplyContentChange && onCancelReply && (
            <div className="mt-3 mb-2">
              <CommentInput
                value={replyContent || ''}
                onChange={onReplyContentChange}
                onSubmit={onSubmitReply}
                onCancel={onCancelReply}
                placeholder={t('video.comments.writeReply')}
                submitLabel={t('video.comments.replyButton')}
                userAvatar={currentUserAvatar}
                userName={currentUserName}
                userPubkey={currentUserPubkey}
                autoFocus
              />
            </div>
          )}

          {/* Render replies: auto-show if only 1 reply, or if expanded for multiple */}
          {hasReplies && (isExpanded || comment.replies!.length === 1) && depth < maxDepth && (
            <div className="mt-2 relative">
              {comment.replies!.map((reply, index) => (
                <div key={reply.id} className="relative flex">
                  {/* Vertical continuation line for all but the last reply */}
                  {index < comment.replies!.length - 1 && (
                    <div className="absolute left-3 top-0 bottom-0 w-px bg-border" />
                  )}
                  {/* L-shaped connector from parent to reply */}
                  <div className="absolute left-3 top-0 h-4 w-4 rounded-bl-lg border-l border-b border-border" />
                  <div className="flex-1 pl-6">
                    <CommentItem
                      comment={reply}
                      link={link}
                      depth={depth + 1}
                      onScrollToComment={onScrollToComment}
                      onReply={onReply}
                      replyingTo={replyingTo}
                      replyContent={replyContent}
                      onReplyContentChange={onReplyContentChange}
                      onSubmitReply={onSubmitReply}
                      onCancelReply={onCancelReply}
                      expandedComments={expandedComments}
                      onToggleExpanded={onToggleExpanded}
                      highlightedCommentId={highlightedCommentId}
                      currentUserAvatar={currentUserAvatar}
                      currentUserName={currentUserName}
                      currentUserPubkey={currentUserPubkey}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
          {/* Show indicator if max depth reached */}
          {hasReplies && depth >= maxDepth && (
            <div className="mt-2 text-xs text-muted-foreground">
              ... {comment.replies!.length} more{' '}
              {comment.replies!.length === 1
                ? t('video.comments.reply')
                : t('video.comments.replies')}
            </div>
          )}
        </div>
      </div>
      <ReportDialog
        open={showReportDialog}
        onOpenChange={setShowReportDialog}
        reportType="comment"
        contentId={comment.id}
        contentAuthor={comment.pubkey}
      />
    </div>
  )
})
