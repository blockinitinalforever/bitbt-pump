//! BitBT API library — contact form, admin auth, team CRUD.

pub mod auth;
pub mod config;
pub mod contact;
pub mod error;
pub mod rate_limit;
pub mod routes;
pub mod state;
pub mod submissions;
pub mod team;
pub mod verification;

pub use config::Config;
pub use routes::build_router;
pub use state::AppState;
