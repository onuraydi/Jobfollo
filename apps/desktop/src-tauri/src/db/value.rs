use crate::db::error::DbError;
use rusqlite::types::{Value as SqlValue, ValueRef};
use serde_json::{Number as JsonNumber, Value as JsonValue};

/// Maximum exact integer representable in IEEE-754 f64 (±2^53).
const MAX_SAFE_JSON_INT: i64 = 1_i64 << 53;

pub fn json_to_sql_value(value: &JsonValue, index: usize) -> Result<SqlValue, DbError> {
    match value {
        JsonValue::Null => Ok(SqlValue::Null),
        JsonValue::Number(num) => {
            if let Some(i) = num.as_i64() {
                Ok(SqlValue::Integer(i))
            } else if num.is_u64() {
                Err(DbError::invalid_argument(format!(
                    "Parameter at index {index} is an integer outside i64 range"
                )))
            } else if let Some(f) = num.as_f64() {
                if f.is_finite() {
                    Ok(SqlValue::Real(f))
                } else {
                    Err(DbError::invalid_argument(format!(
                        "Parameter at index {index} must be a finite number"
                    )))
                }
            } else {
                Err(DbError::invalid_argument(format!(
                    "Parameter at index {index} is not a supported number"
                )))
            }
        }
        JsonValue::String(s) => Ok(SqlValue::Text(s.clone())),
        JsonValue::Bool(_) => Err(DbError::invalid_argument(format!(
            "Parameter at index {index} cannot be a boolean; use integer 0 or 1"
        ))),
        JsonValue::Array(_) => Err(DbError::invalid_argument(format!(
            "Parameter at index {index} cannot be an array"
        ))),
        JsonValue::Object(_) => Err(DbError::invalid_argument(format!(
            "Parameter at index {index} cannot be an object"
        ))),
    }
}

pub fn sql_value_to_json(value: ValueRef<'_>, column_name: &str) -> Result<JsonValue, DbError> {
    match value {
        ValueRef::Null => Ok(JsonValue::Null),
        ValueRef::Integer(i) => {
            if !(-MAX_SAFE_JSON_INT..=MAX_SAFE_JSON_INT).contains(&i) {
                return Err(DbError::sql(format!(
                    "Column \"{column_name}\" contains an integer outside the safe JS range (±2^53)"
                )));
            }
            Ok(JsonValue::Number(JsonNumber::from(i)))
        }
        ValueRef::Real(f) => {
            if !f.is_finite() {
                return Err(DbError::sql(format!(
                    "Column \"{column_name}\" contains a non-finite floating-point value"
                )));
            }
            JsonNumber::from_f64(f)
                .map(JsonValue::Number)
                .ok_or_else(|| {
                    DbError::sql(format!(
                        "Column \"{column_name}\" contains an unrepresentable floating-point value"
                    ))
                })
        }
        ValueRef::Text(bytes) => {
            let text = std::str::from_utf8(bytes).map_err(|_| {
                DbError::sql(format!("Column \"{column_name}\" contains invalid UTF-8"))
            })?;
            Ok(JsonValue::String(text.to_owned()))
        }
        ValueRef::Blob(_) => Err(DbError::sql(format!(
            "Column \"{column_name}\" contains a BLOB value, which is not supported"
        ))),
    }
}
