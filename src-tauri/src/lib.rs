mod autostart;

use tauri_plugin_sql::{Migration, MigrationKind};
use tauri::{
    menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem, Submenu},
    tray::TrayIconBuilder,
    AppHandle, Emitter, Manager, WebviewWindow, WindowEvent, Wry,
};

/// Checkable tray items that must mirror the app's desktop preferences.
///
/// Both are managed as Tauri state so the `*_set_*` commands can keep the tray
/// menu tick marks in sync when the user flips a switch inside the app.
struct TrayPrefs {
    start_with_system: CheckMenuItem<Wry>,
    always_on_top: CheckMenuItem<Wry>,
}

/// Restores the main window: un-minimizes, shows, and focuses it.
/// `window.show()` alone does NOT un-minimize on Windows.
fn restore(window: &WebviewWindow) {
    let _ = window.unminimize();
    let _ = window.show();
    let _ = window.set_focus();
}

/// Tick the tray checkboxes to match the real OS/window state.
fn sync_tray_prefs(app: &AppHandle, window: Option<&WebviewWindow>) {
    if let Some(prefs) = app.try_state::<TrayPrefs>() {
        let _ = prefs.start_with_system.set_checked(autostart::is_enabled());
        if let Some(w) = window {
            let on_top = w.is_always_on_top().unwrap_or(false);
            let _ = prefs.always_on_top.set_checked(on_top);
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Commands exposed to the Angular layer
// ─────────────────────────────────────────────────────────────────────────────

/// Reads the real "start with the system" state from the OS.
///
/// The OS is the source of truth: the Windows installer can enable startup
/// before the app ever runs, and a user can remove the entry by hand.
#[tauri::command]
fn autostart_is_enabled() -> bool {
    autostart::is_enabled()
}

#[tauri::command]
fn autostart_set_enabled(app: AppHandle, enabled: bool) -> Result<(), String> {
    autostart::set_enabled(enabled)?;
    sync_tray_prefs(&app, app.get_webview_window("main").as_ref());
    Ok(())
}

#[tauri::command]
fn window_set_always_on_top(
    app: AppHandle,
    window: WebviewWindow,
    enabled: bool,
) -> Result<(), String> {
    window
        .set_always_on_top(enabled)
        .map_err(|err| format!("Cannot change always-on-top: {err}"))?;
    sync_tray_prefs(&app, Some(&window));
    Ok(())
}

#[tauri::command]
fn window_is_always_on_top(window: WebviewWindow) -> bool {
    window.is_always_on_top().unwrap_or(false)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let migrations = vec![
        Migration {
            version: 1,
            description: "create initial tables",
            sql: include_str!("../migrations/001_initial.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 2,
            description: "add missing settings columns",
            sql: include_str!("../migrations/002_add_settings_columns.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 3,
            description: "add task updated_at",
            sql: include_str!("../migrations/003_add_task_updated_at.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 4,
            description: "add calendar reminder setting",
            sql: include_str!("../migrations/004_add_calendar_reminders.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 5,
            description: "add desktop preference settings",
            sql: include_str!("../migrations/005_add_desktop_prefs.sql"),
            kind: MigrationKind::Up,
        },
    ];

    tauri::Builder::default()
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:deepwork.db", migrations)
                .build(),
        )
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                restore(&window);
            }
        }))
        .invoke_handler(tauri::generate_handler![
            autostart_is_enabled,
            autostart_set_enabled,
            window_set_always_on_top,
            window_is_always_on_top,
        ])
        .setup(|app| {
            // A login-launched copy waits in the system tray instead of covering
            // whatever the user is doing. Everything else opens normally.
            if let Some(window) = app.get_webview_window("main") {
                if autostart::launched_at_login() {
                    let _ = window.hide();
                } else {
                    restore(&window);
                }
            }

            // Keep the stored startup path valid across reinstalls/moves.
            autostart::refresh_if_enabled();

            // System tray
            let show_i = MenuItem::with_id(app, "show", "Show", true, None::<&str>)?;
            let mute_i = CheckMenuItem::with_id(app, "mute", "Mute Reminder Sound", true, false, None::<&str>)?;
            let start_with_system_i = CheckMenuItem::with_id(
                app,
                "start_with_system",
                "Start with system",
                true,
                autostart::is_enabled(),
                None::<&str>,
            )?;
            let always_on_top_i = CheckMenuItem::with_id(
                app,
                "always_on_top",
                "Always on top",
                true,
                app.get_webview_window("main")
                    .and_then(|w| w.is_always_on_top().ok())
                    .unwrap_or(false),
                None::<&str>,
            )?;
            let pause_i = MenuItem::with_id(app, "pause", "Pause", true, None::<&str>)?;
            let pause5_i = MenuItem::with_id(app, "pause5", "Pause for 5 min", true, None::<&str>)?;
            let pause10_i = MenuItem::with_id(app, "pause10", "Pause for 10 min", true, None::<&str>)?;
            let pause15_i = MenuItem::with_id(app, "pause15", "Pause for 15 min", true, None::<&str>)?;
            let pause30_i = MenuItem::with_id(app, "pause30", "Pause for 30 min", true, None::<&str>)?;
            let exit_i = MenuItem::with_id(app, "exit", "Exit", true, None::<&str>)?;

            let pause_menu = Submenu::with_items(app, "Pause Timer", true, &[
                &pause_i,
                &pause5_i,
                &pause10_i,
                &pause15_i,
                &pause30_i,
            ])?;

            let separator1 = PredefinedMenuItem::separator(app)?;
            let separator2 = PredefinedMenuItem::separator(app)?;
            let separator3 = PredefinedMenuItem::separator(app)?;

            let menu = Menu::new(app)?;
            menu.append(&show_i)?;
            menu.append(&separator1)?;
            menu.append(&mute_i)?;
            menu.append(&pause_menu)?;
            menu.append(&separator2)?;
            menu.append(&start_with_system_i)?;
            menu.append(&always_on_top_i)?;
            menu.append(&separator3)?;
            menu.append(&exit_i)?;

            // Hand the checkable items to the commands so in-app switches and the
            // tray menu can never disagree.
            app.manage(TrayPrefs {
                start_with_system: start_with_system_i.clone(),
                always_on_top: always_on_top_i.clone(),
            });

            let _tray = {
                let mut builder = TrayIconBuilder::new()
                    .menu(&menu)
                    .tooltip("DeepWork")
                    .show_menu_on_left_click(false);
                if let Some(icon) = app.default_window_icon() {
                    builder = builder.icon(icon.clone());
                }
                builder
                    .on_menu_event(move |app, event| {
                        let window = app.get_webview_window("main");
                        let emit = |payload: &str| {
                            if let Some(w) = &window {
                                let _ = w.emit("deepwork:tray", payload);
                            }
                        };
                        match event.id().as_ref() {
                            "show" => {
                                if let Some(w) = &window {
                                    restore(w);
                                }
                            }
                            "mute" => {
                                let muted = mute_i.is_checked().unwrap_or(false);
                                emit(if muted { "mute:true" } else { "mute:false" });
                            }
                            "start_with_system" => {
                                // Flip the real OS state, then tell the app so it
                                // can persist the preference.
                                let next = !autostart::is_enabled();
                                match autostart::set_enabled(next) {
                                    Ok(()) => {
                                        start_with_system_i.set_checked(next).ok();
                                        emit(if next { "autostart:on" } else { "autostart:off" });
                                    }
                                    Err(err) => {
                                        log::warn!("autostart toggle failed: {err}");
                                        // Put the tick back where reality is.
                                        start_with_system_i
                                            .set_checked(autostart::is_enabled())
                                            .ok();
                                    }
                                }
                            }
                            "always_on_top" => {
                                if let Some(w) = &window {
                                    let next = !w.is_always_on_top().unwrap_or(false);
                                    if w.set_always_on_top(next).is_ok() {
                                        always_on_top_i.set_checked(next).ok();
                                        emit(if next { "aot:on" } else { "aot:off" });
                                    }
                                }
                            }
                            "pause" => emit("pause"),
                            "pause5" => emit("pause:5"),
                            "pause10" => emit("pause:10"),
                            "pause15" => emit("pause:15"),
                            "pause30" => emit("pause:30"),
                            "exit" => {
                                app.exit(0);
                            }
                            _ => {}
                        }
                    })
                    .on_tray_icon_event(|tray, event| {
                        if let tauri::tray::TrayIconEvent::Click {
                            button: tauri::tray::MouseButton::Left,
                            ..
                        } = event
                        {
                            let app = tray.app_handle();
                            if let Some(window) = app.get_webview_window("main") {
                                restore(&window);
                            }
                        }
                    })
                    .build(app)?
            };

            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .on_window_event(|window, event| match event {
            WindowEvent::CloseRequested { .. } => {
                window.app_handle().exit(0);
            }
            // When minimized, hide the window so it leaves the taskbar and
            // lives in the system tray instead.
            WindowEvent::Resized(size) => {
                if size.width == 0 && size.height == 0 {
                    let _ = window.hide();
                }
            }
            _ => {}
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
