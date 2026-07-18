use serde::de::DeserializeOwned;
use tauri::{plugin::PluginApi, AppHandle, Runtime};

use super::FolderPicker;

tauri::ios_plugin_binding!(init_plugin_folder_picker);

pub fn init<R: Runtime, C: DeserializeOwned>(
    _app: &AppHandle<R>,
    api: PluginApi<R, C>,
) -> Result<FolderPicker<R>, tauri::plugin::mobile::PluginInvokeError> {
    let handle = api.register_ios_plugin(init_plugin_folder_picker)?;
    Ok(FolderPicker(handle))
}
