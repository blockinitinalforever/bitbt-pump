use crate::config::Config;
use crate::rate_limit::IpRateLimiter;
use sqlx::PgPool;
use std::sync::Arc;

#[derive(Clone)]
pub struct AppState {
    pub pool: PgPool,
    pub config: Arc<Config>,
    pub login_limiter: IpRateLimiter,
    pub contact_limiter: IpRateLimiter,
    pub verification_limiter: IpRateLimiter,
}

impl AppState {
    pub fn new(pool: PgPool, config: Config) -> Self {
        let login_limiter =
            IpRateLimiter::new(config.login_rate_limit_max, config.login_rate_limit_window);
        let contact_limiter = IpRateLimiter::new(
            config.contact_rate_limit_max,
            config.contact_rate_limit_window,
        );
        let verification_limiter = IpRateLimiter::new(
            config.verification_rate_limit_max,
            config.verification_rate_limit_window,
        );
        Self {
            pool,
            config: Arc::new(config),
            login_limiter,
            contact_limiter,
            verification_limiter,
        }
    }
}
