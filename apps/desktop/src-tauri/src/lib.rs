pub mod commands;
pub mod db;

use crate::commands::DbState;
use crate::db::error::DbError;
use crate::db::Database;
use std::sync::Arc;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let (data_dir, db) = match app.path().app_data_dir() {
                Ok(dir) => {
                    let dir_string = dir.to_string_lossy().into_owned();
                    let db_path = dir.join("jobfollo.db");
                    let opened = Database::open_file(&db_path).map(Arc::new);
                    (dir_string, opened)
                }
                Err(err) => (
                    String::new(),
                    Err(DbError::open(format!(
                        "Failed to resolve application data directory: {err}"
                    ))),
                ),
            };

            app.manage(DbState { db, data_dir });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::db_select,
            commands::db_batch,
            commands::data_location
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
