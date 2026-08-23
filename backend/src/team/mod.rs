//! Team members — public read + admin CRUD / reorder.

mod validation;

pub use validation::{validate_member_input, validate_reorder, Locale, MemberInput};

use crate::auth::require_admin;
use crate::error::ApiError;
use crate::state::AppState;
use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
use axum::Json;
use axum_extra::extract::CookieJar;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::Row;

#[derive(Debug, Deserialize)]
pub struct TeamLocaleQuery {
    pub locale: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct PublicTeamMember {
    pub id: i64,
    pub name: String,
    pub role: String,
    pub tags: Vec<String>,
    pub sort_order: i32,
}

#[derive(Debug, Serialize)]
pub struct PublicTeamResponse {
    pub items: Vec<PublicTeamMember>,
}

#[derive(Debug, Serialize)]
pub struct AdminTeamMember {
    pub id: i64,
    pub name: String,
    pub role_en: String,
    pub role_zh: String,
    pub tags_en: Vec<String>,
    pub tags_zh: Vec<String>,
    pub sort_order: i32,
    pub is_active: bool,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Serialize)]
pub struct AdminTeamListResponse {
    pub items: Vec<AdminTeamMember>,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct CreateTeamMemberRequest {
    pub name: String,
    pub role_en: String,
    pub role_zh: String,
    #[serde(default)]
    pub tags_en: Vec<String>,
    #[serde(default)]
    pub tags_zh: Vec<String>,
    pub sort_order: Option<i32>,
    pub is_active: Option<bool>,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct UpdateTeamMemberRequest {
    pub name: String,
    pub role_en: String,
    pub role_zh: String,
    #[serde(default)]
    pub tags_en: Vec<String>,
    #[serde(default)]
    pub tags_zh: Vec<String>,
    pub sort_order: i32,
    pub is_active: bool,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ReorderRequest {
    pub ids: Vec<i64>,
}

pub async fn list_public(
    State(state): State<AppState>,
    Query(query): Query<TeamLocaleQuery>,
) -> Result<Json<PublicTeamResponse>, ApiError> {
    let locale = Locale::parse(query.locale.as_deref())?;

    let rows = sqlx::query(
        r#"
        SELECT id, name, role_en, role_zh, tags_en, tags_zh, sort_order
        FROM team_members
        WHERE is_active = TRUE
        ORDER BY sort_order ASC, id ASC
        "#,
    )
    .fetch_all(&state.pool)
    .await
    .map_err(|e| {
        eprintln!("public team list error: {e}");
        ApiError::internal("internal error")
    })?;

    let items = rows
        .into_iter()
        .map(|row| {
            let (role, tags) = match locale {
                Locale::En => (
                    row.get::<String, _>("role_en"),
                    row.get::<Vec<String>, _>("tags_en"),
                ),
                Locale::Zh => (
                    row.get::<String, _>("role_zh"),
                    row.get::<Vec<String>, _>("tags_zh"),
                ),
            };
            PublicTeamMember {
                id: row.get("id"),
                name: row.get("name"),
                role,
                tags,
                sort_order: row.get("sort_order"),
            }
        })
        .collect();

    Ok(Json(PublicTeamResponse { items }))
}

pub async fn list_admin(
    State(state): State<AppState>,
    jar: CookieJar,
) -> Result<Json<AdminTeamListResponse>, ApiError> {
    require_admin(&state, &jar).await?;
    let items = fetch_all_admin_members(&state).await?;
    Ok(Json(AdminTeamListResponse { items }))
}

pub async fn create_admin(
    State(state): State<AppState>,
    jar: CookieJar,
    Json(body): Json<CreateTeamMemberRequest>,
) -> Result<(StatusCode, Json<AdminTeamMember>), ApiError> {
    require_admin(&state, &jar).await?;

    let input = MemberInput {
        name: body.name,
        role_en: body.role_en,
        role_zh: body.role_zh,
        tags_en: body.tags_en,
        tags_zh: body.tags_zh,
        sort_order: body.sort_order,
        is_active: body.is_active,
    };
    let validated = validate_member_input(&input, true)?;

    let sort_order = match validated.sort_order {
        Some(o) => o,
        None => next_sort_order(&state).await?,
    };
    let is_active = validated.is_active.unwrap_or(true);

    let row = sqlx::query(
        r#"
        INSERT INTO team_members
            (name, role_en, role_zh, tags_en, tags_zh, sort_order, is_active)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING id, name, role_en, role_zh, tags_en, tags_zh, sort_order, is_active,
                  created_at, updated_at
        "#,
    )
    .bind(&validated.name)
    .bind(&validated.role_en)
    .bind(&validated.role_zh)
    .bind(&validated.tags_en)
    .bind(&validated.tags_zh)
    .bind(sort_order)
    .bind(is_active)
    .fetch_one(&state.pool)
    .await
    .map_err(|e| map_db_error(e, "create team member"))?;

    Ok((StatusCode::CREATED, Json(map_admin_row(row))))
}

pub async fn update_admin(
    State(state): State<AppState>,
    jar: CookieJar,
    Path(id): Path<i64>,
    Json(body): Json<UpdateTeamMemberRequest>,
) -> Result<Json<AdminTeamMember>, ApiError> {
    require_admin(&state, &jar).await?;

    let input = MemberInput {
        name: body.name,
        role_en: body.role_en,
        role_zh: body.role_zh,
        tags_en: body.tags_en,
        tags_zh: body.tags_zh,
        sort_order: Some(body.sort_order),
        is_active: Some(body.is_active),
    };
    let validated = validate_member_input(&input, false)?;

    let row = sqlx::query(
        r#"
        UPDATE team_members
        SET name = $1,
            role_en = $2,
            role_zh = $3,
            tags_en = $4,
            tags_zh = $5,
            sort_order = $6,
            is_active = $7,
            updated_at = NOW()
        WHERE id = $8
        RETURNING id, name, role_en, role_zh, tags_en, tags_zh, sort_order, is_active,
                  created_at, updated_at
        "#,
    )
    .bind(&validated.name)
    .bind(&validated.role_en)
    .bind(&validated.role_zh)
    .bind(&validated.tags_en)
    .bind(&validated.tags_zh)
    .bind(validated.sort_order.expect("sort_order required on update"))
    .bind(validated.is_active.unwrap_or(true))
    .bind(id)
    .fetch_optional(&state.pool)
    .await
    .map_err(|e| map_db_error(e, "update team member"))?;

    let Some(row) = row else {
        return Err(ApiError::not_found("team member not found"));
    };

    Ok(Json(map_admin_row(row)))
}

pub async fn delete_admin(
    State(state): State<AppState>,
    jar: CookieJar,
    Path(id): Path<i64>,
) -> Result<StatusCode, ApiError> {
    require_admin(&state, &jar).await?;

    let result = sqlx::query("DELETE FROM team_members WHERE id = $1")
        .bind(id)
        .execute(&state.pool)
        .await
        .map_err(|e| {
            eprintln!("delete team member error: {e}");
            ApiError::internal("internal error")
        })?;

    if result.rows_affected() == 0 {
        return Err(ApiError::not_found("team member not found"));
    }

    Ok(StatusCode::NO_CONTENT)
}

pub async fn reorder_admin(
    State(state): State<AppState>,
    jar: CookieJar,
    Json(body): Json<ReorderRequest>,
) -> Result<Json<AdminTeamListResponse>, ApiError> {
    require_admin(&state, &jar).await?;
    validate_reorder(&body.ids)?;

    let mut tx = state.pool.begin().await.map_err(|e| {
        eprintln!("reorder begin error: {e}");
        ApiError::internal("internal error")
    })?;

    let existing: Vec<i64> = sqlx::query_scalar("SELECT id FROM team_members ORDER BY id")
        .fetch_all(&mut *tx)
        .await
        .map_err(|e| {
            eprintln!("reorder list error: {e}");
            ApiError::internal("internal error")
        })?;

    if body.ids.len() != existing.len() {
        return Err(ApiError::bad_request(
            "ids must include every team member exactly once",
        ));
    }

    let mut sorted_req = body.ids.clone();
    let mut sorted_ex = existing.clone();
    sorted_req.sort_unstable();
    sorted_ex.sort_unstable();
    if sorted_req != sorted_ex {
        return Err(ApiError::bad_request(
            "ids must match the full set of team member ids",
        ));
    }

    for (index, id) in body.ids.iter().enumerate() {
        let sort_order = (index as i32) + 1;
        sqlx::query("UPDATE team_members SET sort_order = $1, updated_at = NOW() WHERE id = $2")
            .bind(sort_order)
            .bind(id)
            .execute(&mut *tx)
            .await
            .map_err(|e| {
                eprintln!("reorder update error: {e}");
                ApiError::internal("internal error")
            })?;
    }

    tx.commit().await.map_err(|e| {
        eprintln!("reorder commit error: {e}");
        ApiError::internal("internal error")
    })?;

    let items = fetch_all_admin_members(&state).await?;
    Ok(Json(AdminTeamListResponse { items }))
}

async fn next_sort_order(state: &AppState) -> Result<i32, ApiError> {
    let max: Option<i32> = sqlx::query_scalar("SELECT MAX(sort_order) FROM team_members")
        .fetch_one(&state.pool)
        .await
        .map_err(|e| {
            eprintln!("max sort_order error: {e}");
            ApiError::internal("internal error")
        })?;
    Ok(max.unwrap_or(0) + 1)
}

async fn fetch_all_admin_members(state: &AppState) -> Result<Vec<AdminTeamMember>, ApiError> {
    let rows = sqlx::query(
        r#"
        SELECT id, name, role_en, role_zh, tags_en, tags_zh, sort_order, is_active,
               created_at, updated_at
        FROM team_members
        ORDER BY sort_order ASC, id ASC
        "#,
    )
    .fetch_all(&state.pool)
    .await
    .map_err(|e| {
        eprintln!("admin team list error: {e}");
        ApiError::internal("internal error")
    })?;

    Ok(rows.into_iter().map(map_admin_row).collect())
}

fn map_admin_row(row: sqlx::postgres::PgRow) -> AdminTeamMember {
    AdminTeamMember {
        id: row.get("id"),
        name: row.get("name"),
        role_en: row.get("role_en"),
        role_zh: row.get("role_zh"),
        tags_en: row.get("tags_en"),
        tags_zh: row.get("tags_zh"),
        sort_order: row.get("sort_order"),
        is_active: row.get("is_active"),
        created_at: row.get("created_at"),
        updated_at: row.get("updated_at"),
    }
}

fn map_db_error(e: sqlx::Error, context: &str) -> ApiError {
    if let sqlx::Error::Database(db) = &e {
        if db.constraint().is_some_and(|c| c.contains("name")) {
            return ApiError::bad_request("team member name already exists");
        }
    }
    eprintln!("{context} error: {e}");
    ApiError::internal("internal error")
}
