use cookie::{Cookie, SameSite};
use rand::RngCore;
use sha2::{Digest, Sha256};
use std::time::Duration;

pub const SESSION_COOKIE_NAME: &str = "bitbt_admin_session";

/// Generate a CSPRNG session token and its SHA-256 hex hash for DB storage.
pub fn issue_session_token() -> (String, String) {
    let mut bytes = [0u8; 32];
    rand::thread_rng().fill_bytes(&mut bytes);
    let raw = hex::encode(bytes);
    let hash = hash_session_token(&raw);
    (raw, hash)
}

pub fn hash_session_token(raw_token: &str) -> String {
    let digest = Sha256::digest(raw_token.as_bytes());
    hex::encode(digest)
}

pub fn session_cookie(raw_token: &str, ttl: Duration) -> Cookie<'static> {
    let mut cookie = Cookie::new(SESSION_COOKIE_NAME, raw_token.to_string());
    cookie.set_http_only(true);
    cookie.set_secure(true);
    cookie.set_same_site(SameSite::Strict);
    cookie.set_path("/");
    cookie.set_max_age(cookie::time::Duration::seconds(ttl.as_secs() as i64));
    cookie
}

pub fn clear_session_cookie() -> Cookie<'static> {
    let mut cookie = Cookie::new(SESSION_COOKIE_NAME, "");
    cookie.set_http_only(true);
    cookie.set_secure(true);
    cookie.set_same_site(SameSite::Strict);
    cookie.set_path("/");
    cookie.set_max_age(cookie::time::Duration::seconds(0));
    cookie
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn issued_token_hashes_stably() {
        let (raw, hash) = issue_session_token();
        assert_eq!(raw.len(), 64);
        assert_eq!(hash, hash_session_token(&raw));
        assert_ne!(raw, hash);
    }

    #[test]
    fn tokens_are_unique() {
        let (a, _) = issue_session_token();
        let (b, _) = issue_session_token();
        assert_ne!(a, b);
    }

    #[test]
    fn session_cookie_is_secure() {
        let cookie = session_cookie("abc", Duration::from_secs(3600));
        assert_eq!(cookie.name(), SESSION_COOKIE_NAME);
        assert!(cookie.http_only().unwrap_or(false));
        assert!(cookie.secure().unwrap_or(false));
        assert_eq!(cookie.same_site(), Some(SameSite::Strict));
        assert_eq!(cookie.path(), Some("/"));
    }

    #[test]
    fn clear_cookie_expires_immediately() {
        let cookie = clear_session_cookie();
        assert_eq!(cookie.max_age(), Some(cookie::time::Duration::seconds(0)));
    }
}
