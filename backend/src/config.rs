use std::env;
use std::time::Duration;

/// Process configuration loaded from environment.
/// Missing `DATABASE_URL` causes startup failure (no hardcoded credentials).
/// Intentionally does **not** derive Debug (credentials must not be printed).
#[derive(Clone)]
pub struct Config {
    pub database_url: String,
    pub port: u16,
    pub session_ttl: Duration,
    pub login_rate_limit_max: u32,
    pub login_rate_limit_window: Duration,
    pub contact_rate_limit_max: u32,
    pub contact_rate_limit_window: Duration,
    pub verification_rate_limit_max: u32,
    pub verification_rate_limit_window: Duration,
    pub contact_email: String,
    pub smtp_user: String,
    pub smtp_pass: String,
    pub smtp_host: String,
}

const LOGIN_MAX_MIN: u32 = 1;
const LOGIN_MAX_MAX: u32 = 50;
const CONTACT_MAX_MIN: u32 = 1;
const CONTACT_MAX_MAX: u32 = 100;
const WINDOW_SECS_MIN: u64 = 60;
const WINDOW_SECS_MAX: u64 = 86_400;

impl Config {
    pub fn from_env() -> Result<Self, String> {
        let database_url =
            env::var("DATABASE_URL").map_err(|_| "DATABASE_URL is required".to_string())?;

        if database_url.trim().is_empty() {
            return Err("DATABASE_URL must not be empty".into());
        }

        let port: u16 = env::var("PORT")
            .unwrap_or_else(|_| "3100".into())
            .parse()
            .map_err(|_| "PORT must be a valid u16".to_string())?;

        let session_ttl_hours: u64 = env::var("SESSION_TTL_HOURS")
            .unwrap_or_else(|_| "12".into())
            .parse()
            .map_err(|_| "SESSION_TTL_HOURS must be a number".to_string())?;

        if session_ttl_hours == 0 || session_ttl_hours > 12 {
            return Err("SESSION_TTL_HOURS must be between 1 and 12".into());
        }

        let login_rate_limit_max =
            parse_bounded_u32("LOGIN_RATE_LIMIT_MAX", 5, LOGIN_MAX_MIN, LOGIN_MAX_MAX)?;
        let login_rate_limit_window_secs = parse_bounded_u64(
            "LOGIN_RATE_LIMIT_WINDOW_SECS",
            900,
            WINDOW_SECS_MIN,
            WINDOW_SECS_MAX,
        )?;
        let contact_rate_limit_max = parse_bounded_u32(
            "CONTACT_RATE_LIMIT_MAX",
            10,
            CONTACT_MAX_MIN,
            CONTACT_MAX_MAX,
        )?;
        let contact_rate_limit_window_secs = parse_bounded_u64(
            "CONTACT_RATE_LIMIT_WINDOW_SECS",
            600,
            WINDOW_SECS_MIN,
            WINDOW_SECS_MAX,
        )?;
        let verification_rate_limit_max = parse_bounded_u32(
            "VERIFICATION_RATE_LIMIT_MAX",
            30,
            CONTACT_MAX_MIN,
            CONTACT_MAX_MAX,
        )?;
        let verification_rate_limit_window_secs = parse_bounded_u64(
            "VERIFICATION_RATE_LIMIT_WINDOW_SECS",
            60,
            WINDOW_SECS_MIN,
            WINDOW_SECS_MAX,
        )?;

        let contact_email =
            env::var("CONTACT_EMAIL").unwrap_or_else(|_| "support@bitbt.com".into());
        let smtp_user = env::var("SMTP_USER").unwrap_or_default();
        let smtp_pass = env::var("SMTP_PASS").unwrap_or_default();
        let smtp_host = env::var("SMTP_HOST").unwrap_or_else(|_| "smtpout.secureserver.net".into());

        validate_smtp_config(&contact_email, &smtp_user, &smtp_pass, &smtp_host)?;

        Ok(Self {
            database_url,
            port,
            session_ttl: Duration::from_secs(session_ttl_hours * 3600),
            login_rate_limit_max,
            login_rate_limit_window: Duration::from_secs(login_rate_limit_window_secs),
            contact_rate_limit_max,
            contact_rate_limit_window: Duration::from_secs(contact_rate_limit_window_secs),
            verification_rate_limit_max,
            verification_rate_limit_window: Duration::from_secs(
                verification_rate_limit_window_secs,
            ),
            contact_email,
            smtp_user,
            smtp_pass,
            smtp_host,
        })
    }

    /// Test / router-smoke helper with safe defaults (no real secrets).
    #[cfg(test)]
    pub fn test_fixture() -> Self {
        Self {
            database_url: "postgres://bitbt:bitbt@127.0.0.1/bitbt_test".into(),
            port: 3100,
            session_ttl: Duration::from_secs(12 * 3600),
            login_rate_limit_max: 5,
            login_rate_limit_window: Duration::from_secs(900),
            contact_rate_limit_max: 10,
            contact_rate_limit_window: Duration::from_secs(600),
            verification_rate_limit_max: 30,
            verification_rate_limit_window: Duration::from_secs(60),
            contact_email: "support@bitbt.com".into(),
            smtp_user: String::new(),
            smtp_pass: String::new(),
            smtp_host: "smtpout.secureserver.net".into(),
        }
    }
}

fn parse_bounded_u32(name: &str, default: u32, min: u32, max: u32) -> Result<u32, String> {
    let raw = env::var(name).unwrap_or_else(|_| default.to_string());
    let value: u32 = raw
        .parse()
        .map_err(|_| format!("{name} must be a number"))?;
    if !(min..=max).contains(&value) {
        return Err(format!("{name} must be between {min} and {max}"));
    }
    Ok(value)
}

fn parse_bounded_u64(name: &str, default: u64, min: u64, max: u64) -> Result<u64, String> {
    let raw = env::var(name).unwrap_or_else(|_| default.to_string());
    let value: u64 = raw
        .parse()
        .map_err(|_| format!("{name} must be a number"))?;
    if !(min..=max).contains(&value) {
        return Err(format!("{name} must be between {min} and {max}"));
    }
    Ok(value)
}

fn validate_smtp_config(
    contact_email: &str,
    smtp_user: &str,
    smtp_pass: &str,
    smtp_host: &str,
) -> Result<(), String> {
    if !looks_like_email(contact_email) {
        return Err("CONTACT_EMAIL must be a valid email address".into());
    }

    let smtp_enabled = !smtp_user.is_empty() || !smtp_pass.is_empty();
    if !smtp_enabled {
        return Ok(());
    }

    if smtp_user.is_empty() || smtp_pass.is_empty() {
        return Err("SMTP_USER and SMTP_PASS must both be set to enable mail".into());
    }
    if !looks_like_email(smtp_user) {
        return Err("SMTP_USER must be a valid email address".into());
    }
    if smtp_host.trim().is_empty() || smtp_host.contains([' ', '\r', '\n']) {
        return Err("SMTP_HOST must be a non-empty hostname".into());
    }
    Ok(())
}

fn looks_like_email(value: &str) -> bool {
    let value = value.trim();
    if value.is_empty() || value.contains(['\r', '\n', ' ']) {
        return false;
    }
    let Some((local, domain)) = value.split_once('@') else {
        return false;
    };
    !local.is_empty() && domain.contains('.') && !domain.starts_with('.') && !domain.ends_with('.')
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Mutex;

    static ENV_LOCK: Mutex<()> = Mutex::new(());

    fn with_clean_env<F: FnOnce()>(f: F) {
        let _guard = ENV_LOCK.lock().unwrap();
        for key in [
            "DATABASE_URL",
            "PORT",
            "SESSION_TTL_HOURS",
            "LOGIN_RATE_LIMIT_MAX",
            "LOGIN_RATE_LIMIT_WINDOW_SECS",
            "CONTACT_RATE_LIMIT_MAX",
            "CONTACT_RATE_LIMIT_WINDOW_SECS",
            "VERIFICATION_RATE_LIMIT_MAX",
            "VERIFICATION_RATE_LIMIT_WINDOW_SECS",
            "CONTACT_EMAIL",
            "SMTP_USER",
            "SMTP_PASS",
            "SMTP_HOST",
        ] {
            env::remove_var(key);
        }
        f();
    }

    #[test]
    fn requires_database_url() {
        with_clean_env(|| {
            let err = Config::from_env().err().expect("should fail");
            assert!(err.contains("DATABASE_URL"));
        });
    }

    #[test]
    fn rejects_empty_database_url() {
        with_clean_env(|| {
            env::set_var("DATABASE_URL", "   ");
            let err = Config::from_env().err().expect("should fail");
            assert!(err.contains("empty"));
        });
    }

    #[test]
    fn rejects_session_ttl_over_12_hours() {
        with_clean_env(|| {
            env::set_var("DATABASE_URL", "postgres://u:p@localhost/db");
            env::set_var("SESSION_TTL_HOURS", "24");
            let err = Config::from_env().err().expect("should fail");
            assert!(err.contains("SESSION_TTL_HOURS"));
        });
    }

    #[test]
    fn rejects_zero_login_window() {
        with_clean_env(|| {
            env::set_var("DATABASE_URL", "postgres://u:p@localhost/db");
            env::set_var("LOGIN_RATE_LIMIT_WINDOW_SECS", "0");
            let err = Config::from_env().err().expect("should fail");
            assert!(err.contains("LOGIN_RATE_LIMIT_WINDOW_SECS"));
        });
    }

    #[test]
    fn rejects_out_of_bounds_contact_rate_max() {
        with_clean_env(|| {
            env::set_var("DATABASE_URL", "postgres://u:p@localhost/db");
            env::set_var("CONTACT_RATE_LIMIT_MAX", "999");
            let err = Config::from_env().err().expect("should fail");
            assert!(err.contains("CONTACT_RATE_LIMIT_MAX"));
        });
    }

    #[test]
    fn rejects_partial_smtp_config() {
        with_clean_env(|| {
            env::set_var("DATABASE_URL", "postgres://u:p@localhost/db");
            env::set_var("SMTP_USER", "noreply@bitbt.com");
            let err = Config::from_env().err().expect("should fail");
            assert!(err.contains("SMTP_USER and SMTP_PASS"));
        });
    }

    #[test]
    fn loads_defaults_when_optional_env_missing() {
        with_clean_env(|| {
            env::set_var("DATABASE_URL", "postgres://u:p@localhost/db");
            let cfg = Config::from_env().unwrap();
            assert_eq!(cfg.port, 3100);
            assert_eq!(cfg.session_ttl, Duration::from_secs(12 * 3600));
            assert_eq!(cfg.login_rate_limit_max, 5);
            assert_eq!(cfg.login_rate_limit_window, Duration::from_secs(900));
            assert_eq!(cfg.contact_rate_limit_max, 10);
            assert_eq!(cfg.contact_rate_limit_window, Duration::from_secs(600));
            assert_eq!(cfg.verification_rate_limit_max, 30);
            assert_eq!(cfg.verification_rate_limit_window, Duration::from_secs(60));
            assert_eq!(cfg.smtp_host, "smtpout.secureserver.net");
            assert!(cfg.smtp_pass.is_empty());
        });
    }

    #[test]
    fn looks_like_email_basic() {
        assert!(looks_like_email("support@bitbt.com"));
        assert!(!looks_like_email("not-an-email"));
        assert!(!looks_like_email("a@b"));
        assert!(!looks_like_email("bad\n@bitbt.com"));
    }
}
