use crate::error::ApiError;
use serde::Deserialize;

pub const NAME_MAX: usize = 100;
pub const ROLE_MAX: usize = 200;
pub const TAG_MAX: usize = 100;
pub const TAGS_MAX_COUNT: usize = 20;
pub const REORDER_MAX: usize = 200;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Locale {
    En,
    Zh,
}

impl Locale {
    pub fn parse(raw: Option<&str>) -> Result<Self, ApiError> {
        match raw.map(str::trim).filter(|s| !s.is_empty()) {
            None | Some("en") => Ok(Locale::En),
            Some("zh") => Ok(Locale::Zh),
            Some(_) => Err(ApiError::bad_request("locale must be 'zh' or 'en'")),
        }
    }
}

#[derive(Debug, Clone, Deserialize)]
pub struct MemberInput {
    pub name: String,
    pub role_en: String,
    pub role_zh: String,
    pub tags_en: Vec<String>,
    pub tags_zh: Vec<String>,
    pub sort_order: Option<i32>,
    pub is_active: Option<bool>,
}

#[derive(Debug, Clone)]
pub struct ValidatedMember {
    pub name: String,
    pub role_en: String,
    pub role_zh: String,
    pub tags_en: Vec<String>,
    pub tags_zh: Vec<String>,
    pub sort_order: Option<i32>,
    pub is_active: Option<bool>,
}

/// Validate team member create/update payload.
/// `allow_missing_sort` — create may omit sort_order (defaults to append).
pub fn validate_member_input(
    input: &MemberInput,
    allow_missing_sort: bool,
) -> Result<ValidatedMember, ApiError> {
    let name = normalize_required(&input.name, "name", NAME_MAX)?;
    let role_en = normalize_required(&input.role_en, "role_en", ROLE_MAX)?;
    let role_zh = normalize_required(&input.role_zh, "role_zh", ROLE_MAX)?;
    let tags_en = normalize_tags(&input.tags_en, "tags_en")?;
    let tags_zh = normalize_tags(&input.tags_zh, "tags_zh")?;

    let sort_order = match input.sort_order {
        Some(order) => {
            if order < 0 {
                return Err(ApiError::bad_request("sort_order must be >= 0"));
            }
            Some(order)
        }
        None if allow_missing_sort => None,
        None => return Err(ApiError::bad_request("sort_order is required")),
    };

    Ok(ValidatedMember {
        name,
        role_en,
        role_zh,
        tags_en,
        tags_zh,
        sort_order,
        is_active: input.is_active,
    })
}

pub fn validate_reorder(ids: &[i64]) -> Result<(), ApiError> {
    if ids.is_empty() {
        return Err(ApiError::bad_request("ids must not be empty"));
    }
    if ids.len() > REORDER_MAX {
        return Err(ApiError::bad_request("too many ids"));
    }
    let mut seen = std::collections::HashSet::with_capacity(ids.len());
    for id in ids {
        if *id <= 0 {
            return Err(ApiError::bad_request("ids must be positive"));
        }
        if !seen.insert(*id) {
            return Err(ApiError::bad_request("ids must be unique"));
        }
    }
    Ok(())
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
    Ok(trimmed.to_string())
}

fn normalize_tags(tags: &[String], field: &str) -> Result<Vec<String>, ApiError> {
    if tags.len() > TAGS_MAX_COUNT {
        return Err(ApiError::bad_request(format!(
            "{field} must have at most {TAGS_MAX_COUNT} items"
        )));
    }
    let mut out = Vec::with_capacity(tags.len());
    for tag in tags {
        let t = tag.trim();
        if t.is_empty() {
            return Err(ApiError::bad_request(format!(
                "{field} items must not be empty"
            )));
        }
        if t.chars().count() > TAG_MAX {
            return Err(ApiError::bad_request(format!(
                "{field} items must be at most {TAG_MAX} characters"
            )));
        }
        out.push(t.to_string());
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn valid_input() -> MemberInput {
        MemberInput {
            name: " Bryan ".into(),
            role_en: "CCO".into(),
            role_zh: "CCO".into(),
            tags_en: vec![
                "Business Development".into(),
                "Strategic Partnerships".into(),
            ],
            tags_zh: vec!["商务拓展".into(), "战略合作".into()],
            sort_order: Some(8),
            is_active: Some(true),
        }
    }

    #[test]
    fn accepts_valid_member() {
        let v = validate_member_input(&valid_input(), false).unwrap();
        assert_eq!(v.name, "Bryan");
        assert_eq!(v.tags_en.len(), 2);
    }

    #[test]
    fn rejects_empty_name() {
        let mut input = valid_input();
        input.name = "   ".into();
        let err = validate_member_input(&input, false).unwrap_err();
        assert_eq!(err.status, axum::http::StatusCode::BAD_REQUEST);
        assert!(err.message.contains("name"));
    }

    #[test]
    fn rejects_oversized_role() {
        let mut input = valid_input();
        input.role_en = "x".repeat(ROLE_MAX + 1);
        assert!(validate_member_input(&input, false).is_err());
    }

    #[test]
    fn rejects_too_many_tags() {
        let mut input = valid_input();
        input.tags_en = (0..=TAGS_MAX_COUNT).map(|i| format!("tag{i}")).collect();
        assert!(validate_member_input(&input, false).is_err());
    }

    #[test]
    fn create_allows_missing_sort_order() {
        let mut input = valid_input();
        input.sort_order = None;
        let v = validate_member_input(&input, true).unwrap();
        assert!(v.sort_order.is_none());
    }

    #[test]
    fn update_requires_sort_order() {
        let mut input = valid_input();
        input.sort_order = None;
        assert!(validate_member_input(&input, false).is_err());
    }

    #[test]
    fn locale_parse() {
        assert_eq!(Locale::parse(None).unwrap(), Locale::En);
        assert_eq!(Locale::parse(Some("en")).unwrap(), Locale::En);
        assert_eq!(Locale::parse(Some("zh")).unwrap(), Locale::Zh);
        assert!(Locale::parse(Some("fr")).is_err());
    }

    #[test]
    fn reorder_rejects_duplicates() {
        assert!(validate_reorder(&[1, 2, 2]).is_err());
        assert!(validate_reorder(&[]).is_err());
        assert!(validate_reorder(&[1, 2, 3]).is_ok());
    }

    #[test]
    fn create_request_rejects_image_fields() {
        // Phase 1 schema/API must not accept avatar/logo/image fields.
        let json = r#"{
            "name": "Bryan",
            "role_en": "CCO",
            "role_zh": "CCO",
            "tags_en": [],
            "tags_zh": [],
            "avatar_url": "https://example.com/a.png"
        }"#;
        let err = serde_json::from_str::<crate::team::CreateTeamMemberRequest>(json).unwrap_err();
        assert!(err.to_string().contains("unknown field") || err.to_string().contains("avatar"));
    }
}
