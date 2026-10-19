import AppKit
import FlowNoteCore
import SwiftUI
import WebKit

/// A window: the native sidebar, then the app (the same as the Tauri app's) in
/// a web view. The toolbar holds the history buttons and the app's tabs; the
/// page's own bar (breadcrumb, tools) is right below, drawn by the app.
struct WindowRoot: View {
  @Environment(AppModel.self) private var app
  @State private var window = WindowModel()
  /// Width of the page column: the tabs share what the history buttons leave, like Safari's.
  @State private var detailWidth: CGFloat = 800

  var body: some View {
    Group {
      if app.vault == nil {
        // The app's welcome screen: recent vaults, open one, try the demo.
        WebViewHost(webView: window.webView)
          .ignoresSafeArea()
      } else {
        NavigationSplitView {
          SidebarView(window: window)
            .navigationSplitViewColumnWidth(min: 200, ideal: 260, max: 480)
        } detail: {
          WebViewHost(webView: window.webView)
            .ignoresSafeArea(edges: .bottom)
            .onGeometryChange(for: CGFloat.self) { $0.size.width } action: { detailWidth = $0 }
        }
        .toolbar {
          ToolbarItemGroup(placement: .navigation) {
            Button { window.call("back") } label: { Label("Page précédente", systemImage: "chevron.left") }
              .disabled(!window.canBack)
              .help("Page précédente (⌘[)")
            Button { window.call("forward") } label: { Label("Page suivante", systemImage: "chevron.right") }
              .disabled(!window.canForward)
              .help("Page suivante (⌘])")
          }
          ToolbarItem(placement: .navigation) {
            TabStrip(window: window, width: max(220, detailWidth - 110))
          }
          .sharedBackgroundVisibility(.hidden)
        }
        // The tab already says which page is shown.
        .toolbar(removing: .title)
      }
    }
    .navigationTitle(window.title)
    .focusedSceneValue(\.window, window)
    .background(WindowState(edited: window.dirty))
    .frame(minWidth: 760, minHeight: 480)
  }
}

/// The app's tabs, in the toolbar, like Safari's: they share the width; right click for the tab menu.
struct TabStrip: View {
  let window: WindowModel
  let width: CGFloat

  var body: some View {
    HStack(spacing: 2) {
      ForEach(window.tabs) { tab in
        TabChip(tab: tab, active: tab.id == window.active, dirty: tab.id == window.active && window.dirty, closable: window.tabs.count > 1) {
          window.call("switchTab", tab.id)
        } close: {
          window.call("closeTab", tab.id)
        }
        .contextMenu { menu(for: tab) }
      }
      Button { window.call("newTab") } label: { Image(systemName: "plus").frame(width: 28, height: 28) }
        .buttonStyle(.borderless)
        .help("Nouvel onglet (⌘T)")
    }
    .frame(width: width)
  }

  /// The tab menu of the Tauri app (App.tsx).
  @ViewBuilder private func menu(for tab: ShellTab) -> some View {
    let isActive = tab.id == window.active
    let page = tab.path.map { !$0.hasPrefix("flownote:") } ?? false
    if tab.split != nil {
      if isActive { Button("Échanger les côtés") { window.call("swapSplit") } }
      Button("Séparer en deux onglets") { window.call("separateTab", tab.id) }
      Button("Fermer la page de droite") { window.call("closeSplit", tab.id) }
    } else if page && !isActive {
      Button("Afficher à droite de « \(window.activeTab?.title ?? "") »") { window.call("joinTab", tab.id) }
    } else if isActive && window.tabs.contains(where: { $0.id != tab.id && $0.path.map { !$0.hasPrefix("flownote:") } == true }) {
      Button("Diviser avec l'onglet suivant") { window.call("toggleSplit") }
    }
    Button("Fermer l'onglet") { window.call("closeTab", tab.id) }
  }
}

struct TabChip: View {
  let tab: ShellTab
  let active: Bool
  let dirty: Bool
  let closable: Bool
  let select: () -> Void
  let close: () -> Void
  @State private var hovered = false

  var body: some View {
    HStack(spacing: 6) {
      // Close on the left, under the pointer (like Safari).
      Button(action: close) { Image(systemName: "xmark").font(.system(size: 9, weight: .semibold)) }
        .buttonStyle(.borderless)
        .opacity(closable && hovered ? 1 : 0)
        .disabled(!closable)
        .help("Fermer l'onglet (⌘W)")
      Spacer(minLength: 0)
      Text(tab.splitTitle.map { "\(tab.title) | \($0)" } ?? tab.title)
        .font(.system(size: 12, weight: active ? .medium : .regular))
        .foregroundStyle(active ? .primary : .secondary)
        .lineLimit(1)
        .truncationMode(.tail)
      if dirty { Circle().fill(.secondary).frame(width: 5, height: 5) }
      Spacer(minLength: 0)
      Color.clear.frame(width: 12)
    }
    .padding(.horizontal, 8)
    .frame(maxWidth: .infinity, minHeight: 28, maxHeight: 28)
    // Safari's tabs: the active one raised and light, the others flat, lit under the pointer.
    .background {
      RoundedRectangle(cornerRadius: 8, style: .continuous)
        .fill(active ? AnyShapeStyle(.background) : hovered ? AnyShapeStyle(.primary.opacity(0.06)) : AnyShapeStyle(.clear))
        .shadow(color: .black.opacity(active ? 0.12 : 0), radius: 1, y: 0.5)
    }
    .contentShape(RoundedRectangle(cornerRadius: 8))
    .onTapGesture(perform: select)
    .onHover { hovered = $0 }
    .background(MiddleClick { if closable { close() } })
    .help(tab.path ?? "Accueil")
  }
}

/// A middle click on the view it backs (AppKit sends it to the view under the pointer).
struct MiddleClick: NSViewRepresentable {
  let action: () -> Void

  final class View: NSView {
    var action: () -> Void = {}
    override func otherMouseUp(with event: NSEvent) {
      if event.buttonNumber == 2 { action() } else { super.otherMouseUp(with: event) }
    }
    // Plain clicks go through to SwiftUI.
    override func hitTest(_ point: NSPoint) -> NSView? {
      guard let event = NSApp.currentEvent, event.type == .otherMouseDown || event.type == .otherMouseUp else { return nil }
      return super.hitTest(point)
    }
  }

  func makeNSView(context: Context) -> View {
    let view = View()
    view.action = action
    return view
  }

  func updateNSView(_ view: View, context: Context) { view.action = action }
}

/// The window's web view (it lives as long as the window).
struct WebViewHost: NSViewRepresentable {
  let webView: WKWebView
  func makeNSView(context: Context) -> WKWebView { webView }
  func updateNSView(_ view: WKWebView, context: Context) {}
}

/// No system tabs (the app's are in the toolbar); unsaved changes show as the dot in the close button.
struct WindowState: NSViewRepresentable {
  let edited: Bool

  func makeNSView(context: Context) -> NSView {
    let view = NSView()
    DispatchQueue.main.async { view.window?.tabbingMode = .disallowed }
    return view
  }

  func updateNSView(_ view: NSView, context: Context) {
    DispatchQueue.main.async { view.window?.isDocumentEdited = edited }
  }
}
