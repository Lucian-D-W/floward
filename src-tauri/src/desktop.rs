use serde_json::{json, Value};
use tauri::{Emitter, Manager, WebviewUrl, WebviewWindowBuilder};
#[tauri::command]
pub async fn desktop_adjust(app: tauri::AppHandle, index: usize) -> Result<(), String> {
    let label = desktop_open(app.clone(), index).await?;
    let store = app.state::<crate::storage::Store>();
    store.conn.lock().map_err(|e|e.to_string())?.execute("INSERT INTO view_state(key,json) VALUES(?1,'true') ON CONFLICT(key) DO UPDATE SET json='true'",[format!("{label}/desktop-adjust")]).map_err(|e|e.to_string())?;
    app.emit_to(&label,"floward-adjust-desktop",()).map_err(|e|e.to_string())
}
use tauri_plugin_wallpaper::{AttachRequest, DetachRequest, WallpaperExt};
#[tauri::command]
pub fn desktop_regions(window: tauri::WebviewWindow, regions: Vec<[f64; 4]>) -> Result<(), String> {
    let scale = window.scale_factor().map_err(|e| e.to_string())?;
    tauri_plugin_wallpaper::set_input_regions(
        window.label(),
        regions
            .into_iter()
            .map(|r| r.map(|v| (v * scale).round() as i32))
            .collect(),
    );
    Ok(())
}
#[tauri::command]
pub fn monitors(app: tauri::AppHandle) -> Result<Value, String> {
    Ok(Value::Array(app.available_monitors().map_err(|e|e.to_string())?.iter().enumerate().map(|(i,m)|json!({"index":i,"name":m.name(),"width":m.size().width,"height":m.size().height,"scale":m.scale_factor(),"active":app.get_webview_window(&monitor_label(m.name().map(|n|n.as_str()).unwrap_or("unknown"))).is_some()})).collect()))
}
fn monitor_label(name: &str) -> String {
    format!(
        "desktop-{}",
        name.chars()
            .filter(|c| c.is_ascii_alphanumeric())
            .collect::<String>()
    )
}
#[tauri::command]
pub async fn desktop_open(app: tauri::AppHandle, index: usize) -> Result<String, String> {
    let list = app.available_monitors().map_err(|e| e.to_string())?;
    let monitor = list.get(index).ok_or("显示器不存在")?;
    let name = monitor.name().ok_or("显示器缺少名称")?.clone();
    let label = monitor_label(&name);
    if let Some(w) = app.get_webview_window(&label) {
        w.show().map_err(|e| e.to_string())?;
        return Ok(label);
    }
    let window = WebviewWindowBuilder::new(&app, &label, WebviewUrl::App("index.html".into()))
        .title(format!("顺水意流 · floward 桌面 {}", index + 1))
        .decorations(false)
        .resizable(false)
        .skip_taskbar(true)
        .focused(false)
        .visible(false)
        .build()
        .map_err(|e| e.to_string())?;
    if let Err(e) = app.wallpaper().attach(
        AttachRequest::new(&label)
            .with_monitor(&name)
            .with_input_forwarding(true, true),
    ) {
        let _ = window.close();
        return Err(e.to_string());
    }
    window.show().map_err(|e| e.to_string())?;
    let _ = app.wallpaper().start_occlusion_monitor();
    remember(&app)?;
    crate::tray::refresh(&app);
    Ok(label)
}
#[tauri::command]
pub async fn desktop_close(app: tauri::AppHandle) -> Result<(), String> {
    detach_all(&app)?;
    crate::tray::refresh(&app);
    let store = app.state::<crate::storage::Store>();
    store.conn.lock().map_err(|e|e.to_string())?.execute("INSERT INTO view_state(key,json) VALUES('desktop-monitors','[]') ON CONFLICT(key) DO UPDATE SET json='[]'",[]).map_err(|e|e.to_string())?;
    Ok(())
}
fn remember(app: &tauri::AppHandle) -> Result<(), String> {
    let names: Vec<_> = app
        .available_monitors()
        .map_err(|e| e.to_string())?
        .into_iter()
        .filter_map(|m| m.name().cloned())
        .filter(|n| app.get_webview_window(&monitor_label(n)).is_some())
        .collect();
    let store = app.state::<crate::storage::Store>();
    store.conn.lock().map_err(|e|e.to_string())?.execute("INSERT INTO view_state(key,json) VALUES('desktop-monitors',?1) ON CONFLICT(key) DO UPDATE SET json=excluded.json",[serde_json::to_string(&names).map_err(|e|e.to_string())?]).map_err(|e|e.to_string())?;
    Ok(())
}
pub async fn restore_desktops(app: tauri::AppHandle) {
    let saved: Vec<String> = {
        let store = app.state::<crate::storage::Store>();
        let result = store.conn.lock().ok().and_then(|c| {
            c.query_row(
                "SELECT json FROM view_state WHERE key='desktop-monitors'",
                [],
                |r| r.get::<_, String>(0),
            )
            .ok()
        });
        result
            .and_then(|s| serde_json::from_str(&s).ok())
            .unwrap_or_default()
    };
    if let Ok(monitors) = app.available_monitors() {
        for (index, m) in monitors.iter().enumerate() {
            if m.name().is_some_and(|name| saved.contains(name)) {
                let _ = desktop_open(app.clone(), index).await;
            }
        }
    }
}
fn detach_all(app: &tauri::AppHandle) -> Result<(), String> {
    for (label, w) in app.webview_windows() {
        if label.starts_with("desktop-") {
            app.wallpaper()
                .detach(DetachRequest::new(&label))
                .map_err(|e| e.to_string())?;
            w.close().map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}
#[tauri::command]
pub fn show_workbench(app: tauri::AppHandle) -> Result<(), String> {
    let w = app.get_webview_window("main").ok_or("工作台不存在")?;
    w.show().map_err(|e| e.to_string())?;
    w.unminimize().map_err(|e| e.to_string())?;
    w.set_focus().map_err(|e| e.to_string())
}
#[tauri::command]
pub async fn app_exit(app: tauri::AppHandle) -> Result<(), String> {
    app.wallpaper().stop_occlusion_monitor();
    // A window may already be detached. Cleanup errors must not cancel exit.
    for (label, window) in app.webview_windows() {
        if label.starts_with("desktop-") {
            if let Err(error) = app.wallpaper().detach(DetachRequest::new(&label)) {
                eprintln!("Desktop cleanup during exit ({label}): {error}");
            }
            let _ = window.close();
        }
    }
    app.exit(0);
    Ok(())
}
#[tauri::command]
pub fn close_workbench(app: tauri::AppHandle) -> Result<(), String> {
    if app.webview_windows().keys().any(|label|label.starts_with("desktop-")) {
        app.get_webview_window("main").ok_or("工作台不存在")?.hide().map_err(|e|e.to_string())
    } else {
        app.exit(0);
        Ok(())
    }
}
