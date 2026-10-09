//! Slows down password guessing on the admin login.
//!
//! A few wrong passwords are free (people mistype); every further one in a row makes the next try
//! wait twice as long, up to a quarter of an hour. While the wait runs the password is not even
//! looked at, so the right guess is not answered either. A success starts over, and so does an hour
//! without a wrong try (a forgotten password must not keep a mark for good).
//!
//! The count is for the whole instance, not per address: behind a proxy every request comes from
//! the proxy, and the server reads no forwarded headers (ADR 0003). The price is that someone who
//! keeps guessing also makes the real admin wait; the Nostr key login is not affected, and a
//! restart clears the count.

use std::time::{Duration, Instant};

/// Wrong passwords in a row before the waiting starts.
pub const FREE_ATTEMPTS: u32 = 3;
/// The longest wait between two tries.
pub const MAX_WAIT: Duration = Duration::from_secs(15 * 60);
/// This long without a wrong password and the count is forgotten.
pub const FORGET_AFTER: Duration = Duration::from_secs(60 * 60);

/// How long the next try has to wait after `failures` wrong passwords in a row.
pub fn wait_after(failures: u32) -> Duration {
    if failures <= FREE_ATTEMPTS {
        return Duration::ZERO;
    }
    let seconds = 1u64.checked_shl(failures - FREE_ATTEMPTS).unwrap_or(u64::MAX);
    Duration::from_secs(seconds).min(MAX_WAIT)
}

#[derive(Default)]
pub struct LoginGuard {
    failures: u32,
    last_failure: Option<Instant>,
    blocked_until: Option<Instant>,
}

impl LoginGuard {
    /// `Err(wait)`: not yet, try again in `wait`.
    pub fn check(&mut self, now: Instant) -> Result<(), Duration> {
        self.forget_old(now);
        match self.blocked_until {
            Some(until) if until > now => Err(until - now),
            _ => Ok(()),
        }
    }

    /// Counts a wrong password; returns how long the next try has to wait, if it has to.
    pub fn record_failure(&mut self, now: Instant) -> Option<Duration> {
        self.forget_old(now);
        self.failures = self.failures.saturating_add(1);
        self.last_failure = Some(now);
        let wait = wait_after(self.failures);
        if wait.is_zero() {
            self.blocked_until = None;
            None
        } else {
            self.blocked_until = Some(now + wait);
            Some(wait)
        }
    }

    pub fn record_success(&mut self) {
        *self = LoginGuard::default();
    }

    /// Wrong passwords in a row so far.
    pub fn failures(&self) -> u32 {
        self.failures
    }

    fn forget_old(&mut self, now: Instant) {
        if self.last_failure.is_some_and(|last| now.duration_since(last) >= FORGET_AFTER) {
            *self = LoginGuard::default();
        }
    }
}

/// `45 seconds`, `3 minutes`: for the message on the page.
pub fn describe(wait: Duration) -> String {
    let seconds = wait.as_secs_f64().ceil() as u64;
    if seconds < 90 {
        format!("{seconds} second{}", if seconds == 1 { "" } else { "s" })
    } else {
        format!("{} minutes", seconds.div_ceil(60))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const S: fn(u64) -> Duration = Duration::from_secs;

    #[test]
    fn the_first_wrong_passwords_are_free_then_the_wait_doubles_up_to_the_cap() {
        let waits: Vec<u64> = (1..=14).map(|n| wait_after(n).as_secs()).collect();
        assert_eq!(waits, [0, 0, 0, 2, 4, 8, 16, 32, 64, 128, 256, 512, 900, 900]);
        assert_eq!(wait_after(u32::MAX), MAX_WAIT);
    }

    #[test]
    fn a_blocked_guard_refuses_until_the_wait_is_over() {
        let t0 = Instant::now();
        let mut guard = LoginGuard::default();
        for _ in 0..3 {
            assert_eq!(guard.record_failure(t0), None);
            assert!(guard.check(t0).is_ok());
        }
        assert_eq!(guard.record_failure(t0), Some(S(2)));
        assert_eq!(guard.check(t0 + S(1)), Err(S(1)));
        assert!(guard.check(t0 + S(2)).is_ok());
        // The next wrong try (after the wait) doubles it.
        assert_eq!(guard.record_failure(t0 + S(2)), Some(S(4)));
        assert_eq!(guard.failures(), 5);
    }

    #[test]
    fn a_success_starts_over() {
        let t0 = Instant::now();
        let mut guard = LoginGuard::default();
        for _ in 0..6 {
            guard.record_failure(t0);
        }
        assert!(guard.check(t0).is_err());
        guard.record_success();
        assert!(guard.check(t0).is_ok());
        assert_eq!(guard.failures(), 0);
        assert_eq!(guard.record_failure(t0), None);
    }

    #[test]
    fn an_hour_without_a_wrong_password_clears_the_count_but_steady_guessing_never_does() {
        let t0 = Instant::now();
        let mut guard = LoginGuard::default();
        for _ in 0..8 {
            guard.record_failure(t0);
        }
        assert!(guard.check(t0 + FORGET_AFTER).is_ok());
        assert_eq!(guard.record_failure(t0 + FORGET_AFTER), None);
        assert_eq!(guard.failures(), 1);

        // Someone who tries again the moment each wait ends (15 min at the cap) is never forgotten.
        let mut guard = LoginGuard::default();
        let mut now = t0;
        for _ in 0..30 {
            guard.record_failure(now);
            now += MAX_WAIT;
        }
        assert_eq!(guard.failures(), 30);
        assert_eq!(wait_after(guard.failures()), MAX_WAIT);
    }

    #[test]
    fn the_message_names_a_time_a_person_can_read() {
        assert_eq!(describe(S(1)), "1 second");
        assert_eq!(describe(S(45)), "45 seconds");
        assert_eq!(describe(S(120)), "2 minutes");
        assert_eq!(describe(MAX_WAIT), "15 minutes");
        assert_eq!(describe(Duration::from_millis(300)), "1 second");
    }
}
