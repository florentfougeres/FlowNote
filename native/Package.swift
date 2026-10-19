// swift-tools-version: 6.0
// FlowNote's native macOS shell: SwiftUI sidebar, tabs and settings around
// the web pages of the app (embed.html) shown in a WKWebView.
import PackageDescription

let package = Package(
  name: "FlowNote",
  platforms: [.macOS("26.0")],
  targets: [
    // Vault file access (port of src-tauri/src/vault.rs), testable on its own.
    .target(name: "FlowNoteCore"),
    .executableTarget(name: "FlowNote", dependencies: ["FlowNoteCore"]),
    // `swift run vault-checks` (Swift Testing and XCTest need Xcode).
    .executableTarget(name: "vault-checks", dependencies: ["FlowNoteCore"], path: "Sources/VaultChecks"),
  ],
  swiftLanguageModes: [.v5]
)
