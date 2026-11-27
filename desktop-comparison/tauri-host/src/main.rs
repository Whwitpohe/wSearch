#![cfg_attr(target_os = "windows", windows_subsystem = "windows")]

use std::{
    env, fs,
    path::PathBuf,
    process::Command,
    sync::atomic::{AtomicBool, Ordering},
    thread,
};
use tauri::{
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    AppHandle, Manager, RunEvent, WebviewUrl, WebviewWindowBuilder,
};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};

const SHORTCUT: &str = "Ctrl+Alt+Shift+S";
static CAPTURING: AtomicBool = AtomicBool::new(false);

fn marker(name: &str, message: &str) {
    if let Some(dir) = env::var_os("WSEARCH_TRIAL_BENCH_DIR") {
        let _ = fs::write(PathBuf::from(dir).join(name), message);
    }
}

fn capture(app: &AppHandle) {
    if CAPTURING.swap(true, Ordering::AcqRel) {
        return;
    }
    let handle = app.clone();
    thread::spawn(move || {
        let result = env::current_exe().and_then(|exe| {
            let name = if cfg!(windows) {
                "wsearch-capture.exe"
            } else {
                "wsearch-capture"
            };
            let child = exe.with_file_name(name);
            let path = if child.is_file() {
                child
            } else {
                handle
                    .path()
                    .resource_dir()
                    .map_err(std::io::Error::other)?
                    .join(name)
            };
            Command::new(path).status()
        });
        if !matches!(&result, Ok(status) if status.success() || status.code()==Some(1)) {
            eprintln!("Capture: {result:?}");
        }
        marker("completed", &format!("{result:?}"));
        CAPTURING.store(false, Ordering::Release);
    });
}

fn show_info(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("info") {
        let _ = w.show();
        let _ = w.set_focus();
        return;
    }
    if let Err(e) = WebviewWindowBuilder::new(app, "info", WebviewUrl::App("index.html".into()))
        .title("wSearch · Tauri")
        .inner_size(520., 280.)
        .build()
    {
        eprintln!("Open settings: {e}");
    }
}

fn main() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .setup(|app| {
            let registered = app
                .global_shortcut()
                .on_shortcut(SHORTCUT, |app, _, event| {
                    if event.state == ShortcutState::Pressed {
                        capture(app);
                    }
                })
                .is_ok();
            let label = if registered {
                "截图  Ctrl+Alt+Shift+S"
            } else {
                "截图（快捷键被占用）"
            };
            let snap = MenuItem::with_id(app, "capture", label, true, None::<&str>)?;
            let info = MenuItem::with_id(app, "info", "使用说明", true, None::<&str>)?;
            let exit = MenuItem::with_id(app, "exit", "退出", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&snap, &info, &exit])?;
            TrayIconBuilder::new()
                .icon(tauri::image::Image::from_bytes(include_bytes!(
                    "../tray.png"
                ))?)
                .tooltip("wSearch · Tauri")
                .menu(&menu)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "capture" => capture(app),
                    "info" => show_info(app),
                    "exit" => app.exit(0),
                    _ => {}
                })
                .build(app)?;
            if env::var_os("WSEARCH_TRIAL_BENCH_DIR").is_some() {
                app.global_shortcut()
                    .on_shortcut("Ctrl+Alt+Shift+F7", |app, _, e| {
                        if e.state == ShortcutState::Pressed {
                            app.exit(0)
                        }
                    })?;
            }
            if env::var_os("WSEARCH_TRIAL_SHOW_UI").is_some() {
                show_info(app.handle());
            }
            marker(
                "ready",
                if registered {
                    "registered"
                } else {
                    "unavailable"
                },
            );
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("initialize Tauri");
    app.run(|_, event| {
        if let RunEvent::ExitRequested {
            code: None, api, ..
        } = event
        {
            api.prevent_exit();
        }
    });
}
