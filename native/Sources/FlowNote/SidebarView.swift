import AppKit
import FlowNoteCore
import SwiftUI

/// The sidebar of the Tauri app, drawn natively: the vault, the views, the
/// favorites, the pages, then Git, the settings and the help. Every action is
/// the web sidebar's own (names asked, links followed, as in the Tauri app).
struct SidebarView: View {
  @Environment(AppModel.self) private var app
  let window: WindowModel

  /// Selected row: the active tab's page or view ("home" for the home page).
  private var selection: Binding<String?> {
    Binding(
      get: { window.activeTab.map { $0.path ?? "home" } },
      set: { id in
        guard let id else { return }
        // As in the Tauri sidebar: ⌥-click opens the page on the right (split view), ⌘-click in a new tab.
        let flags = NSApp.currentEvent?.modifierFlags ?? []
        if id == "home" { window.call("select", NSNull(), flags.contains(.command)) }
        // A folder only opens and closes.
        else if id.hasPrefix("flownote:") || app.entry(id)?.isFolder == false {
          if flags.contains(.option) && !id.hasPrefix("flownote:") { window.sidebar("onOpenRight", id) } else { window.call("select", id, flags.contains(.command)) }
        }
      })
  }

  var body: some View {
    VStack(spacing: 0) {
      HStack {
        VaultMenu(window: window)
        Spacer()
        Button { window.call("newPage") } label: { Image(systemName: "square.and.pencil") }
          .buttonStyle(.borderless)
          .help("Nouvelle page (⌘N)")
      }
      .padding(.horizontal, 14)
      .padding(.vertical, 6)
      // The views, flush with the vault's name (a list would indent them).
      // The Tauri sidebar's order (Sidebar.tsx).
      VStack(alignment: .leading, spacing: 2) {
        viewRow(AppModel.views[0])
        BottomRow(title: "Rechercher", icon: "magnifyingglass") { window.call("search") }
          .help("Rechercher une page (⌘P)")
        BottomRow(title: "Rechercher dans les notes", icon: "text.magnifyingglass") { window.call("vaultSearch") }
          .help("Rechercher dans les notes (⌘⇧F)")
        ForEach(AppModel.views.dropFirst(), id: \.title) { view in viewRow(view) }
      }
      .padding(.horizontal, 8)
      list
      VStack(alignment: .leading, spacing: 2) {
        if let changes = window.gitChanges {
          BottomRow(title: "Git", icon: "arrow.triangle.branch", active: window.gitOpen, badge: changes) { window.call("git") }
            .help("Git (⌘⇧G)")
        }
        BottomRow(title: "Réglages", icon: "gearshape", active: window.activeTab?.path == "flownote:settings") { window.call("settings") }
          .help("Réglages (⌘,)")
        BottomRow(title: "Aide et raccourcis", icon: "questionmark.circle") { window.call("help") }
          .help("Aide et raccourcis (⌘/)")
      }
      .padding(8)
    }
    .overlay {
      if let error = app.error { ContentUnavailableView("Vault illisible", systemImage: "exclamationmark.triangle", description: Text(error)) }
    }
  }

  /// A view of the app (⌘-click or middle click: in a new tab).
  private func viewRow(_ view: (path: String?, title: String, icon: String)) -> some View {
    BottomRow(title: view.title, icon: view.icon, active: window.activeTab.map { $0.path == view.path } ?? false) {
      window.call("select", view.path ?? NSNull(), NSApp.currentEvent?.modifierFlags.contains(.command) ?? false)
    }
    .background(MiddleClick { window.call("select", view.path ?? NSNull(), true) })
  }

  private var list: some View {
    List(selection: selection) {
      if !window.favorites.isEmpty {
        Section("Favoris") {
          ForEach(window.favorites, id: \.self) { path in
            if let entry = app.entry(path) { row(entry) }
          }
        }
      }
      Section {
        OutlineGroup(app.tree, children: \.folderChildren) { entry in row(entry) }
      } header: {
        PagesHeader(window: window)
      }
    }
    .listStyle(.sidebar)
    .contextMenu(forSelectionType: String.self) { ids in
      if let id = ids.first, let entry = app.entry(id) { menu(for: entry) } else if ids.isEmpty { rootMenu }
    } primaryAction: { ids in
      if let id = ids.first, app.entry(id)?.isFolder == false { window.call("select", id, true) }
    }
  }

  @ViewBuilder private func row(_ entry: VaultEntry) -> some View {
    let live = window.live.flatMap { $0.path == entry.path ? $0 : nil }
    let content = SidebarRow(window: window, entry: entry, title: window.title(of: entry), emoji: live != nil ? live!.icon : entry.icon) { menu(for: entry) }
      .tag(entry.path)
      .background(MiddleClick { if !entry.isFolder { window.call("select", entry.path, true) } })
      .dropDestination(for: String.self) { paths, _ in drop(paths, into: entry.path, folder: entry.isFolder) }
    // Tickets and their folder stay where the app numbers them (Sidebar.tsx).
    if entry.ticket == true || window.inTickets(entry.path) { content } else { content.draggable(entry.path) }
  }

  /// Pages or folders dropped on a folder (or on "Pages": the vault's root), as the web sidebar moves them.
  private func drop(_ paths: [String], into target: String, folder: Bool) -> Bool {
    guard folder, !window.inTickets(target) else { return false }
    for path in paths where path != target && (path as NSString).deletingLastPathComponent != target {
      let isFolder = app.entry(path)?.isFolder ?? false
      if isFolder && target.hasPrefix("\(path)/") { continue }
      window.sidebar("onMove", ["path": path, "folder": isFolder], target)
    }
    return true
  }

  @ViewBuilder private var rootMenu: some View {
    Button("Nouvelle page") { window.sidebar("onNewPageInFolder", "") }
    Button("Nouveau dossier") { window.sidebar("onNewFolder", "") }
  }

  /// The menus of the Tauri sidebar (Sidebar.tsx).
  @ViewBuilder private func menu(for entry: VaultEntry) -> some View {
    if entry.isFolder {
      Button("Nouvelle page dans ce dossier") { window.sidebar("onNewPageInFolder", entry.path) }
      Button("Nouveau sous-dossier") { window.sidebar("onNewFolder", entry.path) }
      Button("Afficher dans le Finder") { window.sidebar("onReveal", entry.path) }
      Divider()
      Button("Renommer") { window.sidebar("onRenameFolder", entry.path) }
      moveMenu(entry)
      Button("Supprimer", role: .destructive) { window.sidebar("onDeleteFolder", entry.path) }
    } else {
      Button("Ouvrir dans un nouvel onglet") { window.call("select", entry.path, true) }
      Button("Ouvrir à droite") { window.sidebar("onOpenRight", entry.path) }
      Button("Ajouter une sous-page") { window.sidebar("onNewPage", entry.path) }
      Button("Copier le lien") { window.sidebar("onCopyLink", entry.path) }
      if entry.ticket != true && !entry.path.hasSuffix(".base") { Button("Dupliquer") { window.sidebar("onDuplicate", entry.path) } }
      Button("Afficher dans le Finder") { window.sidebar("onReveal", entry.path) }
      Divider()
      Button("Renommer") { window.sidebar("onRename", entry.path) }
      moveMenu(entry)
      Button("Supprimer", role: .destructive) { window.sidebar("onDelete", entry.path) }
    }
  }

  private func moveMenu(_ entry: VaultEntry) -> some View {
    Menu("Déplacer vers") {
      Button("Racine du vault") { window.sidebar("onMove", ["path": entry.path, "folder": entry.isFolder], "") }
      ForEach(app.folders.filter { $0 != entry.path && !$0.hasPrefix("\(entry.path)/") }, id: \.self) { folder in
        Button(folder) { window.sidebar("onMove", ["path": entry.path, "folder": entry.isFolder], folder) }
      }
    }
  }
}

/// "Pages", with the Tauri sidebar's buttons: titles or file names, a new page or folder; a drop here goes to the root.
struct PagesHeader: View {
  let window: WindowModel

  var body: some View {
    HStack(spacing: 6) {
      Text("Pages")
      Spacer()
      Button { window.sidebar("onToggleTitles") } label: { Image(systemName: "textformat").foregroundStyle(window.showTitles ? AnyShapeStyle(.tint) : AnyShapeStyle(.secondary)) }
        .buttonStyle(.borderless)
        .help(window.showTitles ? "Afficher les noms de fichier" : "Afficher les titres des pages")
      Menu {
        Button("Nouvelle page") { window.sidebar("onNewPageInFolder", "") }
        Button("Nouveau dossier") { window.sidebar("onNewFolder", "") }
      } label: {
        Image(systemName: "plus")
      }
      .menuStyle(.button)
      .buttonStyle(.borderless)
      .menuIndicator(.hidden)
      .fixedSize()
      .help("Nouvelle page ou nouveau dossier")
    }
    .dropDestination(for: String.self) { paths, _ in
      for path in paths where path.contains("/") {
        window.sidebar("onMove", ["path": path, "folder": AppModel.shared.entry(path)?.isFolder ?? false], "")
      }
      return true
    }
  }
}

/// A row of the sidebar's views: a grey icon, as in the Tauri app.
struct NavLabel: View {
  let title: String
  let icon: String

  var body: some View {
    Label {
      Text(title)
    } icon: {
      // One width for every icon: the labels line up.
      Image(systemName: icon).foregroundStyle(.secondary).frame(width: 18)
    }
  }
}

/// Git, Réglages, Aide: the rows at the bottom of the sidebar.
struct BottomRow: View {
  let title: String
  let icon: String
  var active = false
  var badge: Int?
  let action: () -> Void

  var body: some View {
    Button(action: action) {
      HStack {
        NavLabel(title: title, icon: icon)
        Spacer()
        if let badge, badge > 0 {
          Text("\(badge)").font(.caption2.weight(.semibold)).padding(.horizontal, 6).padding(.vertical, 1).background(.tint, in: Capsule()).foregroundStyle(.white)
        }
      }
      .padding(.horizontal, 8)
      .padding(.vertical, 5)
      .background(active ? AnyShapeStyle(.quaternary) : AnyShapeStyle(.clear), in: RoundedRectangle(cornerRadius: 6))
      .contentShape(Rectangle())
    }
    .buttonStyle(.plain)
  }
}

/// The open vault, like Notion's workspace switcher: the recent vaults, another one.
struct VaultMenu: View {
  @Environment(AppModel.self) private var app
  let window: WindowModel

  var body: some View {
    Menu {
      Section("Vaults récents") {
        ForEach(app.recentVaults, id: \.self) { url in
          Button { app.open(url) } label: {
            Label(url.lastPathComponent, systemImage: url.path.contains("/Mobile Documents/") ? "icloud" : "folder")
          }
          .disabled(url == app.vault?.root)
        }
      }
      Divider()
      Button("Ouvrir un autre vault…") { app.chooseVault() }
      Button("Ouvrir un vault dans iCloud Drive…") { app.chooseVault(inICloud: true) }
      Button("Changer de vault…") { app.close() }
      Button("Réglages") { window.call("settings") }
    } label: {
      HStack(spacing: 8) {
        Image(systemName: app.vault?.inICloud == true ? "icloud" : "books.vertical")
          .foregroundStyle(.tint)
        Text(app.vault?.name ?? "Aucun vault").fontWeight(.semibold).lineLimit(1)
        Image(systemName: "chevron.up.chevron.down").font(.caption2).foregroundStyle(.secondary)
      }
    }
    .menuStyle(.button)
    .buttonStyle(.plain)
    .fixedSize()
    .help("Changer de vault")
  }
}

struct SidebarRow<Menu: View>: View {
  let window: WindowModel
  let entry: VaultEntry
  let title: String
  /// The page's emoji (as typed, for the open page).
  let emoji: String?
  @ViewBuilder let menu: () -> Menu
  @State private var hovered = false

  var body: some View {
    HStack(spacing: 4) {
      Label {
        Text(title).lineLimit(1)
      } icon: {
        if let emoji { Text(emoji) } else { Image(systemName: symbol).foregroundStyle(.secondary) }
      }
      Spacer(minLength: 0)
      // As in the Tauri sidebar, under the pointer: the actions, a sub-page or a page in the folder.
      if hovered {
        SwiftUI.Menu { menu() } label: { Image(systemName: "ellipsis") }
          .menuStyle(.button)
          .buttonStyle(.borderless)
          .menuIndicator(.hidden)
          .fixedSize()
          .help("Plus d'actions")
        Button {
          if entry.isFolder { window.sidebar("onNewPageInFolder", entry.path) } else { window.sidebar("onNewPage", entry.path) }
        } label: { Image(systemName: "plus") }
          .buttonStyle(.borderless)
          .help(entry.isFolder ? "Nouvelle page dans ce dossier" : "Ajouter une sous-page")
      }
    }
    .onHover { hovered = $0 }
    .help(entry.cloud == true ? "En cours de téléchargement depuis iCloud" : entry.path)
  }

  private var symbol: String {
    let path = entry.path.lowercased()
    if entry.isFolder { return "folder" }
    if entry.cloud == true { return "icloud.and.arrow.down" }
    if path.hasSuffix(".base") { return "tablecells" }
    if path.hasSuffix(".excalidraw.md") { return "scribble" }
    if path.hasSuffix(".mindmap.md") { return "point.3.connected.trianglepath.dotted" }
    if entry.ticket == true { return "ticket" }
    if entry.presentation == true { return "play.rectangle" }
    return "doc.text"
  }
}
