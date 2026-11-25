pub mod commands;
pub mod db;
pub mod mail;

use crate::commands::DbState;
use crate::db::error::DbError;
use crate::db::Database;
use std::sync::Arc;
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{Manager, WindowEvent};
use tauri_plugin_autostart::MacosLauncher;

fn show_main_window(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_autostart::init(
            MacosLauncher::LaunchAgent,
            None,
        ))
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

            // System tray with Show / Quit menu
            let show_item = MenuItem::with_id(app, "show", "Show Jobfollo", true, None::<&str>)?;
            let quit_item = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let tray_menu = Menu::with_items(app, &[&show_item, &quit_item])?;

            let mut tray_builder = TrayIconBuilder::new()
                .menu(&tray_menu)
                .tooltip("Jobfollo")
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => show_main_window(app),
                    "quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        show_main_window(tray.app_handle());
                    }
                });

            if let Some(icon) = app.default_window_icon().cloned() {
                tray_builder = tray_builder.icon(icon);
            }
            tray_builder.build(app)?;

            Ok(())
        })
        .on_window_event(|window, event| {
            if window.label() == "main" {
                if let WindowEvent::CloseRequested { api, .. } = event {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            commands::db_select,
            commands::db_batch,
            commands::data_location,
            commands::smtp_set_password,
            commands::smtp_has_password,
            commands::smtp_delete_password,
            commands::send_email
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
