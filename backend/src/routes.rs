use crate::auth::{self, require_admin_origin};
use crate::contact::{self, CONTACT_BODY_LIMIT_BYTES};
use crate::error::ApiError;
use crate::state::AppState;
use crate::submissions;
use crate::team;
use crate::verification;
use axum::body::Body;
use axum::extract::DefaultBodyLimit;
use axum::http::{header, HeaderValue, Method, Request};
use axum::middleware::{from_fn, Next};
use axum::response::Response;
use axum::routing::{get, post, put};
use axum::Router;
use tower_http::cors::{AllowOrigin, CorsLayer};

/// Public browser origins allowed to call CORS-enabled public endpoints.
/// Admin APIs rely on same-origin Nginx proxy and do not get CORS headers.
const PUBLIC_ORIGINS: &[&str] = &["https://bitbt.com", "https://www.bitbt.com"];

pub fn build_router(state: AppState) -> Router {
    let cors = public_cors_layer();

    let public = Router::new()
        .route(
            "/api/contact",
            post(contact::handle_contact).layer(DefaultBodyLimit::max(CONTACT_BODY_LIMIT_BYTES)),
        )
        .route("/api/team", get(team::list_public))
        .route(
            "/api/official-verification",
            post(verification::verify_public).layer(DefaultBodyLimit::max(
                verification::VERIFICATION_BODY_LIMIT_BYTES,
            )),
        )
        .layer(cors);

    // Admin routes: same-origin via Nginx — no CORS layer (cookies stay first-party).
    let admin = Router::new()
        .route("/api/admin/login", post(auth::login))
        .route("/api/admin/logout", post(auth::logout))
        .route("/api/admin/session", get(auth::session))
        .route("/api/admin/submissions", get(submissions::list_admin))
        .route(
            "/api/admin/official-identities",
            get(verification::list_admin).post(verification::create_admin),
        )
        .route(
            "/api/admin/official-identities/{id}",
            put(verification::update_admin).delete(verification::delete_admin),
        )
        .route(
            "/api/admin/team",
            get(team::list_admin).post(team::create_admin),
        )
        .route("/api/admin/team/reorder", put(team::reorder_admin))
        .route(
            "/api/admin/team/{id}",
            put(team::update_admin).delete(team::delete_admin),
        )
        .layer(from_fn(admin_mutation_origin))
        .layer(DefaultBodyLimit::max(64 * 1024))
        // Outermost so Cache-Control applies even when origin middleware rejects.
        .layer(from_fn(admin_no_store));

    Router::new().merge(public).merge(admin).with_state(state)
}

fn public_cors_layer() -> CorsLayer {
    let origins: Vec<HeaderValue> = PUBLIC_ORIGINS
        .iter()
        .map(|o| HeaderValue::from_static(o))
        .collect();

    CorsLayer::new()
        .allow_origin(AllowOrigin::list(origins))
        .allow_methods([Method::GET, Method::POST, Method::OPTIONS])
        .allow_headers([header::CONTENT_TYPE, header::ACCEPT])
        // Credentials intentionally disabled: session cookies must not be
        // usable from cross-origin public pages.
        .allow_credentials(false)
}

/// Attach Cache-Control: no-store to every admin API response.
async fn admin_no_store(request: Request<Body>, next: Next) -> Response {
    let mut response = next.run(request).await;
    response
        .headers_mut()
        .insert(header::CACHE_CONTROL, HeaderValue::from_static("no-store"));
    response
}

/// Reject cross-origin browser mutations against admin endpoints.
async fn admin_mutation_origin(request: Request<Body>, next: Next) -> Result<Response, ApiError> {
    if matches!(
        *request.method(),
        Method::POST | Method::PUT | Method::PATCH | Method::DELETE
    ) {
        require_admin_origin(request.headers())?;
    }
    Ok(next.run(request).await)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::Config;
    use crate::state::AppState;
    use axum::body::Body;
    use axum::extract::connect_info::MockConnectInfo;
    use axum::http::StatusCode;
    use http_body_util::BodyExt;
    use sqlx::postgres::PgPoolOptions;
    use std::net::SocketAddr;
    use tower::ServiceExt;

    #[test]
    fn public_origins_are_https_bitbt_only() {
        assert_eq!(PUBLIC_ORIGINS.len(), 2);
        assert!(PUBLIC_ORIGINS.iter().all(|o| o.starts_with("https://")));
        assert!(PUBLIC_ORIGINS.contains(&"https://bitbt.com"));
        assert!(PUBLIC_ORIGINS.contains(&"https://www.bitbt.com"));
    }

    fn test_app() -> Router {
        let pool = PgPoolOptions::new()
            .connect_lazy("postgres://bitbt:bitbt@127.0.0.1:1/bitbt_test")
            .expect("lazy pool");
        build_router(AppState::new(pool, Config::test_fixture()))
            .layer(MockConnectInfo(SocketAddr::from(([127, 0, 0, 1], 3000))))
    }

    #[tokio::test]
    async fn rejects_cross_origin_admin_login() {
        let app = test_app();
        let response = app
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/api/admin/login")
                    .header(header::ORIGIN, "https://evil.example")
                    .header(header::CONTENT_TYPE, "application/json")
                    .body(Body::from(r#"{"username":"admin","password":"x"}"#))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::FORBIDDEN);
        assert_eq!(
            response
                .headers()
                .get(header::CACHE_CONTROL)
                .and_then(|v| v.to_str().ok()),
            Some("no-store")
        );
    }

    #[tokio::test]
    async fn allows_missing_origin_on_admin_login_path() {
        // Missing Origin is permitted for non-browser ops; request may fail later
        // (unauthorized / DB), but must not fail the Origin gate.
        let app = test_app();
        let response = app
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/api/admin/login")
                    .header(header::CONTENT_TYPE, "application/json")
                    .body(Body::from(r#"{"username":"admin","password":"x"}"#))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_ne!(response.status(), StatusCode::FORBIDDEN);
        assert_eq!(
            response
                .headers()
                .get(header::CACHE_CONTROL)
                .and_then(|v| v.to_str().ok()),
            Some("no-store")
        );
    }

    #[tokio::test]
    async fn contact_rejects_unknown_fields_without_db_hit_needed() {
        // Validation runs after rate-limit check; unknown fields fail at JSON decode
        // before DB. Lazy pool is fine.
        let app = test_app();
        let response = app
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/api/contact")
                    .header(header::CONTENT_TYPE, "application/json")
                    .header("x-real-ip", "203.0.113.50")
                    .body(Body::from(
                        r#"{"name":"Ada","company":"Acme","contact":"a@b.co","avatar":"x"}"#,
                    ))
                    .unwrap(),
            )
            .await
            .unwrap();
        // Axum returns 422 Unprocessable Entity for JSON rejection with deny_unknown_fields.
        assert!(
            response.status() == StatusCode::UNPROCESSABLE_ENTITY
                || response.status() == StatusCode::BAD_REQUEST
        );
    }

    #[tokio::test]
    async fn team_public_route_exists() {
        let app = test_app();
        let response = app
            .oneshot(
                Request::builder()
                    .method("GET")
                    .uri("/api/team?locale=en")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        // Lazy pool means DB call fails -> 500, but route is mounted.
        assert_ne!(response.status(), StatusCode::NOT_FOUND);
        let _ = response.into_body().collect().await;
    }
}
