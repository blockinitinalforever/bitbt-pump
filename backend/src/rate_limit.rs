use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

const MAX_TRACKED_IPS: usize = 10_000;

/// Sliding-window IP rate limiter.
/// Bounded memory with opportunistic stale cleanup.
/// Callers should typically count failures only (e.g. failed logins).
#[derive(Clone, Debug)]
pub struct IpRateLimiter {
    inner: Arc<Mutex<LimiterState>>,
    max_attempts: u32,
    window: Duration,
}

#[derive(Debug, Default)]
struct LimiterState {
    attempts: HashMap<String, Vec<Instant>>,
}

impl IpRateLimiter {
    pub fn new(max_attempts: u32, window: Duration) -> Self {
        Self {
            inner: Arc::new(Mutex::new(LimiterState::default())),
            max_attempts,
            window,
        }
    }

    /// Returns true when this IP is currently over the limit.
    pub fn is_limited(&self, ip: &str) -> bool {
        let now = Instant::now();
        let mut state = self.inner.lock().expect("rate limiter poisoned");
        Self::cleanup_locked(&mut state, now, self.window);

        match state.attempts.get_mut(ip) {
            Some(entry) => {
                entry.retain(|t| now.duration_since(*t) < self.window);
                (entry.len() as u32) >= self.max_attempts
            }
            None => false,
        }
    }

    /// Record a failed attempt for this IP.
    pub fn record_failure(&self, ip: &str) {
        let now = Instant::now();
        let mut state = self.inner.lock().expect("rate limiter poisoned");
        Self::cleanup_locked(&mut state, now, self.window);

        if let Some(entry) = state.attempts.get_mut(ip) {
            entry.retain(|t| now.duration_since(*t) < self.window);
            entry.push(now);
            return;
        }

        if state.attempts.len() >= MAX_TRACKED_IPS {
            Self::evict_oldest(&mut state);
        }

        state.attempts.insert(ip.to_string(), vec![now]);
    }

    fn cleanup_locked(state: &mut LimiterState, now: Instant, window: Duration) {
        state.attempts.retain(|_, times| {
            times.retain(|t| now.duration_since(*t) < window);
            !times.is_empty()
        });
    }

    fn evict_oldest(state: &mut LimiterState) {
        let mut keys: Vec<(String, Instant)> = state
            .attempts
            .iter()
            .filter_map(|(k, v)| v.iter().max().map(|t| (k.clone(), *t)))
            .collect();
        keys.sort_by_key(|(_, t)| *t);
        let remove_count = (keys.len() / 10).max(1);
        for (k, _) in keys.into_iter().take(remove_count) {
            state.attempts.remove(&k);
        }
    }

    #[cfg(test)]
    fn tracked_count(&self) -> usize {
        self.inner.lock().unwrap().attempts.len()
    }
}

/// Back-compat alias used by existing call sites / docs.
pub type LoginRateLimiter = IpRateLimiter;

#[cfg(test)]
mod tests {
    use super::*;
    use std::thread;

    #[test]
    fn allows_up_to_max_failures() {
        let limiter = IpRateLimiter::new(5, Duration::from_secs(900));
        for _ in 0..5 {
            assert!(!limiter.is_limited("1.2.3.4"));
            limiter.record_failure("1.2.3.4");
        }
        assert!(limiter.is_limited("1.2.3.4"));
    }

    #[test]
    fn successful_path_does_not_consume_budget_without_record() {
        let limiter = IpRateLimiter::new(2, Duration::from_secs(900));
        assert!(!limiter.is_limited("10.0.0.9"));
        assert!(!limiter.is_limited("10.0.0.9"));
        assert!(!limiter.is_limited("10.0.0.9"));
        limiter.record_failure("10.0.0.9");
        limiter.record_failure("10.0.0.9");
        assert!(limiter.is_limited("10.0.0.9"));
    }

    #[test]
    fn different_ips_are_independent() {
        let limiter = IpRateLimiter::new(2, Duration::from_secs(900));
        limiter.record_failure("10.0.0.1");
        limiter.record_failure("10.0.0.1");
        assert!(limiter.is_limited("10.0.0.1"));
        assert!(!limiter.is_limited("10.0.0.2"));
    }

    #[test]
    fn window_expiry_clears_attempts() {
        let limiter = IpRateLimiter::new(1, Duration::from_millis(40));
        limiter.record_failure("9.9.9.9");
        assert!(limiter.is_limited("9.9.9.9"));
        thread::sleep(Duration::from_millis(60));
        assert!(!limiter.is_limited("9.9.9.9"));
    }

    #[test]
    fn cleanup_removes_stale_ips() {
        let limiter = IpRateLimiter::new(5, Duration::from_millis(30));
        limiter.record_failure("stale-ip");
        assert_eq!(limiter.tracked_count(), 1);
        thread::sleep(Duration::from_millis(50));
        assert!(!limiter.is_limited("fresh-ip"));
        assert!(!limiter
            .inner
            .lock()
            .unwrap()
            .attempts
            .contains_key("stale-ip"));
    }
}
