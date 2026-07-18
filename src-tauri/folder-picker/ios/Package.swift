// swift-tools-version:5.3
import PackageDescription

let package = Package(
  name: "glyphary-folder-picker",
  platforms: [.iOS(.v14)],
  products: [
    .library(name: "glyphary-folder-picker", type: .static, targets: ["glyphary-folder-picker"])
  ],
  dependencies: [
    .package(name: "Tauri", path: "../.tauri/tauri-api")
  ],
  targets: [
    .target(
      name: "glyphary-folder-picker",
      dependencies: [.byName(name: "Tauri")],
      path: "Sources"
    )
  ]
)
