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
        if id == "home" { window.call("select", NSNull()) }
        // A folder only opens and closes.
        else if id.hasPrefix("flownote:") || app.entry(id)?.isFolder == false { window.call("select", id) }
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
      VStack(alignment: .leading, spacing: 2) {
        ForEach(AppModel.views, id: \.title) { view in
          BottomRow(title: view.title, icon: view.icon, active: window.activeTab.map { $0.path == view.path } ?? false) { window.call("select", view.path ?? NSNull()) }
            .background(MiddleClick { window.call("select", view.path ?? NSNull(), true) })
        }
        BottomRow(title: "Rechercher", icon: "magnifyingglass") { window.call("search") }
          .help("Rechercher une page (⌘P)")
        BottomRow(title: "Rechercher dans les notes", icon: "text.magnifyingglass") { window.call("vaultSearch") }
          .help("Rechercher dans les notes (⌘⇧F)")
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

  private var list: some View {
    List(selection: selection) {
      if !window.favorites.isEmpty {
        Section("Favoris") {
          ForEach(window.favorites, id: \.self) { path in
            if let entry = app.entry(path) { row(entry) }
          }
        }
      }
      Section("Pages") {
        OutlineGroup(app.tree, children: \.folderChildren) { entry in row(entry) }
      }
    }
    .listStyle(.sidebar)
    .contextMenu(forSelectionType: String.self) { ids in
      if let id = ids.first, let entry = app.entry(id) { menu(for: entry) } else if ids.isEmpty { rootMenu }
    } primaryAction: { ids in
      if let id = ids.first, app.entry(id)?.isFolder == false { window.call("select", id, true) }
    }
  }

  private func row(_ entry: VaultEntry) -> some View {
    SidebarRow(entry: entry, title: window.title(of: entry))
      .tag(entry.path)
      .background(MiddleClick { if !entry.isFolder { window.call("select", entry.path, true) } })
      .draggable(entry.path)
      .dropDestination(for: String.self) { paths, _ in
        guard entry.isFolder else { return false }
        for path in paths where path != entry.path {
          window.sidebar("onMove", ["path": path, "folder": app.entry(path)?.isFolder ?? false], entry.path)
        }
        return true
      }
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

/// A row of the sidebar's views: a grey icon, as in the Tauri app.
struct NavLabel: View {
  let title: String
  let icon: String

  var body: some View {
    Label {
      Text(title)
    } icon: {
      Image(systemName: icon).foregroundStyle(.secondary)
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

struct SidebarRow: View {
  let entry: VaultEntry
  let title: String

  var body: some View {
    Label {
      Text(title).lineLimit(1)
    } icon: {
      if let icon = entry.icon { Text(icon) } else { Image(systemName: symbol).foregroundStyle(.secondary) }
    }
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
