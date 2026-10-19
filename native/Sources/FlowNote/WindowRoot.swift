import AppKit
import FlowNoteCore
import SwiftUI
import WebKit

/// A window: the vault's tree on the left, the active tab's page on the right,
/// the tabs in the toolbar between the history buttons and the page's tools.
struct WindowRoot: View {
  @Environment(AppModel.self) private var app
  @State private var tabs: TabsModel
  /// The tabs' pages, kept with the window (restored at launch).
  @SceneStorage("tabs") private var savedTabs = ""
  private let restorable: Bool
  /// Width of the page column: the tabs take what the toolbar's buttons leave.
  @State private var detailWidth: CGFloat = 800

  init(initialPath: String?) {
    // FLOWNOTE_OPEN: a page shown at launch (development, screenshots).
    let forced = initialPath ?? ProcessInfo.processInfo.environment["FLOWNOTE_OPEN"]
    restorable = forced == nil
    _tabs = State(initialValue: TabsModel(paths: [forced ?? TabsModel.home]))
  }

  private var page: PageModel { tabs.active }

  var body: some View {
    @Bindable var page = tabs.active
    Group {
      if app.vault == nil {
        WelcomeView()
      } else {
        NavigationSplitView {
          SidebarView(page: page)
            .navigationSplitViewColumnWidth(min: 200, ideal: 260, max: 420)
        } detail: {
          WebViewHost(webView: page.webView)
            .id(ObjectIdentifier(page))
            .onGeometryChange(for: CGFloat.self) { $0.size.width } action: { detailWidth = $0 }
            .ignoresSafeArea(edges: .bottom)
            .overlay(alignment: .bottom) { ToastView(message: page.toast) }
        }
        .toolbar {
          ToolbarItemGroup(placement: .navigation) {
            Button { page.goBack() } label: { Label("Page précédente", systemImage: "chevron.left") }
              .disabled(page.back.isEmpty)
              .help("Page précédente (⌘[)")
            Button { page.goForward() } label: { Label("Page suivante", systemImage: "chevron.right") }
              .disabled(page.forward.isEmpty)
              .help("Page suivante (⌘])")
          }
          ToolbarItem(placement: .principal) {
            TabStrip(tabs: tabs)
              .frame(width: max(160, detailWidth - 90 - PageToolbar.width(page.tools)))
          }
          PageToolbar(page: page)
        }
        // The tab already says which page is shown.
        .toolbar(removing: .title)
      }
    }
    .navigationTitle(page.title)
    .focusedSceneValue(\.page, page)
    .focusedSceneValue(\.tabs, tabs)
    .sheet(item: $page.nameRequest) { request in NameSheet(request: request) }
    .sheet(isPresented: $page.searching) { SearchPanel(page: page) }
    .background(WindowState(edited: tabs.pages.contains { $0.dirty }))
    .onAppear {
      if restorable, let data = savedTabs.data(using: .utf8), let paths = try? JSONDecoder().decode([String].self, from: data) { tabs.restore(paths) }
    }
    .onChange(of: tabs.paths) { _, paths in
      savedTabs = (try? String(decoding: JSONEncoder().encode(paths), as: UTF8.self)) ?? ""
    }
    .frame(minWidth: 720, minHeight: 480)
  }
}

/// The tabs, sharing the toolbar's width like Safari's compact tabs: one tab takes it all.
struct TabStrip: View {
  @Environment(AppModel.self) private var app
  let tabs: TabsModel

  var body: some View {
    HStack(spacing: 4) {
      ForEach(tabs.pages, id: \.id) { page in
        TabChip(page: page, active: page === tabs.active, closable: tabs.pages.count > 1) {
          tabs.select(page)
        } close: {
          Task { await tabs.close(page) }
        }
      }
      Button { tabs.open(nil) } label: { Image(systemName: "plus") }
        .buttonStyle(.borderless)
        .help("Nouvel onglet (⌘T)")
        .padding(.horizontal, 6)
    }

  }
}

struct TabChip: View {
  @Environment(AppModel.self) private var app
  let page: PageModel
  let active: Bool
  let closable: Bool
  let select: () -> Void
  let close: () -> Void
  @State private var hovered = false

  var body: some View {
    HStack(spacing: 6) {
      // Close on the left, shown under the pointer (like Safari).
      Button(action: close) { Image(systemName: "xmark").font(.system(size: 9, weight: .semibold)) }
        .buttonStyle(.borderless)
        .opacity(closable && hovered ? 1 : 0)
        .disabled(!closable)
        .help("Fermer l'onglet (⌘W)")
      Spacer(minLength: 0)
      Text(page.title)
        .font(.callout)
        .fontWeight(active ? .medium : .regular)
        .foregroundStyle(active ? .primary : .secondary)
        .lineLimit(1)
        .truncationMode(.tail)
      if page.dirty { Circle().fill(.secondary).frame(width: 5, height: 5) }
      Spacer(minLength: 0)
      Color.clear.frame(width: 12)
    }
    .padding(.horizontal, 8)
    .frame(maxWidth: .infinity, minHeight: 26)
    .background(active ? AnyShapeStyle(.quaternary) : AnyShapeStyle(.clear), in: Capsule())
    .contentShape(Capsule())
    .onTapGesture(perform: select)
    .onHover { hovered = $0 }
    .help(page.path ?? "")
  }
}

/// The page's web view, kept by the tab's model (it lives as long as the tab).
struct WebViewHost: NSViewRepresentable {
  let webView: WKWebView
  func makeNSView(context: Context) -> WKWebView { webView }
  func updateNSView(_ view: WKWebView, context: Context) {}
}

/// A window of its own (tabs are drawn in the toolbar); unsaved changes show as the dot in its close button.
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

/// The page's own buttons (outline, reading mode, width, raw Markdown…) as
/// Liquid Glass toolbar items; drawing tools as one segmented choice.
struct PageToolbar: ToolbarContent {
  let page: PageModel

  /// Width the toolbar gives the page's buttons (to size the tabs beside them).
  static func width(_ tools: [PageTool]) -> CGFloat {
    let shown = tools.filter { $0.group == nil && $0.icon != "focus" }
    let direct = shown.filter { direct.contains($0.icon) }.count
    let menu = shown.count > direct ? 1 : 0
    let group = tools.filter { $0.group != nil }.count
    return CGFloat(direct) * 36 + CGFloat(menu) * 52 + (group > 0 ? CGFloat(group) * 30 + 24 : 0) + (direct > 0 ? 24 : 0) + 24
  }

  /// Focus mode hides the sidebar: the window already has that button.
  private var buttons: [PageTool] { page.tools.filter { $0.group == nil && $0.icon != "focus" } }
  private var groupTools: [PageTool] { page.tools.filter { $0.group != nil } }

  var body: some ToolbarContent {
    if !groupTools.isEmpty {
      ToolbarItem(placement: .primaryAction) {
        Picker("Outil", selection: Binding(get: { groupTools.first { $0.active == true }?.id ?? "" }, set: { page.runTool($0) })) {
          ForEach(groupTools) { tool in
            Image(systemName: symbol(tool.icon)).help(tool.label).tag(tool.id)
          }
        }
        .pickerStyle(.segmented)
        .labelsHidden()
      }
    }
    ToolbarItemGroup(placement: .primaryAction) {
      ForEach(buttons.filter { Self.direct.contains($0.icon) }) { tool in
        if let active = tool.active {
          Toggle(isOn: Binding(get: { active }, set: { _ in page.runTool(tool.id) })) {
            Label(tool.label, systemImage: symbol(tool.icon))
          }
          .help(tool.label)
          .disabled(tool.disabled)
        } else {
          Button { page.runTool(tool.id) } label: { Label(tool.label, systemImage: symbol(tool.icon)) }
            .help(tool.label)
            .disabled(tool.disabled)
        }
      }
      let others = buttons.filter { !Self.direct.contains($0.icon) }
      if !others.isEmpty {
        Menu {
          ForEach(others) { tool in
            if let active = tool.active {
              Toggle(isOn: Binding(get: { active }, set: { _ in page.runTool(tool.id) })) {
                Label(tool.label, systemImage: symbol(tool.icon))
              }
              .disabled(tool.disabled)
            } else {
              Button { page.runTool(tool.id) } label: { Label(tool.label, systemImage: symbol(tool.icon)) }
                .disabled(tool.disabled)
            }
          }
        } label: {
          Label("Plus d'actions", systemImage: "ellipsis")
        }
        .help("Plus d'actions")
      }
    }
  }

  /// Shown as buttons; the other actions go in the "…" menu, to keep the toolbar light.
  private static let direct: Set<String> = ["outline", "eye", "raw", "play", "center"]
}

/// SF Symbol for an icon of the web app (Icon.tsx).
func symbol(_ icon: String) -> String {
  let symbols = [
    "outline": "list.bullet.indent", "eye": "eye", "spelling": "textformat.abc.dottedunderline",
    "slides": "rectangle.on.rectangle", "play": "play", "export": "square.and.arrow.up", "clock": "clock.arrow.circlepath",
    "width": "arrow.left.and.right", "more": "square.and.arrow.up.on.square", "raw": "chevron.left.forwardslash.chevron.right", "center": "scope",
    "pointer": "cursorarrow", "hand": "hand.raised", "rectangle": "rectangle", "diamond": "diamond", "ellipse": "circle",
    "arrow": "arrow.right", "line": "line.diagonal", "pencil": "pencil", "text": "textformat", "image": "photo", "eraser": "eraser",
  ]
  return symbols[icon] ?? "circle"
}

struct ToastView: View {
  let message: String?
  var body: some View {
    if let message {
      Text(message)
        .font(.callout)
        .padding(.horizontal, 14)
        .padding(.vertical, 8)
        .glassEffect(.regular, in: .capsule)
        .padding(.bottom, 18)
        .transition(.move(edge: .bottom).combined(with: .opacity))
    }
  }
}

struct WelcomeView: View {
  @Environment(AppModel.self) private var app
  var body: some View {
    ContentUnavailableView {
      Label("Aucun vault ouvert", systemImage: "books.vertical")
    } description: {
      Text("FlowNote édite un vault Obsidian : un dossier de notes Markdown, sur ce Mac ou dans iCloud Drive.")
    } actions: {
      Button("Ouvrir un vault…") { app.chooseVault() }
        .buttonStyle(.glassProminent)
      Button("Choisir dans iCloud Drive…") { app.chooseVault(inICloud: true) }
        .buttonStyle(.glass)
      if !app.recentVaults.isEmpty {
        VStack(alignment: .leading, spacing: 6) {
          Text("Récents").font(.caption).foregroundStyle(.secondary)
          ForEach(app.recentVaults, id: \.self) { url in
            Button { app.open(url) } label: {
              Label(url.lastPathComponent, systemImage: url.path.contains("/Mobile Documents/") ? "icloud" : "folder")
            }
            .buttonStyle(.link)
            .help(url.path)
          }
        }
        .padding(.top, 12)
      }
    }
  }
}

/// Page kinds offered for a new page (`PageKind` in pageKinds.ts).
let pageKinds: [(id: String, label: String, icon: String)] = [
  ("note", "Note", "doc.text"),
  ("base", "Base", "tablecells"),
  ("drawing", "Croquis", "scribble"),
  ("mindmap", "Mind map", "point.3.connected.trianglepath.dotted"),
  ("ticket", "Ticket", "ticket"),
  ("presentation", "Présentation", "play.rectangle"),
]

struct NameSheet: View {
  let request: NameRequest
  @Environment(\.dismiss) private var dismiss
  @State private var name: String
  @State private var kind: String
  @State private var answered = false

  init(request: NameRequest) {
    self.request = request
    _name = State(initialValue: request.initial)
    _kind = State(initialValue: request.kind)
  }

  var body: some View {
    VStack(alignment: .leading, spacing: 14) {
      Text(request.title).font(.headline)
      TextField("Nom", text: $name)
        .textFieldStyle(.roundedBorder)
        .onSubmit(confirm)
      if request.kinds {
        Picker("Type", selection: $kind) {
          ForEach(pageKinds, id: \.id) { kind in Label(kind.label, systemImage: kind.icon).tag(kind.id) }
        }
      }
      HStack {
        Spacer()
        Button("Annuler", role: .cancel) { finish(nil) }
          .keyboardShortcut(.cancelAction)
        Button(request.kinds ? "Créer" : "OK", action: confirm)
          .keyboardShortcut(.defaultAction)
          .disabled(name.trimmingCharacters(in: .whitespaces).isEmpty)
      }
    }
    .padding(20)
    .frame(width: 360)
    .onDisappear { if !answered { request.done(nil, kind) } }
  }

  private func confirm() {
    let trimmed = name.trimmingCharacters(in: .whitespaces)
    if !trimmed.isEmpty { finish(trimmed) }
  }

  private func finish(_ value: String?) {
    answered = true
    request.done(value, kind)
    dismiss()
  }
}
