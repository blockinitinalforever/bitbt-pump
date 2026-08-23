//! Admin authentication: password hashing, sessions, handlers.

mod password;
mod session;

pub use password::{hash_password, verify_password, DUMMY_PASSWORD_HASH};
pub use session::{
    clear_session_cookie, hash_session_token, issue_session_token, session_cookie,
    SESSION_COOKIE_NAME,
};

use crate::error::ApiError;
use crate::state::AppState;
use axum::extract::{ConnectInfo, State};
use axum::http::{HeaderMap, StatusCode};
use axum::response::IntoResponse;
use axum::Json;
use axum_extra::extract::CookieJar;
use chrono::{Duration as ChronoDuration, Utc};
use serde::{Deserialize, Serialize};
use sqlx::Row;
use std::net::{IpAddr, SocketAddr};

pub const ADMIN_USERNAME: &str = "admin";
pub const USERNAME_MAX: usize = 64;
pub const PASSWORD_MAX: usize = 256;

/// Same-origin admin SPA origin(s). Mutations require Origin to match when present.
pub const ADMIN_ORIGINS: &[&str] = &["https://admin.bitbt.com"];

#[derive(Debug, Deserialize)]
pub struct LoginRequest {
    pub username: String,
    pub password: String,
}

#[derive(Debug, Serialize)]
pub struct SessionResponse {
    pub authenticated: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub username: Option<String>,
}

pub async fn login(
    State(state): State<AppState>,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    headers: HeaderMap,
    jar: CookieJar,
    Json(body): Json<LoginRequest>,
) -> Result<impl IntoResponse, ApiError> {
    require_admin_origin(&headers)?;

    let ip = client_ip(&headers, addr);
    if state.login_limiter.is_limited(&ip) {
        return Err(ApiError::too_many_requests());
    }

    let username = body.username.trim();
    if username.is_empty()
        || body.password.is_empty()
        || username.chars().count() > USERNAME_MAX
        || body.password.chars().count() > PASSWORD_MAX
    {
        let _ = verify_password(&body.password, &DUMMY_PASSWORD_HASH);
        state.login_limiter.record_failure(&ip);
        return Err(ApiError::unauthorized());
    }

    let row = if username == ADMIN_USERNAME {
        sqlx::query("SELECT id, password_hash FROM admins WHERE username = $1")
            .bind(ADMIN_USERNAME)
            .fetch_optional(&state.pool)
            .await
            .map_err(|e| {
                eprintln!("login db error: {e}");
                ApiError::internal("internal error")
            })?
    } else {
        None
    };

    let (admin_id, password_hash) = match row {
        Some(row) => {
            let id: i64 = row.get("id");
            let hash: String = row.get("password_hash");
            (Some(id), hash)
        }
        None => (None, DUMMY_PASSWORD_HASH.clone()),
    };

    if !verify_password(&body.password, &password_hash) || admin_id.is_none() {
        state.login_limiter.record_failure(&ip);
        return Err(ApiError::unauthorized());
    }

    let admin_id = admin_id.expect("checked above");
    let (raw_token, token_hash) = issue_session_token();
    let ttl = ChronoDuration::from_std(state.config.session_ttl)
        .map_err(|_| ApiError::internal("invalid session ttl"))?;
    let expires_at = Utc::now() + ttl;

    sqlx::query(
        "INSERT INTO admin_sessions (admin_id, token_hash, expires_at) VALUES ($1, $2, $3)",
    )
    .bind(admin_id)
    .bind(&token_hash)
    .bind(expires_at)
    .execute(&state.pool)
    .await
    .map_err(|e| {
        eprintln!("session insert error: {e}");
        ApiError::internal("internal error")
    })?;

    let cookie = session_cookie(&raw_token, state.config.session_ttl);
    let jar = jar.add(cookie);

    Ok((
        StatusCode::OK,
        jar,
        Json(SessionResponse {
            authenticated: true,
            username: Some(ADMIN_USERNAME.to_string()),
        }),
    ))
}

pub async fn logout(
    State(state): State<AppState>,
    headers: HeaderMap,
    jar: CookieJar,
) -> Result<impl IntoResponse, ApiError> {
    require_admin_origin(&headers)?;

    if let Some(token) = jar.get(SESSION_COOKIE_NAME).map(|c| c.value().to_string()) {
        let token_hash = hash_session_token(&token);
        sqlx::query("DELETE FROM admin_sessions WHERE token_hash = $1")
            .bind(&token_hash)
            .execute(&state.pool)
            .await
            .map_err(|e| {
                eprintln!("logout session delete error: {e}");
                ApiError::internal("internal error")
            })?;
    }

    let jar = jar.add(clear_session_cookie());
    Ok((
        StatusCode::OK,
        jar,
        Json(SessionResponse {
            authenticated: false,
            username: None,
        }),
    ))
}

pub async fn session(
    State(state): State<AppState>,
    jar: CookieJar,
) -> Result<impl IntoResponse, ApiError> {
    let body = match require_admin(&state, &jar).await {
        Ok(admin) => SessionResponse {
            authenticated: true,
            username: Some(admin.username),
        },
        Err(_) => SessionResponse {
            authenticated: false,
            username: None,
        },
    };
    Ok((StatusCode::OK, Json(body)))
}

#[derive(Debug, Clone)]
pub struct AdminIdentity {
    pub id: i64,
    pub username: String,
}

/// Extract and validate the admin session from the cookie jar.
pub async fn require_admin(state: &AppState, jar: &CookieJar) -> Result<AdminIdentity, ApiError> {
    let token = jar
        .get(SESSION_COOKIE_NAME)
        .map(|c| c.value().to_string())
        .ok_or_else(ApiError::unauthorized)?;

    let token_hash = hash_session_token(&token);
    let now = Utc::now();

    let row = sqlx::query(
        r#"
        SELECT a.id, a.username
        FROM admin_sessions s
        JOIN admins a ON a.id = s.admin_id
        WHERE s.token_hash = $1 AND s.expires_at > $2
        "#,
    )
    .bind(&token_hash)
    .bind(now)
    .fetch_optional(&state.pool)
    .await
    .map_err(|e| {
        eprintln!("session lookup error: {e}");
        ApiError::internal("internal error")
    })?;

    let Some(row) = row else {
        return Err(ApiError::unauthorized());
    };

    Ok(AdminIdentity {
        id: row.get("id"),
        username: row.get("username"),
    })
}

/// Validate Origin for browser-initiated admin mutations.
///
/// Missing Origin is allowed for non-browser clients (curl, server-side ops,
/// same-origin requests that omit Origin). When Origin is present it must be
/// an exact match for the admin site. Prefer deploying admin behind same-origin
/// Nginx so browsers always send `https://admin.bitbt.com`.
pub fn require_admin_origin(headers: &HeaderMap) -> Result<(), ApiError> {
    match headers
        .get(axum::http::header::ORIGIN)
        .and_then(|v| v.to_str().ok())
    {
        None => Ok(()),
        Some(origin) if ADMIN_ORIGINS.contains(&origin) => Ok(()),
        Some(_) => Err(ApiError::forbidden("invalid origin")),
    }
}

/// Trust only a single valid `X-Real-IP` (set by Nginx from `$remote_addr`).
/// Do not trust client-controlled `X-Forwarded-For`.
pub fn client_ip(headers: &HeaderMap, addr: SocketAddr) -> String {
    if let Some(real_ip) = headers.get("x-real-ip").and_then(|v| v.to_str().ok()) {
        let candidate = real_ip.trim();
        if let Ok(ip) = candidate.parse::<IpAddr>() {
            return ip.to_string();
        }
    }
    addr.ip().to_string()
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::http::HeaderValue;

    #[test]
    fn client_ip_prefers_valid_x_real_ip() {
        let mut headers = HeaderMap::new();
        headers.insert("x-real-ip", HeaderValue::from_static("203.0.113.10"));
        headers.insert(
            "x-forwarded-for",
            HeaderValue::from_static("198.51.100.1, 10.0.0.1"),
        );
        let addr = "127.0.0.1:1234".parse().unwrap();
        assert_eq!(client_ip(&headers, addr), "203.0.113.10");
    }

    #[test]
    fn client_ip_ignores_spoofed_xff_and_invalid_real_ip() {
        let mut headers = HeaderMap::new();
        headers.insert("x-real-ip", HeaderValue::from_static("not-an-ip"));
        headers.insert("x-forwarded-for", HeaderValue::from_static("198.51.100.1"));
        let addr = "192.0.2.5:9999".parse().unwrap();
        assert_eq!(client_ip(&headers, addr), "192.0.2.5");
    }

    #[test]
    fn client_ip_falls_back_to_socket() {
        let headers = HeaderMap::new();
        let addr = "192.0.2.5:9999".parse().unwrap();
        assert_eq!(client_ip(&headers, addr), "192.0.2.5");
    }

    #[test]
    fn origin_allows_missing_and_admin() {
        let headers = HeaderMap::new();
        assert!(require_admin_origin(&headers).is_ok());

        let mut ok = HeaderMap::new();
        ok.insert(
            axum::http::header::ORIGIN,
            HeaderValue::from_static("https://admin.bitbt.com"),
        );
        assert!(require_admin_origin(&ok).is_ok());

        let mut bad = HeaderMap::new();
        bad.insert(
            axum::http::header::ORIGIN,
            HeaderValue::from_static("https://evil.example"),
        );
        assert_eq!(
            require_admin_origin(&bad).unwrap_err().status,
            StatusCode::FORBIDDEN
        );
    }

    #[test]
    fn dummy_hash_is_argon2id() {
        assert!(DUMMY_PASSWORD_HASH.starts_with("$argon2id$"));
        assert!(!verify_password("anything", &DUMMY_PASSWORD_HASH));
    }
}
