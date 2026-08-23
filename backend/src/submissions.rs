//! Read-only, authenticated access to contact submissions.

use crate::auth::require_admin;
use crate::error::ApiError;
use crate::state::AppState;
use axum::extract::{Query, State};
use axum::Json;
use axum_extra::extract::CookieJar;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::Row;

const DEFAULT_PAGE_SIZE: i64 = 20;
const MAX_PAGE_SIZE: i64 = 100;

#[derive(Debug, Default, Deserialize)]
pub struct SubmissionsQuery {
    pub page: Option<i64>,
    pub page_size: Option<i64>,
}

#[derive(Debug, PartialEq)]
struct Pagination {
    page: i64,
    page_size: i64,
    offset: i64,
}

#[derive(Debug, Serialize)]
pub struct Submission {
    pub id: i64,
    pub role: Option<String>,
    pub name: Option<String>,
    pub title: Option<String>,
    pub company: Option<String>,
    pub contact: Option<String>,
    pub social: Option<String>,
    pub intro: Option<String>,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Serialize)]
pub struct SubmissionsResponse {
    pub total: i64,
    pub page: i64,
    pub page_size: i64,
    pub items: Vec<Submission>,
}

pub async fn list_admin(
    State(state): State<AppState>,
    jar: CookieJar,
    Query(query): Query<SubmissionsQuery>,
) -> Result<Json<SubmissionsResponse>, ApiError> {
    require_admin(&state, &jar).await?;
    let pagination = validate_pagination(query)?;

    let total = sqlx::query_scalar::<_, i64>("SELECT COUNT(*)::bigint FROM submissions")
        .fetch_one(&state.pool)
        .await
        .map_err(|error| {
            eprintln!("submissions count error: {error}");
            ApiError::internal("internal error")
        })?;

    let rows = sqlx::query(
        r#"
        SELECT id::bigint AS id,
               role,
               name,
               title,
               company,
               contact,
               social,
               intro,
               created_at
        FROM submissions
        ORDER BY created_at DESC, id DESC
        LIMIT $1 OFFSET $2
        "#,
    )
    .bind(pagination.page_size)
    .bind(pagination.offset)
    .fetch_all(&state.pool)
    .await
    .map_err(|error| {
        eprintln!("submissions list error: {error}");
        ApiError::internal("internal error")
    })?;

    let items = rows
        .into_iter()
        .map(|row| Submission {
            id: row.get("id"),
            role: row.get("role"),
            name: row.get("name"),
            title: row.get("title"),
            company: row.get("company"),
            contact: row.get("contact"),
            social: row.get("social"),
            intro: row.get("intro"),
            created_at: row.get("created_at"),
        })
        .collect();

    Ok(Json(SubmissionsResponse {
        total,
        page: pagination.page,
        page_size: pagination.page_size,
        items,
    }))
}

fn validate_pagination(query: SubmissionsQuery) -> Result<Pagination, ApiError> {
    let page = query.page.unwrap_or(1);
    let page_size = query.page_size.unwrap_or(DEFAULT_PAGE_SIZE);

    if page < 1 {
        return Err(ApiError::bad_request("page must be at least 1"));
    }
    if !(1..=MAX_PAGE_SIZE).contains(&page_size) {
        return Err(ApiError::bad_request("page_size must be between 1 and 100"));
    }

    let offset = (page - 1)
        .checked_mul(page_size)
        .ok_or_else(|| ApiError::bad_request("page is too large"))?;

    Ok(Pagination {
        page,
        page_size,
        offset,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::http::StatusCode;

    #[test]
    fn pagination_defaults_to_first_page_and_twenty_items() {
        assert_eq!(
            validate_pagination(SubmissionsQuery::default()).unwrap(),
            Pagination {
                page: 1,
                page_size: 20,
                offset: 0,
            }
        );
    }

    #[test]
    fn pagination_calculates_offset() {
        assert_eq!(
            validate_pagination(SubmissionsQuery {
                page: Some(3),
                page_size: Some(50),
            })
            .unwrap(),
            Pagination {
                page: 3,
                page_size: 50,
                offset: 100,
            }
        );
    }

    #[test]
    fn pagination_rejects_page_below_one() {
        let error = validate_pagination(SubmissionsQuery {
            page: Some(0),
            page_size: None,
        })
        .unwrap_err();
        assert_eq!(error.status, StatusCode::BAD_REQUEST);
    }

    #[test]
    fn pagination_rejects_invalid_page_size() {
        for page_size in [0, 101] {
            let error = validate_pagination(SubmissionsQuery {
                page: None,
                page_size: Some(page_size),
            })
            .unwrap_err();
            assert_eq!(error.status, StatusCode::BAD_REQUEST);
        }
    }
}
