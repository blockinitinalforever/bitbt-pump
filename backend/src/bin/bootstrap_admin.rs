//! One-shot admin bootstrap: create or rotate the unique `admin` user.
//!
//! Recommended (auto-generates a >=24 char password with OsRng and prints it
//! exactly once after a successful DB commit):
//!
//! ```text
//! # Load DATABASE_URL from a protected env file or secret store, then:
//! cargo run --release --bin bootstrap_admin
//! ```
//!
//! Optional override (avoid putting the password on the command line / in shell history):
//! set `ADMIN_BOOTSTRAP_PASSWORD` in the process environment via your secret manager,
//! not via inline `VAR=secret cmd` in shared logs.
//!
//! Rotation (`ADMIN_BOOTSTRAP_FORCE=1`) updates the password hash and deletes all
//! admin sessions in a single transaction.

use bitbt_api::auth::{hash_password, ADMIN_USERNAME};
use rand::rngs::OsRng;
use rand::Rng;
use sqlx::postgres::PgPoolOptions;
use std::env;

const GENERATED_PASSWORD_LEN: usize = 32;
const CHARSET: &[u8] = b"ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*-_";

#[tokio::main]
async fn main() {
    let database_url = env::var("DATABASE_URL").unwrap_or_else(|_| {
        eprintln!("DATABASE_URL is required");
        std::process::exit(1);
    });

    let force = env::var("ADMIN_BOOTSTRAP_FORCE")
        .map(|v| v == "1" || v.eq_ignore_ascii_case("true"))
        .unwrap_or(false);

    let (password, generated) = match env::var("ADMIN_BOOTSTRAP_PASSWORD") {
        Ok(value) if !value.is_empty() => {
            if value.chars().count() < 24 {
                eprintln!("ADMIN_BOOTSTRAP_PASSWORD must be at least 24 characters");
                std::process::exit(1);
            }
            (value, false)
        }
        _ => (generate_password(), true),
    };

    let pool = PgPoolOptions::new()
        .max_connections(2)
        .connect(&database_url)
        .await
        .unwrap_or_else(|e| {
            eprintln!("database connect failed: {e}");
            std::process::exit(1);
        });

    let password_hash = hash_password(&password).unwrap_or_else(|e| {
        eprintln!("{e}");
        std::process::exit(1);
    });

    let existing: Option<(i64,)> = sqlx::query_as("SELECT id FROM admins WHERE username = $1")
        .bind(ADMIN_USERNAME)
        .fetch_optional(&pool)
        .await
        .unwrap_or_else(|e| {
            eprintln!("lookup failed: {e}");
            std::process::exit(1);
        });

    if existing.is_some() {
        if !force {
            eprintln!("admin user already exists (set ADMIN_BOOTSTRAP_FORCE=1 to rotate password)");
            std::process::exit(1);
        }

        let mut tx = pool.begin().await.unwrap_or_else(|e| {
            eprintln!("begin failed: {e}");
            std::process::exit(1);
        });

        sqlx::query("UPDATE admins SET password_hash = $1 WHERE username = $2")
            .bind(&password_hash)
            .bind(ADMIN_USERNAME)
            .execute(&mut *tx)
            .await
            .unwrap_or_else(|e| {
                eprintln!("update failed: {e}");
                std::process::exit(1);
            });

        sqlx::query(
            "DELETE FROM admin_sessions WHERE admin_id = (SELECT id FROM admins WHERE username = $1)",
        )
        .bind(ADMIN_USERNAME)
        .execute(&mut *tx)
        .await
        .unwrap_or_else(|e| {
            eprintln!("session revoke failed: {e}");
            std::process::exit(1);
        });

        tx.commit().await.unwrap_or_else(|e| {
            eprintln!("commit failed: {e}");
            std::process::exit(1);
        });

        println!("Rotated password for username={ADMIN_USERNAME} (all sessions revoked)");
    } else {
        sqlx::query("INSERT INTO admins (username, password_hash) VALUES ($1, $2)")
            .bind(ADMIN_USERNAME)
            .bind(&password_hash)
            .execute(&pool)
            .await
            .unwrap_or_else(|e| {
                eprintln!("insert failed: {e}");
                std::process::exit(1);
            });
        println!("Created admin user username={ADMIN_USERNAME}");
    }

    // Print plaintext exactly once after successful commit. Never logged elsewhere.
    if generated {
        println!("Initial admin password (store securely; shown once): {password}");
    } else {
        println!("Password was supplied via ADMIN_BOOTSTRAP_PASSWORD (not printed).");
    }
}

fn generate_password() -> String {
    let mut rng = OsRng;
    (0..GENERATED_PASSWORD_LEN)
        .map(|_| {
            let idx = rng.gen_range(0..CHARSET.len());
            CHARSET[idx] as char
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn generated_password_meets_length() {
        let password = generate_password();
        assert!(password.chars().count() >= 24);
        assert!(password.chars().all(|c| CHARSET.contains(&(c as u8))));
    }
}
