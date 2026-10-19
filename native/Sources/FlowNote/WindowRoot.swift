import AppKit
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
          TabChip(window: window, tab: tab, active: tab.id == window.active, dirty: tab.id == window.active && window.dirty, closable: true) {
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
      // One catcher for the whole track (the toolbar does not give each tab its own frame):
      // the tab is found from where the click is, the tabs sharing the width equally.
      .overlay(MouseCatcher(rightAt: { at in if let tab = tab(at: at) { window.showMenu("tab", tab.id) } }, middleAt: { at in if let tab = tab(at: at) { window.call("closeTab", tab.id) } }))
      Button { window.call("newTab") } label: { Image(systemName: "plus").frame(width: 26, height: 26) }
        .buttonStyle(.borderless)
        .help("Nouvel onglet (⌘T)")
    }
    .frame(width: width)
  }

  private func tab(at fraction: Double) -> ShellTab? {
    guard !window.tabs.isEmpty else { return nil }
    return window.tabs[max(0, min(window.tabs.count - 1, Int(fraction * Double(window.tabs.count))))]
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
}

struct TabChip: View {
  let window: WindowModel
  let tab: ShellTab
  let active: Bool
  let dirty: Bool
  let closable: Bool
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

/// Right click and middle click on the view it covers; plain clicks go through.
/// The clicks are caught by a local event monitor, before the window hands them
/// out: in the toolbar, the window would otherwise show the toolbar's own menu.
/// Only the visible part counts (a row scrolled away does not take clicks).
struct MouseCatcher: NSViewRepresentable {
  var right: (() -> Void)?
  var middle: (() -> Void)?
  /// Same, told where the click is across the view (0 at the left edge, 1 at the right).
  var rightAt: ((Double) -> Void)?
  var middleAt: ((Double) -> Void)?

  final class View: NSView {
    var right: (() -> Void)?
    var middle: (() -> Void)?
    var rightAt: ((Double) -> Void)?
    var middleAt: ((Double) -> Void)?
    private var monitor: Any?

    private func across(_ event: NSEvent) -> Double {
      bounds.width > 0 ? Double(convert(event.locationInWindow, from: nil).x / bounds.width) : 0
    }

    /// Never in the way of plain clicks, hovering or dragging.
    override func hitTest(_ point: NSPoint) -> NSView? { nil }

    func covers(_ event: NSEvent) -> Bool {
      guard let window, event.window === window, !isHiddenOrHasHiddenAncestor else { return false }
      // Inside the view, and not clipped away (a row scrolled under the list's edges).
      // The toolbar does not clip its views: there, the visible rect is the whole window.
      let point = convert(event.locationInWindow, from: nil)
      return bounds.contains(point) && visibleRect.contains(point)
    }

    override func viewDidMoveToWindow() {
      if let monitor { NSEvent.removeMonitor(monitor) }
      monitor = nil
      guard window != nil else { return }
      monitor = NSEvent.addLocalMonitorForEvents(matching: [.rightMouseDown, .otherMouseDown, .otherMouseUp]) { [weak self] event in
        guard let self, self.covers(event) else { return event }
        switch event.type {
        case .rightMouseDown:
          if let rightAt = self.rightAt { rightAt(self.across(event)) } else if let right = self.right { right() } else { return event }
          return nil
        case .otherMouseDown where event.buttonNumber == 2 && (self.middle != nil || self.middleAt != nil):
          return nil
        case .otherMouseUp where event.buttonNumber == 2:
          if let middleAt = self.middleAt { middleAt(self.across(event)) } else if let middle = self.middle { middle() } else { return event }
          return nil
        default:
          return event
        }
      }
    }

    deinit { if let monitor { NSEvent.removeMonitor(monitor) } }
  }

  func makeNSView(context: Context) -> View {
    let view = View()
    updateNSView(view, context: context)
    return view
  }

  func updateNSView(_ view: View, context: Context) {
    view.right = right
    view.middle = middle
    view.rightAt = rightAt
    view.middleAt = middleAt
  }
}

/// A middle click on the view it backs.
struct MiddleClick: View {
  let action: () -> Void
  var body: some View { MouseCatcher(middle: action) }
}

/// A right click on the tree's empty space (not on a row, whose own catcher takes it): the root menu.
struct EmptySpaceMenu: NSViewRepresentable {
  let show: () -> Void

  final class View: NSView {
    var show: () -> Void = {}
    private var monitor: Any?

    override func viewDidMoveToWindow() {
      if let monitor { NSEvent.removeMonitor(monitor) }
      monitor = nil
      guard window != nil else { return }
      monitor = NSEvent.addLocalMonitorForEvents(matching: .rightMouseDown) { [weak self] event in
        guard let self, let window = self.window, event.window === window else { return event }
        let point = self.convert(event.locationInWindow, from: nil)
        guard self.bounds.contains(point) else { return event }
        // A row (or a tab) catches its own right clicks.
        if Self.catchers(in: window.contentView).contains(where: { ($0.right != nil || $0.rightAt != nil) && $0.covers(event) }) { return event }
        self.show()
        return nil
      }
    }

    deinit { if let monitor { NSEvent.removeMonitor(monitor) } }

    static func catchers(in view: NSView?) -> [MouseCatcher.View] {
      guard let view else { return [] }
      return (view as? MouseCatcher.View).map { [$0] } ?? view.subviews.flatMap { catchers(in: $0) }
    }
  }

  func makeNSView(context: Context) -> View {
    let view = View()
    view.show = show
    return view
  }

  func updateNSView(_ view: View, context: Context) { view.show = show }
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
