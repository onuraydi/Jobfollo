#![deny(clippy::unwrap_used, clippy::expect_used)]

pub mod authorizer;
pub mod error;
pub mod value;

#[cfg(test)]
mod tests;

use crate::db::authorizer::install_authorizer;
use crate::db::error::DbError;
use crate::db::value::{json_to_sql_value, sql_value_to_json};
use rusqlite::{Connection, OpenFlags, TransactionBehavior, params_from_iter};
use serde::{Deserialize, Serialize};
use serde_json::{Map as JsonMap, Value as JsonValue};
use std::collections::HashSet;
use std::path::Path;
use std::sync::Mutex;

pub const MAX_BATCH_STATEMENTS: usize = 2_000;
pub const MAX_SQL_BYTES: usize = 1_000_000;
pub const MAX_SELECT_ROWS: usize = 50_000;

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct SqlStatement {
    pub sql: String,
    #[serde(default)]
    pub params: Vec<JsonValue>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BatchResult {
    pub rows_affected: u64,
}

pub struct Database {
    conn: Mutex<Connection>,
}

impl Database {
    pub fn open_file(path: &Path) -> Result<Self, DbError> {
        if let Some(parent) = path.parent()
            && !parent.as_os_str().is_empty()
        {
            std::fs::create_dir_all(parent).map_err(|err| {
                DbError::open(format!("Failed to create database directory: {err}"))
            })?;
        }

        let flags = OpenFlags::SQLITE_OPEN_READ_WRITE
            | OpenFlags::SQLITE_OPEN_CREATE
            | OpenFlags::SQLITE_OPEN_NO_MUTEX;

        let conn = Connection::open_with_flags(path, flags)
            .map_err(|err| DbError::open(format!("Failed to open database: {err}")))?;

        configure_and_lock_down(conn)
    }

    pub fn open_in_memory() -> Result<Self, DbError> {
        let conn = Connection::open_in_memory()
            .map_err(|err| DbError::open(format!("Failed to open in-memory database: {err}")))?;

        configure_and_lock_down(conn)
    }

    pub fn select(
        &self,
        sql: &str,
        params: &[JsonValue],
    ) -> Result<Vec<JsonMap<String, JsonValue>>, DbError> {
        if sql.len() > MAX_SQL_BYTES {
            return Err(DbError::limit(format!(
                "SQL string exceeds maximum length of {MAX_SQL_BYTES} bytes"
            )));
        }

        if has_multiple_statements(sql) {
            return Err(DbError::invalid_argument(
                "Multiple SQL statements in a single string are not allowed",
            ));
        }

        let bound_params = convert_params(params)?;

        let conn = self
            .conn
            .lock()
            .map_err(|_| DbError::io("Database connection lock was poisoned"))?;

        let mut stmt = conn
            .prepare(sql)
            .map_err(|err| DbError::from_rusqlite(&err, None))?;

        if !stmt.readonly() {
            return Err(DbError::forbidden(
                "db_select only permits read-only SQL statements",
            ));
        }

        let column_names = collect_unique_column_names(&stmt)?;

        let mut rows = stmt
            .query(params_from_iter(bound_params))
            .map_err(|err| DbError::from_rusqlite(&err, None))?;

        let mut results: Vec<JsonMap<String, JsonValue>> = Vec::new();
        while let Some(row) = rows
            .next()
            .map_err(|err| DbError::from_rusqlite(&err, None))?
        {
            if results.len() >= MAX_SELECT_ROWS {
                return Err(DbError::limit(format!(
                    "Query exceeded maximum row limit of {MAX_SELECT_ROWS}"
                )));
            }

            let mut obj = JsonMap::with_capacity(column_names.len());
            for (idx, name) in column_names.iter().enumerate() {
                let raw = row
                    .get_ref(idx)
                    .map_err(|err| DbError::from_rusqlite(&err, None))?;
                let json_val = sql_value_to_json(raw, name)?;
                obj.insert(name.clone(), json_val);
            }
            results.push(obj);
        }

        Ok(results)
    }

    pub fn batch(&self, statements: &[SqlStatement]) -> Result<Vec<BatchResult>, DbError> {
        if statements.len() > MAX_BATCH_STATEMENTS {
            return Err(DbError::limit(format!(
                "Batch exceeds maximum of {MAX_BATCH_STATEMENTS} statements"
            )));
        }

        let mut bound_batch = Vec::with_capacity(statements.len());
        for (idx, stmt) in statements.iter().enumerate() {
            if stmt.sql.len() > MAX_SQL_BYTES {
                return Err(DbError::limit(format!(
                    "Statement {idx} exceeds maximum SQL length of {MAX_SQL_BYTES} bytes"
                )));
            }
            if has_multiple_statements(&stmt.sql) {
                return Err(DbError::invalid_argument(format!(
                    "Statement {idx}: multiple SQL statements in a single string are not allowed"
                )));
            }
            let bound = convert_params(&stmt.params).map_err(|err| {
                DbError::new(err.kind, format!("Statement {idx}: {}", err.message))
            })?;
            bound_batch.push((&stmt.sql, bound));
        }

        let mut conn = self
            .conn
            .lock()
            .map_err(|_| DbError::io("Database connection lock was poisoned"))?;

        let tx = conn
            .transaction_with_behavior(TransactionBehavior::Immediate)
            .map_err(|err| DbError::from_rusqlite(&err, Some("Failed to start transaction")))?;

        let mut results = Vec::with_capacity(bound_batch.len());
        for (idx, (sql, params)) in bound_batch.into_iter().enumerate() {
            let ctx = format!("Statement {idx}");
            let mut prepared = tx
                .prepare(sql)
                .map_err(|err| DbError::from_rusqlite(&err, Some(&ctx)))?;

            if prepared.column_count() > 0 {
                return Err(DbError::invalid_argument(format!(
                    "Statement {idx} returns rows; use db_select for queries"
                )));
            }

            let changed = prepared
                .execute(params_from_iter(params))
                .map_err(|err| DbError::from_rusqlite(&err, Some(&ctx)))?;

            results.push(BatchResult {
                rows_affected: changed as u64,
            });
        }

        tx.commit()
            .map_err(|err| DbError::from_rusqlite(&err, Some("Failed to commit transaction")))?;

        Ok(results)
    }
}

fn configure_and_lock_down(conn: Connection) -> Result<Database, DbError> {
    conn.execute_batch(
        "PRAGMA foreign_keys = ON;
         PRAGMA journal_mode = WAL;
         PRAGMA busy_timeout = 5000;
         PRAGMA synchronous = NORMAL;",
    )
    .map_err(|err| DbError::open(format!("Failed to configure database pragmas: {err}")))?;

    install_authorizer(&conn)?;

    Ok(Database {
        conn: Mutex::new(conn),
    })
}

fn convert_params(params: &[JsonValue]) -> Result<Vec<rusqlite::types::Value>, DbError> {
    let mut out = Vec::with_capacity(params.len());
    for (idx, param) in params.iter().enumerate() {
        out.push(json_to_sql_value(param, idx)?);
    }
    Ok(out)
}

fn collect_unique_column_names(stmt: &rusqlite::Statement<'_>) -> Result<Vec<String>, DbError> {
    let count = stmt.column_count();
    let mut names = Vec::with_capacity(count);
    let mut seen = HashSet::with_capacity(count);

    for idx in 0..count {
        let name = stmt
            .column_name(idx)
            .map_err(|err| DbError::from_rusqlite(&err, None))?;
        if !seen.insert(name) {
            return Err(DbError::invalid_argument(format!(
                "Duplicate column name \"{name}\" in query result; use column aliases"
            )));
        }
        names.push(name.to_owned());
    }

    Ok(names)
}

/// Returns true if `sql` contains a semicolon outside quotes/comments followed by another statement token.
fn has_multiple_statements(sql: &str) -> bool {
    let bytes = sql.as_bytes();
    let len = bytes.len();
    let mut i = 0;
    let mut saw_semicolon = false;

    while i < len {
        let b = bytes[i];

        if b.is_ascii_whitespace() {
            i += 1;
            continue;
        }

        // Line comment: -- ... \n
        if b == b'-' && i + 1 < len && bytes[i + 1] == b'-' {
            i += 2;
            while i < len && bytes[i] != b'\n' {
                i += 1;
            }
            continue;
        }

        // Block comment: /* ... */
        if b == b'/' && i + 1 < len && bytes[i + 1] == b'*' {
            i += 2;
            while i + 1 < len && !(bytes[i] == b'*' && bytes[i + 1] == b'/') {
                i += 1;
            }
            i = (i + 2).min(len);
            continue;
        }

        if saw_semicolon {
            return true;
        }

        if b == b';' {
            saw_semicolon = true;
            i += 1;
            continue;
        }

        // Single- or double-quoted literal/identifier (escaped by doubling)
        if b == b'\'' || b == b'"' {
            let quote = b;
            i += 1;
            while i < len {
                if bytes[i] == quote {
                    if i + 1 < len && bytes[i + 1] == quote {
                        i += 2;
                        continue;
                    }
                    i += 1;
                    break;
                }
                i += 1;
            }
            continue;
        }

        i += 1;
    }

    false
}
