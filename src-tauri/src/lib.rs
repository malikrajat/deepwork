use tauri_plugin_sql::{Migration, MigrationKind};
use tauri::{
    menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem, Submenu},
    tray::TrayIconBuilder,
    Emitter, Manager, WebviewWindow, WindowEvent,
};

/// Restores the main window: un-minimizes, shows, and focuses it.
/// `window.show()` alone does NOT un-minimize on Windows.
fn restore(window: &WebviewWindow) {
    let _ = window.unminimize();
    let _ = window.show();
    let _ = window.set_focus();
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
        .setup(|app| {
            // Make sure the main window is visible and focused on launch.
            if let Some(window) = app.get_webview_window("main") {
                restore(&window);
            }

            // System tray
            let show_i = MenuItem::with_id(app, "show", "Show", true, None::<&str>)?;
            let mute_i = CheckMenuItem::with_id(app, "mute", "Mute Reminder Sound", true, false, None::<&str>)?;
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

            let menu = Menu::new(app)?;
            menu.append(&show_i)?;
            menu.append(&separator1)?;
            menu.append(&mute_i)?;
            menu.append(&pause_menu)?;
            menu.append(&separator2)?;
            menu.append(&exit_i)?;

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
