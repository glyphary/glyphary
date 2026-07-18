import Tauri
import UIKit
import UniformTypeIdentifiers

enum FolderPickerEvent {
  case selected(URL)
  case cancelled
}

@available(iOS 14.0, *)
class FolderPickerPlugin: Plugin, UIDocumentPickerDelegate {
  var onResult: ((FolderPickerEvent) -> Void)?
  var selectedFolder: URL?

  @objc public func pickFolder(_ invoke: Invoke) throws {
    onResult = { event in
      switch event {
      case .selected(let folder):
        invoke.resolve(["folder": folder.path])
      case .cancelled:
        invoke.resolve(["folder": nil])
      }
    }

    DispatchQueue.main.async {
      let picker = UIDocumentPickerViewController(
        forOpeningContentTypes: [UTType.folder],
        asCopy: false
      )
      picker.delegate = self
      picker.allowsMultipleSelection = false
      picker.modalPresentationStyle = .fullScreen

      guard let presenter = self.activeViewController() else {
        invoke.reject("The folder picker could not find an active iPad window")
        return
      }

      presenter.present(picker, animated: true)
    }
  }

  private func activeViewController() -> UIViewController? {
    let scene = UIApplication.shared.connectedScenes
      .compactMap { $0 as? UIWindowScene }
      .first { $0.activationState == .foregroundActive }
    let window = scene?.windows.first { $0.isKeyWindow }

    for candidate in [manager.viewController, window?.rootViewController] {
      guard let presenter = topViewController(candidate), presenter.viewIfLoaded?.window != nil else {
        continue
      }

      return presenter
    }

    return nil
  }

  private func topViewController(_ viewController: UIViewController?) -> UIViewController? {
    if let presented = viewController?.presentedViewController {
      return topViewController(presented)
    }

    if let navigation = viewController as? UINavigationController {
      return topViewController(navigation.visibleViewController)
    }

    if let tab = viewController as? UITabBarController {
      return topViewController(tab.selectedViewController)
    }

    return viewController
  }

  public func documentPicker(
    _ controller: UIDocumentPickerViewController,
    didPickDocumentsAt urls: [URL]
  ) {
    guard let folder = urls.first else {
      onResult?(.cancelled)
      return
    }

    _ = folder.startAccessingSecurityScopedResource()
    selectedFolder = folder
    onResult?(.selected(folder))
  }

  public func documentPickerWasCancelled(_ controller: UIDocumentPickerViewController) {
    onResult?(.cancelled)
  }
}

@_cdecl("init_plugin_folder_picker")
func initPluginFolderPicker() -> Plugin {
  FolderPickerPlugin()
}
