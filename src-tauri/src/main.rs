#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
use tauri::Manager;
mod desktop;
mod storage;
mod fonts;
mod tray;
fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _, _| {
            let _ = desktop::show_workbench(app.clone());
        }))
        .plugin(tauri_plugin_wallpaper::init())
        .on_window_event(|window, event| {
            if window.label() == "main" {
                if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                    if window
                        .app_handle()
                        .webview_windows()
                        .keys()
                        .any(|label| label.starts_with("desktop-"))
                    {
                        api.prevent_close();
                        let _ = window.hide();
                    }
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            fonts::system_fonts,
            storage::load,
            storage::commit,
            storage::history,
            storage::state_get,
            storage::state_set,
            storage::data_location,
            storage::export_file,
            storage::import_file,
            desktop::monitors,
            desktop::desktop_open,
            desktop::desktop_adjust,
            desktop::desktop_close,
            desktop::show_workbench,
            desktop::app_exit,
            desktop::close_workbench,
            desktop::desktop_regions
        ])
        .setup(|app| {
            // AppData is virtualized when launched through packaged hosts.
            // The profile-root directory is shared by all launch environments.
            let dir = app.path().home_dir()?.join(".floward");
            std::fs::create_dir_all(&dir)?;
            app.manage(storage::Store::open(dir.join("floward-v2.db"))?);
            tray::setup(app.handle())?;
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                desktop::restore_desktops(handle).await;
            });
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("Floward could not start");
}
