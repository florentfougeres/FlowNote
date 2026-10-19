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
  /// The hidden sidebar shown over the page while the pointer is near the left edge (like the Tauri app).
  @State private var peek = false

  private var sidebarVisibility: Binding<NavigationSplitViewVisibility> {
    Binding(get: { window.sidebarShown ? .all : .detailOnly }, set: { window.sidebarShown = $0 != .detailOnly })
  }

  var body: some View {
    Group {
      if app.vault == nil {
        // The app's welcome screen: recent vaults, open one, try the demo.
        WebViewHost(webView: window.webView)
          .ignoresSafeArea()
      } else {
        NavigationSplitView(columnVisibility: sidebarVisibility) {
          SidebarView(window: window)
            .navigationSplitViewColumnWidth(min: 200, ideal: 260, max: 480)
        } detail: {
          WebViewHost(webView: window.webView)
            .ignoresSafeArea(edges: .bottom)
            .onGeometryChange(for: CGFloat.self) { $0.size.width } action: { detailWidth = $0 }
            .overlay(alignment: .leading) {
              if !window.sidebarShown && !window.focus {
                if peek {
                  SidebarView(window: window)
                    .frame(width: 260)
                    .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 12))
                    .shadow(radius: 12)
                    .padding(6)
                    .onHover { if !$0 { peek = false } }
                    .transition(.move(edge: .leading).combined(with: .opacity))
                } else {
                  Color.clear.frame(width: 8).contentShape(Rectangle()).onHover { if $0 { withAnimation(.snappy) { peek = true } } }
                }
              }
            }
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
        // Focus mode: the tabs go too (Escape or ⌘⇧M brings them back).
        .toolbarVisibility(window.focus ? .hidden : .automatic, for: .windowToolbar)
      }
    }
    .navigationTitle(window.title)
    // Focus mode hides the sidebar, as in the Tauri app; it comes back after.
    .onChange(of: window.focus) { _, focus in window.sidebarShown = !focus }
    .focusedSceneValue(\.window, window)
    .background(WindowState(edited: window.dirty))
    .frame(minWidth: 760, minHeight: 480)
  }
}

/// The app's tabs, in the toolbar, like Safari's compact tab bar: one grey
/// rounded track, tabs sharing its width with thin separators, the active one
/// a white capsule. As in the Tauri app: drag to reorder, middle click or × to
/// close, right click for the tab menu (split view), + for a new tab.
struct TabStrip: View {
  let window: WindowModel
  let width: CGFloat
  @State private var dragged: String?
  @State private var offset: CGFloat = 0

  /// Each tab's width: the track shared equally.
  private var tabWidth: CGFloat { max(60, (width - 40) / CGFloat(max(1, window.tabs.count))) }

  var body: some View {
    HStack(spacing: 6) {
      HStack(spacing: 0) {
        ForEach(Array(window.tabs.enumerated()), id: \.element.id) { index, tab in
          // A separator between two tabs that are not the active one.
          if index > 0 {
            let near = tab.id == window.active || window.tabs[index - 1].id == window.active
            Rectangle().fill(.separator).frame(width: 1, height: 16).opacity(near || dragged != nil ? 0 : 1)
          }
          TabChip(window: window, tab: tab, active: tab.id == window.active, dirty: tab.id == window.active && window.dirty, closable: true, menu: menu(for: tab)) {
            window.call("switchTab", tab.id)
          } close: {
            window.call("closeTab", tab.id)
          }
          .offset(x: dragged == tab.id ? offset : 0)
          .zIndex(dragged == tab.id ? 1 : 0)
          .gesture(
            DragGesture(minimumDistance: 6)
              .onChanged { value in
                dragged = tab.id
                offset = value.translation.width
              }
              .onEnded { _ in drop(tab, from: index) }
          )
        }
      }
      .padding(2)
      .background(Capsule().fill(Color.primary.opacity(0.07)))
      Button { window.call("newTab") } label: { Image(systemName: "plus").frame(width: 26, height: 26) }
        .buttonStyle(.borderless)
        .help("Nouvel onglet (⌘T)")
    }
    .frame(width: width)
  }

  /// Dropped after a drag: the tab moves to where it was let go (`reorderTab` in App.tsx).
  private func drop(_ tab: ShellTab, from index: Int) {
    let target = max(0, min(window.tabs.count - 1, index + Int((offset / tabWidth).rounded())))
    dragged = nil
    offset = 0
    guard target != index else { return }
    var order = window.tabs.map(\.id)
    order.remove(at: index)
    order.insert(tab.id, at: target)
    window.call("reorderTab", tab.id, target + 1 < order.count ? order[target + 1] : NSNull())
  }

  /// The tab menu of the Tauri app (App.tsx).
  private func menu(for tab: ShellTab) -> [MenuEntry] {
    let isActive = tab.id == window.active
    let isPage = { (path: String?) in path.map { !$0.hasPrefix("flownote:") } ?? false }
    var items: [MenuEntry] = []
    if tab.split != nil {
      if isActive { items.append(.item("Échanger les côtés") { window.call("swapSplit") }) }
      items.append(.item("Séparer en deux onglets") { window.call("separateTab", tab.id) })
      items.append(.item("Fermer la page de droite") { window.call("closeSplit", tab.id) })
    } else if isPage(tab.path) && !isActive {
      items.append(.item("Afficher à droite de « \(window.activeTab?.title ?? "") »") { window.call("joinTab", tab.id) })
    } else if isActive && window.tabs.contains(where: { $0.id != tab.id && isPage($0.path) }) {
      items.append(.item("Diviser avec l'onglet suivant") { window.call("toggleSplit") })
    }
    items.append(.item("Fermer l'onglet") { window.call("closeTab", tab.id) })
    return items
  }
}

struct TabChip: View {
  let window: WindowModel
  let tab: ShellTab
  let active: Bool
  let dirty: Bool
  let closable: Bool
  let menu: [MenuEntry]
  let select: () -> Void
  let close: () -> Void
  @State private var hovered = false

  var body: some View {
    ZStack {
      HStack(spacing: 5) {
        PageIconView(path: tab.path, emoji: tab.icon, ticket: tab.ticket, presentation: tab.presentation)
        Text(tab.title)
          .font(.system(size: 12.5))
          .foregroundStyle(active ? .primary : .secondary)
          .lineLimit(1)
          .truncationMode(.tail)
        // Two pages side by side make one tab, both named in it.
        if let split = tab.split {
          Rectangle().fill(.separator).frame(width: 1, height: 12)
          PageIconView(path: split, emoji: tab.splitIcon, ticket: false, presentation: false)
          Text(tab.splitTitle ?? "")
            .font(.system(size: 12.5))
            .foregroundStyle(active ? .primary : .secondary)
            .lineLimit(1)
            .truncationMode(.tail)
        }
        if dirty { Circle().fill(.secondary).frame(width: 5, height: 5) }
      }
      .padding(.horizontal, 26)
      // Close on the left, under the pointer (like Safari).
      HStack {
        Button(action: close) { Image(systemName: "xmark").font(.system(size: 9, weight: .bold)).frame(width: 18, height: 18) }
          .buttonStyle(.borderless)
          .opacity(closable && hovered ? 1 : 0)
          .help("Fermer l'onglet (⌘W)")
        Spacer()
      }
      .padding(.leading, 6)
    }
    .frame(maxWidth: .infinity, minHeight: 28, maxHeight: 28)
    .background {
      if active {
        Capsule().fill(.background).shadow(color: .black.opacity(0.15), radius: 1.5, y: 0.5)
      } else if hovered {
        Capsule().fill(Color.primary.opacity(0.06))
      }
    }
    .contentShape(Capsule())
    .onTapGesture(perform: select)
    .onHover { hovered = $0 }
    // The toolbar keeps right clicks for itself: the tab catches them first.
    .overlay(MouseCatcher(menu: menu, middle: close))
    .help(tab.split.map { "\(tab.path ?? "Accueil")  |  \($0)" } ?? tab.path ?? "Accueil")
  }
}

/// A page's icon: its emoji, else the icon of its kind (as PageIcon in Sidebar.tsx).
struct PageIconView: View {
  let path: String?
  let emoji: String?
  let ticket: Bool
  let presentation: Bool

  var body: some View {
    if let emoji { Text(emoji).font(.system(size: 11)) } else { Image(systemName: symbol).font(.system(size: 11)).foregroundStyle(.secondary) }
  }

  private var symbol: String {
    guard let path = path?.lowercased() else { return "house" }
    if let view = AppModel.views.first(where: { $0.path == path }) { return view.icon }
    if path == "flownote:settings" { return "gearshape" }
    if path.hasSuffix(".base") { return "tablecells" }
    if path.hasSuffix(".excalidraw.md") { return "scribble" }
    if path.hasSuffix(".mindmap.md") { return "point.3.connected.trianglepath.dotted" }
    if ticket { return "ticket" }
    if presentation { return "play.rectangle" }
    return "doc.text"
  }
}

/// An entry of a menu shown by MouseCatcher.
enum MenuEntry {
  case item(String, () -> Void)
  case separator
  case submenu(String, [MenuEntry])
}

/// Right click (a menu) and middle click on the view it covers; plain clicks go through.
struct MouseCatcher: NSViewRepresentable {
  var menu: [MenuEntry] = []
  var middle: (() -> Void)?

  final class ActionItem: NSMenuItem {
    var handler: () -> Void = {}
    @objc func run() { handler() }
  }

  final class View: NSView {
    var menuEntries: [MenuEntry] = []
    var middle: (() -> Void)?

    override func hitTest(_ point: NSPoint) -> NSView? {
      guard let event = NSApp.currentEvent else { return nil }
      switch event.type {
      case .rightMouseDown, .rightMouseUp: return menuEntries.isEmpty ? nil : super.hitTest(point)
      case .otherMouseDown, .otherMouseUp: return middle == nil ? nil : super.hitTest(point)
      default: return nil
      }
    }

    override func rightMouseDown(with event: NSEvent) {
      NSMenu.popUpContextMenu(Self.build(menuEntries), with: event, for: self)
    }

    // The press is kept here too, so that the list (or the toolbar) does not take the gesture.
    override func otherMouseDown(with event: NSEvent) {
      if event.buttonNumber != 2 { super.otherMouseDown(with: event) }
    }

    override func otherMouseUp(with event: NSEvent) {
      if event.buttonNumber == 2 { middle?() } else { super.otherMouseUp(with: event) }
    }

    static func build(_ entries: [MenuEntry]) -> NSMenu {
      let menu = NSMenu()
      for entry in entries {
        switch entry {
        case .separator:
          menu.addItem(.separator())
        case .item(let title, let action):
          let item = ActionItem(title: title, action: #selector(ActionItem.run), keyEquivalent: "")
          item.target = item
          item.handler = action
          menu.addItem(item)
        case .submenu(let title, let children):
          let item = NSMenuItem(title: title, action: nil, keyEquivalent: "")
          item.submenu = build(children)
          menu.addItem(item)
        }
      }
      return menu
    }
  }

  func makeNSView(context: Context) -> View {
    let view = View()
    updateNSView(view, context: context)
    return view
  }

  func updateNSView(_ view: View, context: Context) {
    view.menuEntries = menu
    view.middle = middle
  }
}

/// A middle click on the view it backs.
struct MiddleClick: View {
  let action: () -> Void
  var body: some View { MouseCatcher(middle: action) }
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
