use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Emitter, Manager,
};

pub fn setup(app: &tauri::AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    let open = MenuItem::with_id(app, "open", "打开主窗口", true, None::<&str>)?;
    let desktop = MenuItem::with_id(app, "desktop_close", "关闭桌面显示", true, None::<&str>)?;
    let separator = PredefinedMenuItem::separator(app)?;
    let exit = MenuItem::with_id(app, "app_exit", "完全退出", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&open, &desktop, &separator, &exit])?;
    let icon = app.default_window_icon().ok_or("缺少托盘图标")?.clone();
    TrayIconBuilder::with_id("floward")
        .icon(icon)
        .tooltip("顺水意流 · floward · 正在运行")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event {
                let _ = crate::desktop::show_workbench(tray.app_handle().clone());
            }
        })
        .on_menu_event(|app, event| {
            if event.id.as_ref() == "open" {
                let _ = crate::desktop::show_workbench(app.clone());
            } else if matches!(event.id.as_ref(), "desktop_close" | "app_exit") {
                // Use the workbench's existing draft flush before closing windows.
                let _ = crate::desktop::show_workbench(app.clone());
                let _ = app.emit_to("main", "floward-tray-action", event.id.as_ref());
            }
        })
        .build(app)?;
    Ok(())
}

pub fn refresh(app: &tauri::AppHandle) {
    let desktop = app.webview_windows().keys().any(|name| name.starts_with("desktop-"));
    if let Some(tray) = app.tray_by_id("floward") {
        let _ = tray.set_tooltip(Some(if desktop {
            "顺水意流 · floward · 桌面显示中（单击打开主窗口）"
        } else {
            "顺水意流 · floward · 正在运行（单击打开主窗口）"
        }));
    }
}
