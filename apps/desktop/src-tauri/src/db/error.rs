use rusqlite::ErrorCode;
use serde::{Deserialize, Serialize};
use std::fmt;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum DbErrorKind {
    Constraint,
    Busy,
    Sql,
    Io,
    Open,
    InvalidArgument,
    Forbidden,
    Limit,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct DbError {
    pub kind: DbErrorKind,
    pub message: String,
}

impl DbError {
    pub fn new(kind: DbErrorKind, message: impl Into<String>) -> Self {
        Self {
            kind,
            message: message.into(),
        }
    }

    pub fn open(message: impl Into<String>) -> Self {
        Self::new(DbErrorKind::Open, message)
    }

    pub fn invalid_argument(message: impl Into<String>) -> Self {
        Self::new(DbErrorKind::InvalidArgument, message)
    }

    pub fn forbidden(message: impl Into<String>) -> Self {
        Self::new(DbErrorKind::Forbidden, message)
    }

    pub fn limit(message: impl Into<String>) -> Self {
        Self::new(DbErrorKind::Limit, message)
    }

    pub fn io(message: impl Into<String>) -> Self {
        Self::new(DbErrorKind::Io, message)
    }

    pub fn sql(message: impl Into<String>) -> Self {
        Self::new(DbErrorKind::Sql, message)
    }

    pub fn from_rusqlite(err: &rusqlite::Error, context: Option<&str>) -> Self {
        let map_ffi = |ffi_err: &rusqlite::ffi::Error, msg: Option<&str>| {
            let kind = match ffi_err.code {
                ErrorCode::ConstraintViolation => DbErrorKind::Constraint,
                ErrorCode::DatabaseBusy | ErrorCode::DatabaseLocked => DbErrorKind::Busy,
                ErrorCode::AuthorizationForStatementDenied => DbErrorKind::Forbidden,
                ErrorCode::SystemIoFailure
                | ErrorCode::DiskFull
                | ErrorCode::ReadOnly
                | ErrorCode::DatabaseCorrupt
                | ErrorCode::NotADatabase => DbErrorKind::Io,
                ErrorCode::CannotOpen => DbErrorKind::Open,
                _ if msg.is_some_and(|m| m.starts_with("not authorized")) => {
                    DbErrorKind::Forbidden
                }
                _ => DbErrorKind::Sql,
            };
            let text = msg
                .filter(|s| !s.is_empty())
                .map(ToOwned::to_owned)
                .unwrap_or_else(|| format!("SQLite error ({:?})", ffi_err.code));
            (kind, text)
        };

        let (kind, detail) = match err {
            rusqlite::Error::SqliteFailure(ffi_err, msg) => map_ffi(ffi_err, msg.as_deref()),
            rusqlite::Error::SqlInputError { error, msg, .. } => {
                map_ffi(error, Some(msg.as_str()))
            }
            rusqlite::Error::MultipleStatement => (
                DbErrorKind::InvalidArgument,
                "Multiple SQL statements in a single string are not allowed".to_owned(),
            ),
            rusqlite::Error::InvalidParameterCount(expected, actual) => (
                DbErrorKind::InvalidArgument,
                format!("Parameter count mismatch: expected {expected}, got {actual}"),
            ),
            rusqlite::Error::Utf8Error(_) => {
                (DbErrorKind::Sql, "Invalid UTF-8 in text column".to_owned())
            }
            _ => (DbErrorKind::Sql, "SQL execution error".to_owned()),
        };

        let message = match context {
            Some(ctx) => format!("{ctx}: {detail}"),
            None => detail,
        };
        Self { kind, message }
    }
}

impl fmt::Display for DbError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "[{:?}] {}", self.kind, self.message)
    }
}

impl std::error::Error for DbError {}
