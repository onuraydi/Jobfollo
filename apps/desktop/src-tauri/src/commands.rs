use crate::db::{BatchResult, Database, SqlStatement};
use crate::db::error::DbError;
use serde_json::{Map as JsonMap, Value as JsonValue};
use std::sync::Arc;
use tauri::State;

pub struct DbState {
    pub db: Result<Arc<Database>, DbError>,
    pub data_dir: String,
}

#[tauri::command]
pub async fn db_select(
    state: State<'_, DbState>,
    sql: String,
    params: Option<Vec<JsonValue>>,
) -> Result<Vec<JsonMap<String, JsonValue>>, DbError> {
    let db = state.db.as_ref().map_err(Clone::clone)?.clone();
    let params = params.unwrap_or_default();

    tauri::async_runtime::spawn_blocking(move || db.select(&sql, &params))
        .await
        .map_err(|_| DbError::io("Database worker task failed"))?
}

#[tauri::command]
pub async fn db_batch(
    state: State<'_, DbState>,
    statements: Vec<SqlStatement>,
) -> Result<Vec<BatchResult>, DbError> {
    let db = state.db.as_ref().map_err(Clone::clone)?.clone();

    tauri::async_runtime::spawn_blocking(move || db.batch(&statements))
        .await
        .map_err(|_| DbError::io("Database worker task failed"))?
}

#[tauri::command]
pub async fn data_location(state: State<'_, DbState>) -> Result<String, DbError> {
    Ok(state.data_dir.clone())
}
