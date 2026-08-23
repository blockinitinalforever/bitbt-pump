//! Public contact form — validated insert + async SMTP notification.

use crate::error::ApiError;
use crate::state::AppState;
use axum::extract::{ConnectInfo, State};
use axum::http::{HeaderMap, StatusCode};
use axum::Json;
use lettre::{
    message::header::ContentType, transport::smtp::authentication::Credentials, AsyncSmtpTransport,
    AsyncTransport, Message, Tokio1Executor,
};
use serde::{Deserialize, Serialize};
use std::net::SocketAddr;
use std::sync::Arc;

pub const CONTACT_BODY_LIMIT_BYTES: usize = 32 * 1024;

const NAME_MAX: usize = 100;
const COMPANY_MAX: usize = 200;
const CONTACT_MAX: usize = 200;
const OPTIONAL_MAX: usize = 200;
const INTRO_MAX: usize = 2_000;

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct ContactForm {
    pub role: Option<String>,
    pub name: String,
    pub title: Option<String>,
    pub company: String,
    pub contact: String,
    pub social: Option<String>,
    pub intro: Option<String>,
}

#[derive(Debug, Clone)]
pub struct ValidatedContact {
    pub role: Option<String>,
    pub name: String,
    pub title: Option<String>,
    pub company: String,
    pub contact: String,
    pub social: Option<String>,
    pub intro: Option<String>,
}

pub async fn handle_contact(
    State(state): State<AppState>,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    headers: HeaderMap,
    Json(form): Json<ContactForm>,
) -> Result<StatusCode, ApiError> {
    let ip = crate::auth::client_ip(&headers, addr);
    if state.contact_limiter.is_limited(&ip) {
        return Err(ApiError::too_many_requests());
    }
    // Count every contact attempt (valid or not) toward the per-IP budget.
    state.contact_limiter.record_failure(&ip);

    let validated = validate_contact_form(&form)?;

    let result = sqlx::query(
        "INSERT INTO submissions (role, name, title, company, contact, social, intro) \
         VALUES ($1, $2, $3, $4, $5, $6, $7)",
    )
    .bind(&validated.role)
    .bind(&validated.name)
    .bind(&validated.title)
    .bind(&validated.company)
    .bind(&validated.contact)
    .bind(&validated.social)
    .bind(&validated.intro)
    .execute(&state.pool)
    .await;

    if let Err(e) = result {
        eprintln!("DB insert error: {e}");
        return Err(ApiError::internal("internal error"));
    }

    // SMTP is off the request critical path; DB insert already succeeded.
    maybe_spawn_contact_email(state.config.clone(), validated);

    Ok(StatusCode::OK)
}

pub fn validate_contact_form(form: &ContactForm) -> Result<ValidatedContact, ApiError> {
    Ok(ValidatedContact {
        role: normalize_optional(&form.role, "role", OPTIONAL_MAX)?,
        name: normalize_required(&form.name, "name", NAME_MAX)?,
        title: normalize_optional(&form.title, "title", OPTIONAL_MAX)?,
        company: normalize_required(&form.company, "company", COMPANY_MAX)?,
        contact: normalize_required(&form.contact, "contact", CONTACT_MAX)?,
        social: normalize_optional(&form.social, "social", OPTIONAL_MAX)?,
        intro: normalize_optional(&form.intro, "intro", INTRO_MAX)?,
    })
}

fn normalize_required(value: &str, field: &str, max: usize) -> Result<String, ApiError> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return Err(ApiError::bad_request(format!("{field} is required")));
    }
    if trimmed.chars().count() > max {
        return Err(ApiError::bad_request(format!(
            "{field} must be at most {max} characters"
        )));
    }
    if contains_control_chars(trimmed) {
        return Err(ApiError::bad_request(format!(
            "{field} contains invalid characters"
        )));
    }
    Ok(trimmed.to_string())
}

fn normalize_optional(
    value: &Option<String>,
    field: &str,
    max: usize,
) -> Result<Option<String>, ApiError> {
    match value {
        None => Ok(None),
        Some(raw) => {
            let trimmed = raw.trim();
            if trimmed.is_empty() {
                return Ok(None);
            }
            if trimmed.chars().count() > max {
                return Err(ApiError::bad_request(format!(
                    "{field} must be at most {max} characters"
                )));
            }
            if contains_control_chars(trimmed) {
                return Err(ApiError::bad_request(format!(
                    "{field} contains invalid characters"
                )));
            }
            Ok(Some(trimmed.to_string()))
        }
    }
}

fn contains_control_chars(value: &str) -> bool {
    value.chars().any(|c| c.is_control() && c != '\t')
}

/// Escape text for inclusion in HTML email bodies.
pub fn html_escape(value: &str) -> String {
    let mut out = String::with_capacity(value.len());
    for c in value.chars() {
        match c {
            '&' => out.push_str("&amp;"),
            '<' => out.push_str("&lt;"),
            '>' => out.push_str("&gt;"),
            '"' => out.push_str("&quot;"),
            '\'' => out.push_str("&#39;"),
            _ => out.push(c),
        }
    }
    out
}

/// Strip CR/LF (and other controls) from values used in email headers / subjects.
pub fn sanitize_header_text(value: &str) -> String {
    value
        .chars()
        .filter(|c| *c != '\r' && *c != '\n' && !c.is_control())
        .collect()
}

fn maybe_spawn_contact_email(config: Arc<crate::config::Config>, form: ValidatedContact) {
    if config.smtp_user.is_empty() || config.smtp_pass.is_empty() {
        return;
    }
    tokio::spawn(async move {
        if let Err(e) = send_contact_email(&config, &form).await {
            eprintln!("Email send error: {e}");
        }
    });
}

async fn send_contact_email(
    cfg: &crate::config::Config,
    form: &ValidatedContact,
) -> Result<(), String> {
    let body = format!(
        "<h2>New BitBT Application</h2>\
        <table style='border-collapse:collapse;width:100%;max-width:600px;'>\
        <tr><td style='padding:8px;border-bottom:1px solid #eee;font-weight:bold;width:120px;'>Role Type</td><td style='padding:8px;border-bottom:1px solid #eee;'>{}</td></tr>\
        <tr><td style='padding:8px;border-bottom:1px solid #eee;font-weight:bold;'>Name</td><td style='padding:8px;border-bottom:1px solid #eee;'>{}</td></tr>\
        <tr><td style='padding:8px;border-bottom:1px solid #eee;font-weight:bold;'>Title</td><td style='padding:8px;border-bottom:1px solid #eee;'>{}</td></tr>\
        <tr><td style='padding:8px;border-bottom:1px solid #eee;font-weight:bold;'>Company</td><td style='padding:8px;border-bottom:1px solid #eee;'>{}</td></tr>\
        <tr><td style='padding:8px;border-bottom:1px solid #eee;font-weight:bold;'>Contact</td><td style='padding:8px;border-bottom:1px solid #eee;'>{}</td></tr>\
        <tr><td style='padding:8px;border-bottom:1px solid #eee;font-weight:bold;'>Social</td><td style='padding:8px;border-bottom:1px solid #eee;'>{}</td></tr>\
        <tr><td style='padding:8px;font-weight:bold;vertical-align:top;'>Intro</td><td style='padding:8px;'>{}</td></tr>\
        </table>",
        html_escape(form.role.as_deref().unwrap_or("-")),
        html_escape(&form.name),
        html_escape(form.title.as_deref().unwrap_or("-")),
        html_escape(&form.company),
        html_escape(&form.contact),
        html_escape(form.social.as_deref().unwrap_or("-")),
        html_escape(form.intro.as_deref().unwrap_or("-")),
    );

    let subject = format!(
        "[BitBT] New Application: {} - {}",
        sanitize_header_text(&form.name),
        sanitize_header_text(&form.company)
    );

    let email = Message::builder()
        .from(
            cfg.smtp_user
                .parse()
                .map_err(|e| format!("invalid SMTP_USER: {e}"))?,
        )
        .to(cfg
            .contact_email
            .parse()
            .map_err(|e| format!("invalid CONTACT_EMAIL: {e}"))?)
        .subject(subject)
        .header(ContentType::TEXT_HTML)
        .body(body)
        .map_err(|e| format!("email build: {e}"))?;

    let creds = Credentials::new(cfg.smtp_user.clone(), cfg.smtp_pass.clone());
    let mailer = AsyncSmtpTransport::<Tokio1Executor>::relay(&cfg.smtp_host)
        .map_err(|e| format!("SMTP relay: {e}"))?
        .credentials(creds)
        .build();

    mailer
        .send(email)
        .await
        .map_err(|e| format!("SMTP send: {e}"))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn valid_form() -> ContactForm {
        ContactForm {
            role: Some("Founder".into()),
            name: "Ada".into(),
            title: Some("CEO".into()),
            company: "Acme".into(),
            contact: "ada@example.com".into(),
            social: Some("@ada".into()),
            intro: Some("Hello".into()),
        }
    }

    #[test]
    fn validate_accepts_valid_form() {
        let v = validate_contact_form(&valid_form()).unwrap();
        assert_eq!(v.name, "Ada");
    }

    #[test]
    fn validate_rejects_empty_name() {
        let mut form = valid_form();
        form.name = "  ".into();
        assert!(validate_contact_form(&form).is_err());
    }

    #[test]
    fn validate_rejects_oversized_intro() {
        let mut form = valid_form();
        form.intro = Some("x".repeat(INTRO_MAX + 1));
        assert!(validate_contact_form(&form).is_err());
    }

    #[test]
    fn validate_rejects_control_chars() {
        let mut form = valid_form();
        form.name = "Ada\u{0007}".into();
        assert!(validate_contact_form(&form).is_err());
    }

    #[test]
    fn deny_unknown_fields() {
        let json = r#"{"name":"Ada","company":"Acme","contact":"a@b.co","extra":1}"#;
        assert!(serde_json::from_str::<ContactForm>(json).is_err());
    }

    #[test]
    fn html_escape_encodes_markup() {
        assert_eq!(
            html_escape(r#"<a href="x">y's & z</a>"#),
            "&lt;a href=&quot;x&quot;&gt;y&#39;s &amp; z&lt;/a&gt;"
        );
    }

    #[test]
    fn sanitize_subject_strips_crlf() {
        assert_eq!(
            sanitize_header_text("Ada\r\nBcc: evil@example.com"),
            "AdaBcc: evil@example.com"
        );
    }
}
