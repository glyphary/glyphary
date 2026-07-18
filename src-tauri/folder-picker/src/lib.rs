use tauri::{plugin::{Builder, TauriPlugin}, Runtime};
#[cfg(target_os = "ios")]
use tauri::Manager;

#[cfg(target_os = "ios")]
mod mobile;

#[cfg(target_os = "ios")]
use serde::Deserialize;
#[cfg(target_os = "ios")]
use tauri::{plugin::PluginHandle, AppHandle};

#[cfg(target_os = "ios")]
pub struct FolderPicker<R: Runtime>(PluginHandle<R>);

#[cfg(target_os = "ios")]
#[derive(Debug, Deserialize)]
struct FolderPickerResponse {
    folder: Option<String>,
}

pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("folder-picker")
        .setup(|app, api| {
            #[cfg(target_os = "ios")]
            {
                app.manage(mobile::init(app, api)?);
            }
            #[cfg(not(target_os = "ios"))]
            let _ = (app, api);
            Ok(())
        })
        .build()
}

#[cfg(target_os = "ios")]
pub async fn pick_folder<R: Runtime>(app: &AppHandle<R>) -> Result<Option<String>, String> {
    let picker = app.state::<FolderPicker<R>>();
    picker
        .0
        .run_mobile_plugin_async::<FolderPickerResponse>("pickFolder", ())
        .await
        .map(|response| response.folder)
        .map_err(|error| format!("Could not open the folder picker: {error}"))
}
