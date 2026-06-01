#[cfg(not(debug_assertions))]
use std::fs;
use std::sync::Mutex;

use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Emitter, LogicalPosition, Manager, PhysicalPosition, Runtime, WebviewWindow,
};
use tauri_plugin_shell::process::CommandChild;
#[cfg(not(debug_assertions))]
use tauri_plugin_shell::{process::CommandEvent, ShellExt};

#[derive(Default)]
struct ApiSidecar(Mutex<Option<CommandChild>>);

#[derive(Clone, Copy)]
struct TrayAnchor {
    event_position: PhysicalPosition<f64>,
    cursor_position: Option<PhysicalPosition<f64>>,
}

#[derive(Clone, Copy)]
struct MonitorGeometry {
    left: f64,
    top: f64,
    right: f64,
    bottom: f64,
    scale_factor: f64,
}

#[derive(Clone, Copy)]
struct LogicalAnchor {
    x: f64,
    y: f64,
    monitor: MonitorGeometry,
}

impl Drop for ApiSidecar {
    fn drop(&mut self) {
        if let Ok(child_slot) = self.0.get_mut() {
            if let Some(child) = child_slot.take() {
                let _ = child.kill();
            }
        }
    }
}

#[tauri::command]
fn open_dashboard(app: tauri::AppHandle) -> Result<(), String> {
    show_dashboard_window(&app).map_err(|error| error.to_string())
}

#[tauri::command]
fn hide_menubar_window(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("menubar") {
        window.hide().map_err(|error| error.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn quit_app(app: tauri::AppHandle) {
    app.exit(0);
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(ApiSidecar::default())
        .invoke_handler(tauri::generate_handler![
            open_dashboard,
            hide_menubar_window,
            quit_app
        ])
        .setup(|app| {
            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Accessory);

            build_tray(app)?;
            #[cfg(not(debug_assertions))]
            start_api_sidecar(app.handle())?;
            Ok(())
        })
        .on_window_event(|window, event| match (window.label(), event) {
            ("menubar", tauri::WindowEvent::Focused(false)) => {
                let _ = window.hide();
            }
            ("dashboard", tauri::WindowEvent::CloseRequested { api, .. }) => {
                api.prevent_close();
                let _ = window.hide();
            }
            _ => {}
        })
        .run(tauri::generate_context!())
        .expect("error while running Codex Usage Monitor");
}

#[cfg(not(debug_assertions))]
fn start_api_sidecar(app: &tauri::AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    let resource_dir = app.path().resource_dir()?;
    let server_entry = resource_dir.join("server").join("index.mjs");
    let app_data_dir = app.path().app_data_dir()?;
    fs::create_dir_all(&app_data_dir)?;

    let db_path = app_data_dir.join("codex-usage.sqlite");
    let server_arg = server_entry.to_string_lossy().to_string();
    let (mut events, child) = app
        .shell()
        .sidecar("codex-usage-node")?
        .args(["--no-warnings=ExperimentalWarning", server_arg.as_str()])
        .env("CODEX_USAGE_HOST", "127.0.0.1")
        .env("CODEX_USAGE_PORT", "4177")
        .env("CODEX_USAGE_DB", db_path.to_string_lossy().to_string())
        .spawn()?;

    *app.state::<ApiSidecar>()
        .0
        .lock()
        .expect("sidecar state poisoned") = Some(child);

    let app_for_logs = app.clone();
    tauri::async_runtime::spawn(async move {
        while let Some(event) = events.recv().await {
            match event {
                CommandEvent::Stdout(line) => {
                    let message = String::from_utf8_lossy(&line).to_string();
                    let _ = app_for_logs.emit("api-sidecar-log", message);
                }
                CommandEvent::Stderr(line) => {
                    let message = String::from_utf8_lossy(&line).to_string();
                    let _ = app_for_logs.emit("api-sidecar-error", message);
                }
                CommandEvent::Terminated(payload) => {
                    let _ = app_for_logs.emit("api-sidecar-exit", payload.code);
                    break;
                }
                _ => {}
            }
        }
    });

    Ok(())
}

fn build_tray(app: &tauri::App) -> tauri::Result<()> {
    let show_panel = MenuItem::with_id(app, "show_panel", "显示小面板", true, None::<&str>)?;
    let open_dashboard = MenuItem::with_id(
        app,
        "open_dashboard",
        "打开完整 Dashboard",
        true,
        None::<&str>,
    )?;
    let manual_sync = MenuItem::with_id(app, "manual_sync", "手动同步", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
    let separator = PredefinedMenuItem::separator(app)?;
    let menu = Menu::with_items(
        app,
        &[
            &show_panel,
            &open_dashboard,
            &manual_sync,
            &separator,
            &quit,
        ],
    )?;

    TrayIconBuilder::new()
        .icon(
            app.default_window_icon()
                .cloned()
                .expect("missing app icon"),
        )
        .icon_as_template(false)
        .tooltip("Codex Usage Monitor")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "show_panel" => {
                let _ = toggle_menubar_window(app, None);
            }
            "open_dashboard" => {
                let _ = show_dashboard_window(app);
            }
            "manual_sync" => {
                let _ = show_menubar_window(app, None);
                let _ = app.emit("tray-sync", ());
            }
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                position,
                ..
            } = event
            {
                let cursor_position = tray.app_handle().cursor_position().ok();
                let _ = toggle_menubar_window(
                    tray.app_handle(),
                    Some(TrayAnchor {
                        event_position: position,
                        cursor_position,
                    }),
                );
            }
        })
        .build(app)?;

    Ok(())
}

fn toggle_menubar_window(
    app: &tauri::AppHandle,
    tray_anchor: Option<TrayAnchor>,
) -> tauri::Result<()> {
    if let Some(window) = app.get_webview_window("menubar") {
        if window.is_visible()? {
            window.hide()?;
        } else {
            show_menubar_window(app, tray_anchor)?;
        }
    }
    Ok(())
}

fn show_menubar_window(
    app: &tauri::AppHandle,
    tray_anchor: Option<TrayAnchor>,
) -> tauri::Result<()> {
    if let Some(window) = app.get_webview_window("menubar") {
        if let Some(anchor) = tray_anchor {
            position_window_near_tray(&window, anchor)?;
        }
        window.show()?;
        window.set_focus()?;
    }
    Ok(())
}

fn position_window_near_tray<R: Runtime>(
    window: &WebviewWindow<R>,
    anchor: TrayAnchor,
) -> tauri::Result<()> {
    let window_size = window.outer_size()?;
    let window_scale = window.scale_factor()?;
    let window_width = f64::from(window_size.width) / window_scale;
    let window_height = f64::from(window_size.height) / window_scale;
    let anchor = logical_anchor_for_tray(window, anchor)?;
    let monitor = anchor.monitor;

    // macOS 的 set_position 会按当前窗口所在屏幕缩放 PhysicalPosition。
    // 这里主动使用逻辑坐标，避免面板从 1x 外接屏切到 2x 内置屏时被换算到错误显示器。
    let mut x = anchor.x - window_width + 28.0;
    let mut y = anchor.y.max(monitor.top) + 16.0;
    let margin = 8.0;
    let max_x = (monitor.right - window_width - margin).max(monitor.left + margin);
    let max_y = (monitor.bottom - window_height - margin).max(monitor.top + margin);

    x = x.clamp(monitor.left + margin, max_x);
    y = y.clamp(monitor.top + 30.0, max_y);

    window.set_position(LogicalPosition::new(x.round(), y.round()))
}

fn logical_anchor_for_tray<R: Runtime>(
    window: &WebviewWindow<R>,
    anchor: TrayAnchor,
) -> tauri::Result<LogicalAnchor> {
    let monitors = window.available_monitors()?;
    let event_position = anchor.event_position;

    // tray-icon 的 macOS 事件坐标来自状态栏窗口本身，优先级最高。
    if let Some(anchor) = anchor_for_position(&monitors, event_position, true) {
        return Ok(anchor);
    }
    if let Some(anchor) = anchor_for_position(&monitors, event_position, false) {
        return Ok(anchor);
    }

    if let Some(cursor_position) = anchor.cursor_position {
        // AppHandle::cursor_position 在多屏缩放组合下可能使用主屏 scale，作为最后兜底即可。
        if let Some(anchor) = anchor_for_position(&monitors, cursor_position, true) {
            return Ok(anchor);
        }
        if let Some(anchor) = anchor_for_position(&monitors, cursor_position, false) {
            return Ok(anchor);
        }
    }

    let fallback_monitor = window
        .current_monitor()?
        .as_ref()
        .map(|monitor| monitor_bounds(monitor))
        .unwrap_or(MonitorGeometry {
            left: 0.0,
            top: 0.0,
            right: 1440.0,
            bottom: 900.0,
            scale_factor: 1.0,
        });
    let fallback_position = anchor.event_position;

    Ok(LogicalAnchor {
        x: fallback_position.x / fallback_monitor.scale_factor,
        y: fallback_position.y / fallback_monitor.scale_factor,
        monitor: fallback_monitor,
    })
}

fn anchor_for_position(
    monitors: &[tauri::Monitor],
    position: PhysicalPosition<f64>,
    normalize_by_monitor_scale: bool,
) -> Option<LogicalAnchor> {
    for monitor in monitors {
        let bounds = monitor_bounds(monitor);
        let x = if normalize_by_monitor_scale {
            position.x / bounds.scale_factor
        } else {
            position.x
        };
        let y = if normalize_by_monitor_scale {
            position.y / bounds.scale_factor
        } else {
            position.y
        };

        if point_in_bounds(x, y, bounds) {
            return Some(LogicalAnchor {
                x,
                y,
                monitor: bounds,
            });
        }
    }

    None
}

fn monitor_bounds(monitor: &tauri::Monitor) -> MonitorGeometry {
    let scale_factor = monitor.scale_factor();
    let position = monitor.position();
    let size = monitor.size();
    let left = f64::from(position.x) / scale_factor;
    let top = f64::from(position.y) / scale_factor;
    let right = left + f64::from(size.width) / scale_factor;
    let bottom = top + f64::from(size.height) / scale_factor;

    MonitorGeometry {
        left,
        top,
        right,
        bottom,
        scale_factor,
    }
}

fn point_in_bounds(x: f64, y: f64, bounds: MonitorGeometry) -> bool {
    x >= bounds.left && x <= bounds.right && y >= bounds.top && y <= bounds.bottom
}

fn show_dashboard_window(app: &tauri::AppHandle) -> tauri::Result<()> {
    if let Some(window) = app.get_webview_window("dashboard") {
        window.unminimize()?;
        window.show()?;
        window.set_focus()?;
    }
    Ok(())
}
