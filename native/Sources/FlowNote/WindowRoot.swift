import AppKit
import FlowNoteCore
import SwiftUI
import WebKit

/// A window (a tab): the vault's tree on the left, the page on the right.
struct WindowRoot: View {
  @Environment(AppModel.self) private var app
  @Environment(\.openWindow) private var openWindow
  @State private var page: PageModel

  init(initialPath: String?) {
    // FLOWNOTE_OPEN: a page shown at launch (development, screenshots).
    _page = State(initialValue: PageModel(path: initialPath ?? ProcessInfo.processInfo.environment["FLOWNOTE_OPEN"]))
  }

  var body: some View {
    Group {
      if app.vault == nil {
        WelcomeView()
      } else {
        NavigationSplitView {
          SidebarView(page: page)
            .navigationSplitViewColumnWidth(min: 200, ideal: 260, max: 420)
        } detail: {
          WebViewHost(webView: page.webView)
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
          PageToolbar(page: page)
        }
      }
    }
    .navigationTitle(page.title)
    .navigationSubtitle(page.path.map { ($0 as NSString).deletingLastPathComponent } ?? "")
    .focusedSceneValue(\.page, page)
    .sheet(item: $page.nameRequest) { request in NameSheet(request: request) }
    .background(WindowTabbing(edited: page.dirty))
    .onAppear { page.openTab = { path in if let path { openWindow(id: "page", value: path) } else { openWindow(id: "page") } } }
    .frame(minWidth: 720, minHeight: 480)
  }
}

/// The page's web view, kept by the tab's model (it lives as long as the tab).
struct WebViewHost: NSViewRepresentable {
  let webView: WKWebView
  func makeNSView(context: Context) -> WKWebView { webView }
  func updateNSView(_ view: WKWebView, context: Context) {}
}

/// Every window joins the tabs of the others; unsaved changes show as the dot in its close button.
struct WindowTabbing: NSViewRepresentable {
  let edited: Bool

  func makeNSView(context: Context) -> NSView {
    let view = NSView()
    DispatchQueue.main.async {
      view.window?.tabbingMode = .preferred
      view.window?.tabbingIdentifier = "FlowNote"
    }
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

  /// Focus mode hides the sidebar: the window already has that button.
  private var buttons: [PageTool] { page.tools.filter { $0.group == nil && $0.icon != "focus" } }
  private var groupTools: [PageTool] { page.tools.filter { $0.group != nil } }

  var body: some ToolbarContent {
    if !groupTools.isEmpty {
      ToolbarItem(placement: .principal) {
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
      ForEach(buttons) { tool in
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
    }
  }
}

/// SF Symbol for an icon of the web app (Icon.tsx).
func symbol(_ icon: String) -> String {
  let symbols = [
    "outline": "list.bullet.indent", "eye": "eye", "spelling": "textformat.abc.dottedunderline",
    "slides": "rectangle.on.rectangle", "play": "play", "export": "square.and.arrow.up", "clock": "clock.arrow.circlepath",
    "width": "arrow.left.and.right", "more": "ellipsis", "raw": "chevron.left.forwardslash.chevron.right", "center": "scope",
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
  @State private var kind = "note"
  @State private var answered = false

  init(request: NameRequest) {
    self.request = request
    _name = State(initialValue: request.initial)
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
