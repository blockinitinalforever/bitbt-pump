//! Official identity verification — public lookup and authenticated CRUD.

use crate::auth::require_admin;
use crate::error::ApiError;
use crate::state::AppState;
use axum::extract::{ConnectInfo, Path, State};
use axum::http::{HeaderMap, StatusCode};
use axum::Json;
use axum_extra::extract::CookieJar;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::Row;
use std::net::SocketAddr;
use url::Url;

pub const VERIFICATION_BODY_LIMIT_BYTES: usize = 4 * 1024;
const VALUE_MAX: usize = 320;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ChannelType {
    Website,
    Telegram,
    Email,
    Phone,
    Linkedin,
    X,
}

impl ChannelType {
    pub fn parse(value: &str) -> Result<Self, ApiError> {
        match value.trim().to_ascii_lowercase().as_str() {
            "website" => Ok(Self::Website),
            "telegram" => Ok(Self::Telegram),
            "email" => Ok(Self::Email),
            "phone" => Ok(Self::Phone),
            "linkedin" => Ok(Self::Linkedin),
            "x" => Ok(Self::X),
            _ => Err(ApiError::bad_request("unsupported channel type")),
        }
    }

    pub fn as_str(self) -> &'static str {
        match self {
            Self::Website => "website",
            Self::Telegram => "telegram",
            Self::Email => "email",
            Self::Phone => "phone",
            Self::Linkedin => "linkedin",
            Self::X => "x",
        }
    }
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct VerifyRequest {
    #[serde(rename = "type")]
    pub channel_type: String,
    pub value: String,
}

#[derive(Debug, Serialize)]
pub struct VerifyResponse {
    pub available: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub official: Option<bool>,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct IdentityRequest {
    pub channel_type: String,
    pub value: String,
    pub is_active: Option<bool>,
}

#[derive(Debug, Serialize)]
pub struct OfficialIdentity {
    pub id: i64,
    pub channel_type: String,
    pub value: String,
    pub normalized_value: String,
    pub is_active: bool,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Serialize)]
pub struct IdentityListResponse {
    pub items: Vec<OfficialIdentity>,
}

pub async fn verify_public(
    State(state): State<AppState>,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    headers: HeaderMap,
    Json(body): Json<VerifyRequest>,
) -> Result<Json<VerifyResponse>, ApiError> {
    let ip = crate::auth::client_ip(&headers, addr);
    if state.verification_limiter.is_limited(&ip) {
        return Err(ApiError::too_many_requests());
    }
    state.verification_limiter.record_failure(&ip);

    let channel = ChannelType::parse(&body.channel_type)?;
    let available = sqlx::query_scalar::<_, bool>(
        "SELECT EXISTS(SELECT 1 FROM official_identities WHERE channel_type = $1)",
    )
    .bind(channel.as_str())
    .fetch_one(&state.pool)
    .await
    .map_err(|error| {
        eprintln!("official identity availability error: {error}");
        ApiError::internal("internal error")
    })?;

    if !available {
        return Ok(Json(VerifyResponse {
            available: false,
            official: None,
        }));
    }

    // Invalid shapes never match an official identity; keep the response
    // contract instead of surfacing a 400 to the public tool.
    let Ok(normalized) = normalize_identity(channel, &body.value) else {
        return Ok(Json(VerifyResponse {
            available: true,
            official: Some(false),
        }));
    };

    let official = sqlx::query_scalar::<_, bool>(
        r#"
        SELECT EXISTS(
            SELECT 1 FROM official_identities
            WHERE channel_type = $1 AND normalized_value = $2 AND is_active = TRUE
        )
        "#,
    )
    .bind(channel.as_str())
    .bind(&normalized)
    .fetch_one(&state.pool)
    .await
    .map_err(|error| {
        eprintln!("official identity lookup error: {error}");
        ApiError::internal("internal error")
    })?;

    Ok(Json(VerifyResponse {
        available: true,
        official: Some(official),
    }))
}

pub async fn list_admin(
    State(state): State<AppState>,
    jar: CookieJar,
) -> Result<Json<IdentityListResponse>, ApiError> {
    require_admin(&state, &jar).await?;
    let rows = sqlx::query(
        r#"
        SELECT id, channel_type, value, normalized_value, is_active, created_at, updated_at
        FROM official_identities
        ORDER BY channel_type ASC, value ASC, id ASC
        "#,
    )
    .fetch_all(&state.pool)
    .await
    .map_err(|error| {
        eprintln!("official identity list error: {error}");
        ApiError::internal("internal error")
    })?;
    Ok(Json(IdentityListResponse {
        items: rows.into_iter().map(map_identity).collect(),
    }))
}

pub async fn create_admin(
    State(state): State<AppState>,
    jar: CookieJar,
    Json(body): Json<IdentityRequest>,
) -> Result<(StatusCode, Json<OfficialIdentity>), ApiError> {
    require_admin(&state, &jar).await?;
    let channel = ChannelType::parse(&body.channel_type)?;
    let value = validate_display_value(&body.value)?;
    let normalized = normalize_identity(channel, &value)?;
    let row = sqlx::query(
        r#"
        INSERT INTO official_identities
            (channel_type, value, normalized_value, is_active)
        VALUES ($1, $2, $3, $4)
        RETURNING id, channel_type, value, normalized_value, is_active, created_at, updated_at
        "#,
    )
    .bind(channel.as_str())
    .bind(&value)
    .bind(&normalized)
    .bind(body.is_active.unwrap_or(true))
    .fetch_one(&state.pool)
    .await
    .map_err(|error| map_db_error(error, "create official identity"))?;

    Ok((StatusCode::CREATED, Json(map_identity(row))))
}

pub async fn update_admin(
    State(state): State<AppState>,
    jar: CookieJar,
    Path(id): Path<i64>,
    Json(body): Json<IdentityRequest>,
) -> Result<Json<OfficialIdentity>, ApiError> {
    require_admin(&state, &jar).await?;
    let channel = ChannelType::parse(&body.channel_type)?;
    let value = validate_display_value(&body.value)?;
    let normalized = normalize_identity(channel, &value)?;
    let is_active = body
        .is_active
        .ok_or_else(|| ApiError::bad_request("is_active is required"))?;
    let row = sqlx::query(
        r#"
        UPDATE official_identities
        SET channel_type = $1,
            value = $2,
            normalized_value = $3,
            is_active = $4,
            updated_at = NOW()
        WHERE id = $5
        RETURNING id, channel_type, value, normalized_value, is_active, created_at, updated_at
        "#,
    )
    .bind(channel.as_str())
    .bind(&value)
    .bind(&normalized)
    .bind(is_active)
    .bind(id)
    .fetch_optional(&state.pool)
    .await
    .map_err(|error| map_db_error(error, "update official identity"))?;

    let Some(row) = row else {
        return Err(ApiError::not_found("official identity not found"));
    };
    Ok(Json(map_identity(row)))
}

pub async fn delete_admin(
    State(state): State<AppState>,
    jar: CookieJar,
    Path(id): Path<i64>,
) -> Result<StatusCode, ApiError> {
    require_admin(&state, &jar).await?;
    let result = sqlx::query("DELETE FROM official_identities WHERE id = $1")
        .bind(id)
        .execute(&state.pool)
        .await
        .map_err(|error| {
            eprintln!("delete official identity error: {error}");
            ApiError::internal("internal error")
        })?;
    if result.rows_affected() == 0 {
        return Err(ApiError::not_found("official identity not found"));
    }
    Ok(StatusCode::NO_CONTENT)
}

pub fn normalize_identity(channel: ChannelType, raw: &str) -> Result<String, ApiError> {
    let value = validate_display_value(raw)?.to_ascii_lowercase();
    let normalized = match channel {
        ChannelType::Website => normalize_website(&value)?,
        ChannelType::Telegram => {
            normalize_social(&value, &["t.me", "telegram.me"], SocialKind::Telegram)?
        }
        ChannelType::X => normalize_social(&value, &["x.com", "twitter.com"], SocialKind::X)?,
        ChannelType::Linkedin => normalize_social(&value, &["linkedin.com"], SocialKind::Linkedin)?,
        ChannelType::Email => {
            let email = value.strip_prefix("mailto:").unwrap_or(&value);
            if !is_valid_email(email) {
                return Err(ApiError::bad_request("invalid email address"));
            }
            email.to_string()
        }
        ChannelType::Phone => normalize_phone(&value)?,
    };
    if normalized.is_empty() {
        return Err(ApiError::bad_request("invalid identity value"));
    }
    Ok(normalized)
}

fn validate_display_value(raw: &str) -> Result<String, ApiError> {
    let value = raw.trim();
    if value.is_empty() {
        return Err(ApiError::bad_request("value is required"));
    }
    if value.chars().count() > VALUE_MAX {
        return Err(ApiError::bad_request(
            "value must be at most 320 characters",
        ));
    }
    if value.chars().any(char::is_control) {
        return Err(ApiError::bad_request("value contains invalid characters"));
    }
    Ok(value.to_string())
}

fn normalize_website(value: &str) -> Result<String, ApiError> {
    let candidate = if value.starts_with("http://") || value.starts_with("https://") {
        value.to_string()
    } else {
        format!("https://{value}")
    };
    let url = Url::parse(&candidate).map_err(|_| ApiError::bad_request("invalid website"))?;
    let host = url
        .host_str()
        .ok_or_else(|| ApiError::bad_request("invalid website"))?
        .trim_end_matches('.')
        .strip_prefix("www.")
        .unwrap_or_else(|| url.host_str().unwrap_or_default().trim_end_matches('.'));
    if !host.contains('.') || host.chars().any(char::is_whitespace) {
        return Err(ApiError::bad_request("invalid website"));
    }
    Ok(host.to_string())
}

#[derive(Clone, Copy)]
enum SocialKind {
    Telegram,
    Linkedin,
    X,
}

fn normalize_social(
    value: &str,
    allowed_hosts: &[&str],
    kind: SocialKind,
) -> Result<String, ApiError> {
    let starts_with_host = allowed_hosts
        .iter()
        .any(|host| value.starts_with(&format!("{host}/")));
    if value.starts_with("http://") || value.starts_with("https://") || starts_with_host {
        let candidate = if value.starts_with("http://") || value.starts_with("https://") {
            value.to_string()
        } else {
            format!("https://{value}")
        };
        let url =
            Url::parse(&candidate).map_err(|_| ApiError::bad_request("invalid social account"))?;
        let host = url
            .host_str()
            .unwrap_or_default()
            .trim_start_matches("www.");
        if !allowed_hosts.contains(&host) {
            return Err(ApiError::bad_request("invalid social account host"));
        }
        let segments: Vec<&str> = url
            .path_segments()
            .map(|parts| parts.filter(|part| !part.is_empty()).collect())
            .unwrap_or_default();
        return match kind {
            SocialKind::Telegram => {
                let index = usize::from(segments.first() == Some(&"s"));
                validate_social_handle(
                    segments.get(index).copied().unwrap_or_default(),
                    SocialKind::Telegram,
                )
            }
            SocialKind::X => {
                if segments.first() == Some(&"intent") && segments.get(1) == Some(&"user") {
                    let screen_name = url
                        .query_pairs()
                        .find(|(key, _)| key == "screen_name")
                        .map(|(_, value)| value.into_owned())
                        .unwrap_or_default();
                    validate_social_handle(&screen_name, SocialKind::X)
                } else {
                    validate_social_handle(
                        segments.first().copied().unwrap_or_default(),
                        SocialKind::X,
                    )
                }
            }
            SocialKind::Linkedin => validate_linkedin_path(&segments),
        };
    }
    validate_social_handle(value, kind)
}

fn normalize_phone(value: &str) -> Result<String, ApiError> {
    let phone = value.strip_prefix("tel:").unwrap_or(value).trim();
    if phone.is_empty() {
        return Err(ApiError::bad_request("invalid phone number"));
    }

    let mut digits = String::with_capacity(phone.len());
    let mut started_digits = false;
    for (index, ch) in phone.chars().enumerate() {
        match ch {
            '0'..='9' => {
                digits.push(ch);
                started_digits = true;
            }
            '+' if index == 0 && !started_digits => {}
            ' ' | '-' | '(' | ')' if started_digits || index == 0 => {}
            _ => return Err(ApiError::bad_request("invalid phone number")),
        }
    }

    if !(8..=15).contains(&digits.len()) {
        return Err(ApiError::bad_request("invalid phone number"));
    }
    Ok(digits)
}

fn validate_social_handle(value: &str, kind: SocialKind) -> Result<String, ApiError> {
    let trimmed = value.trim().trim_end_matches('/');
    let handle = match trimmed.strip_prefix('@') {
        Some(rest) if !rest.starts_with('@') => rest,
        None => trimmed,
        Some(_) => return Err(ApiError::bad_request("invalid social account")),
    };

    if handle.is_empty() || handle.chars().any(char::is_whitespace) {
        return Err(ApiError::bad_request("invalid social account"));
    }

    match kind {
        SocialKind::Telegram => {
            // Telegram usernames: 5-32 chars, letters/digits/underscore, start with letter.
            if !(5..=32).contains(&handle.len())
                || !handle.chars().next().is_some_and(|c| c.is_ascii_alphabetic())
                || !handle
                    .chars()
                    .all(|c| c.is_ascii_alphanumeric() || c == '_')
            {
                return Err(ApiError::bad_request("invalid telegram account"));
            }
        }
        SocialKind::X => {
            // X usernames: 1-15 chars, letters/digits/underscore.
            if !(1..=15).contains(&handle.len())
                || !handle
                    .chars()
                    .all(|c| c.is_ascii_alphanumeric() || c == '_')
            {
                return Err(ApiError::bad_request("invalid x account"));
            }
        }
        SocialKind::Linkedin => {
            return validate_linkedin_path(
                &handle
                    .split('/')
                    .filter(|part| !part.is_empty())
                    .collect::<Vec<_>>(),
            );
        }
    }

    Ok(handle.to_string())
}

fn validate_linkedin_path(segments: &[&str]) -> Result<String, ApiError> {
    if segments.is_empty() || segments.len() > 3 {
        return Err(ApiError::bad_request("invalid linkedin account"));
    }

    let path = segments.join("/");
    let valid = match segments[0] {
        "in" | "company" | "school" if segments.len() == 2 => segments[1]
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | '.')),
        _ if segments.len() == 1 => segments[0]
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | '.')),
        _ => false,
    };

    if !valid || path.chars().any(char::is_whitespace) {
        return Err(ApiError::bad_request("invalid linkedin account"));
    }
    Ok(path)
}

fn is_valid_email(value: &str) -> bool {
    if value.contains([' ', '\r', '\n']) {
        return false;
    }
    let Some((local, domain)) = value.split_once('@') else {
        return false;
    };
    !local.is_empty()
        && !domain.is_empty()
        && !domain.contains('@')
        && domain.contains('.')
        && !domain.starts_with('.')
        && !domain.ends_with('.')
}

fn map_identity(row: sqlx::postgres::PgRow) -> OfficialIdentity {
    OfficialIdentity {
        id: row.get("id"),
        channel_type: row.get("channel_type"),
        value: row.get("value"),
        normalized_value: row.get("normalized_value"),
        is_active: row.get("is_active"),
        created_at: row.get("created_at"),
        updated_at: row.get("updated_at"),
    }
}

fn map_db_error(error: sqlx::Error, context: &str) -> ApiError {
    if let sqlx::Error::Database(database) = &error {
        if database
            .constraint()
            .is_some_and(|constraint| constraint.contains("channel_normalized"))
        {
            return ApiError::bad_request("official identity already exists");
        }
    }
    eprintln!("{context} error: {error}");
    ApiError::internal("internal error")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn should_normalize_telegram_handle_and_links() {
        assert_eq!(
            normalize_identity(ChannelType::Telegram, "@BitBTVentures").unwrap(),
            "bitbtventures"
        );
        assert_eq!(
            normalize_identity(ChannelType::Telegram, "https://t.me/BitBTVentures").unwrap(),
            "bitbtventures"
        );
        assert_eq!(
            normalize_identity(ChannelType::Telegram, "https://t.me/s/BitBTVentures").unwrap(),
            "bitbtventures"
        );
    }

    #[test]
    fn should_normalize_email_website_phone_and_x() {
        assert_eq!(
            normalize_identity(ChannelType::Email, "mailto:Admin@BitBT.com").unwrap(),
            "admin@bitbt.com"
        );
        assert_eq!(
            normalize_identity(ChannelType::Website, "https://www.BitBT.com/path").unwrap(),
            "bitbt.com"
        );
        assert_eq!(
            normalize_identity(ChannelType::Phone, "tel:+1 (212) 555-0100").unwrap(),
            "12125550100"
        );
        assert_eq!(
            normalize_identity(ChannelType::X, "https://x.com/0xcryptolin").unwrap(),
            "0xcryptolin"
        );
    }

    #[test]
    fn should_reject_invalid_or_empty_identity_values() {
        assert!(normalize_identity(ChannelType::Website, "not a host").is_err());
        assert!(normalize_identity(ChannelType::Email, "not-an-email").is_err());
        assert!(normalize_identity(ChannelType::Phone, "abc").is_err());
        assert!(normalize_identity(ChannelType::Telegram, "  ").is_err());
    }

    #[test]
    fn should_reject_malicious_phone_and_social_prefix_injection() {
        assert!(normalize_identity(ChannelType::Phone, "scammer: +1 (212) 555-0100").is_err());
        assert!(normalize_identity(ChannelType::Phone, "tel:abc12125550100").is_err());
        assert!(normalize_identity(ChannelType::Telegram, "@@@aaa").is_err());
        assert!(normalize_identity(ChannelType::Telegram, "https://evil.example/aaa").is_err());
        assert!(normalize_identity(ChannelType::X, "bitbt ventures").is_err());
        assert!(normalize_identity(ChannelType::X, "toolonghandle012345").is_err());
    }

    #[test]
    fn should_parse_only_supported_channel_types() {
        assert_eq!(
            ChannelType::parse("telegram").unwrap(),
            ChannelType::Telegram
        );
        assert_eq!(ChannelType::parse("X").unwrap(), ChannelType::X);
        assert!(ChannelType::parse("discord").is_err());
    }
}
