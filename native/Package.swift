// swift-tools-version: 6.0
// FlowNote Swift: the native macOS shell. SwiftUI window, sidebar, tabs and
// menus around the web app (the Tauri app's), run in a WKWebView; the backend
// is the Rust core shared with Tauri (src-tauri/core), built as a C library
// by native/ffi (native/build.sh builds it first).
import Foundation
import PackageDescription

let ffi = URL(fileURLWithPath: #filePath).deletingLastPathComponent().appendingPathComponent("ffi/target/release").path

let package = Package(
  name: "FlowNote",
  platforms: [.macOS("26.0")],
  targets: [
    // The Rust core's C functions (native/ffi).
    .systemLibrary(name: "CFlowNoteCore"),
    .executableTarget(
      name: "FlowNote",
      dependencies: ["CFlowNoteCore"],
      linkerSettings: [.unsafeFlags(["-L", ffi]), .linkedFramework("Security"), .linkedFramework("SystemConfiguration")]
    ),
  ],
  swiftLanguageModes: [.v5]
)
