# Notification System Manual Testing Checklist

## Setup

- [ ] Clear localStorage
- [ ] Have two accounts ready (tester and commenter)
- [ ] Have a test video published by tester account

## Core Functionality

- [ ] Log in with tester account
- [ ] Verify bell icon appears in header
- [ ] Have commenter account comment on tester's video
- [ ] Wait up to 2.5 minutes for notification to appear
- [ ] Verify red dot appears on bell icon
- [ ] Click bell to open dropdown
- [ ] Verify notification shows with correct avatar, name, video title, and time
- [ ] Click notification
- [ ] Verify navigation to video page
- [ ] Verify scroll to comment
- [ ] Verify highlight animation on comment
- [ ] Verify red dot disappears after marking as read

## Persistence

- [ ] Refresh page
- [ ] Verify notifications persist
- [ ] Verify read state persists
- [ ] Log out and log in
- [ ] Verify lastLoginTime updates

## Multi-Tab

- [ ] Open app in two tabs
- [ ] Mark notification as read in tab 1
- [ ] Verify notification updates in tab 2

## Edge Cases

- [ ] Test with deleted video (should show "Unknown video")
- [ ] Test with 100+ notifications (verify cleanup)
- [ ] Test with notifications older than 7 days (verify cleanup)
- [ ] Test when logged out (bell should not appear)

## i18n

- [ ] Test in all four languages (EN/DE/FR/ES)
- [ ] Verify translations appear correctly
