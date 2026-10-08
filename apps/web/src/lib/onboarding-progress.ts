/**
 * Central onboarding persistence.
 *
 * These localStorage keys + values were previously inlined across four
 * components (OnboardingDialog, FollowImportStep, PhaseIdentityStep,
 * SignupDialog) plus a dead re-export in constants/storage.ts, causing drift.
 * The helpers below own the magic key/value strings so call sites never repeat
 * them — the named verbs (markFollowImported vs markFollowSkipped vs
 * markFollowDone) are the semantic contract.
 *
 * Keys and values are intentionally unchanged so existing users keep their state.
 */

const FOLLOW_IMPORT_KEY = 'nostube_onboarding_follow_import'
const NEW_USER_KEY = 'nostube_onboarding_new_user'

export function isFollowImportResolved(): boolean {
  return localStorage.getItem(FOLLOW_IMPORT_KEY) !== null
}

export function markFollowImported(): void {
  localStorage.setItem(FOLLOW_IMPORT_KEY, 'imported')
}

export function markFollowSkipped(): void {
  localStorage.setItem(FOLLOW_IMPORT_KEY, 'skipped')
}

export function markFollowDone(): void {
  localStorage.setItem(FOLLOW_IMPORT_KEY, 'done')
}

export function isNewUser(): boolean {
  return localStorage.getItem(NEW_USER_KEY) === '1'
}

export function markNewUser(): void {
  localStorage.setItem(NEW_USER_KEY, '1')
}

export function clearNewUser(): void {
  localStorage.removeItem(NEW_USER_KEY)
}
