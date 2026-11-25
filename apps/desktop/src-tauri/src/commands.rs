use crate::db::error::DbError;
use crate::db::{BatchResult, Database, SqlStatement};
use crate::mail::MailError;
use crate::mail::keychain::{OsKeychainStore, SecretStore};
use crate::mail::smtp::{SendEmailRequest, send_email_with_store};
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

#[tauri::command]
pub async fn smtp_set_password(password: String) -> Result<(), MailError> {
    tauri::async_runtime::spawn_blocking(move || OsKeychainStore.set_password(&password))
        .await
        .map_err(|_| MailError::keychain("Keychain worker task failed"))?
}

#[tauri::command]
pub async fn smtp_has_password() -> Result<bool, MailError> {
    tauri::async_runtime::spawn_blocking(move || OsKeychainStore.has_password())
        .await
        .map_err(|_| MailError::keychain("Keychain worker task failed"))?
}

#[tauri::command]
pub async fn smtp_delete_password() -> Result<(), MailError> {
    tauri::async_runtime::spawn_blocking(move || OsKeychainStore.delete_password())
        .await
        .map_err(|_| MailError::keychain("Keychain worker task failed"))?
}

#[tauri::command]
pub async fn send_email(request: SendEmailRequest) -> Result<(), MailError> {
    tauri::async_runtime::spawn_blocking(move || send_email_with_store(&request, &OsKeychainStore))
        .await
        .map_err(|_| MailError::smtp("SMTP worker task failed"))?
}
