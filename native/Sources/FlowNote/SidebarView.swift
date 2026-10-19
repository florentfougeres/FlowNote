import AppKit
import FlowNoteCore
import SwiftUI

/// The vault's pages and folders, with Notion's actions in native menus.
struct SidebarView: View {
  @Environment(AppModel.self) private var app
  let page: PageModel
  @State private var filter = ""

  private var actions: SidebarActions { SidebarActions(page: page) }

  private var selection: Binding<String?> {
    Binding(
      get: { page.path },
      set: { path in
        // A folder only opens and closes.
        if let path, app.entry(path)?.isFolder == false { page.show(path) }
      })
  }

  var body: some View {
    List(selection: selection) {
      Section(app.vault?.name ?? "Vault") {
        OutlineGroup(filtered(app.tree), children: \.folderChildren) { entry in
          SidebarRow(entry: entry)
            .draggable(entry.path)
            .dropDestination(for: String.self) { paths, _ in
              guard entry.isFolder else { return false }
              Task { for path in paths where path != entry.path { await actions.move(path, to: entry.path) } }
              return true
            }
        }
      }
    }
    .listStyle(.sidebar)
    .searchable(text: $filter, placement: .sidebar, prompt: "Rechercher une page")
    .contextMenu(forSelectionType: String.self) { paths in
      if let path = paths.first, let entry = app.entry(path) { menu(for: entry) } else { rootMenu }
    } primaryAction: { paths in
      if let path = paths.first, app.entry(path)?.isFolder == false { page.openTab(path) }
    }
    .toolbar {
      ToolbarItem {
        Button { Task { await actions.newPage(in: nil) } } label: { Label("Nouvelle page", systemImage: "square.and.pencil") }
          .help("Nouvelle page (⌘N)")
      }
    }
    .overlay {
      if let error = app.error { ContentUnavailableView("Vault illisible", systemImage: "exclamationmark.triangle", description: Text(error)) }
    }
  }

  @ViewBuilder private var rootMenu: some View {
    Button("Nouvelle page…") { Task { await actions.newPage(in: nil) } }
    Button("Nouveau dossier…") { Task { await actions.newFolder(in: "") } }
  }

  @ViewBuilder private func menu(for entry: VaultEntry) -> some View {
    if entry.isFolder {
      Button("Nouvelle page dans ce dossier…") { Task { await actions.newPage(in: entry.path) } }
      Button("Nouveau dossier…") { Task { await actions.newFolder(in: entry.path) } }
    } else {
      Button("Ouvrir dans un nouvel onglet") { page.openTab(entry.path) }
      Button("Nouvelle sous-page…") { Task { await actions.newSubpage(of: entry.path) } }
    }
    Divider()
    Button("Renommer…") { Task { await actions.rename(entry) } }
    Menu("Déplacer vers") {
      Button("Racine du vault") { Task { await actions.move(entry.path, to: "") } }
      ForEach(app.folders.filter { $0 != entry.path && !$0.hasPrefix("\(entry.path)/") }, id: \.self) { folder in
        Button(folder) { Task { await actions.move(entry.path, to: folder) } }
      }
    }
    Button("Afficher dans le Finder") { actions.reveal(entry.path) }
    Divider()
    Button("Supprimer…", role: .destructive) { Task { await actions.delete(entry) } }
  }

  /// The tree limited to the pages matching the search (and the folders holding them).
  private func filtered(_ entries: [VaultEntry]) -> [VaultEntry] {
    let query = filter.trimmingCharacters(in: .whitespaces)
    guard !query.isEmpty else { return entries }
    return entries.compactMap { entry in
      if entry.isFolder {
        let children = filtered(entry.children ?? [])
        return children.isEmpty ? nil : VaultEntry(path: entry.path, name: entry.name, kind: entry.kind, children: children)
      }
      return app.displayName(entry).localizedStandardContains(query) || entry.name.localizedStandardContains(query) ? entry : nil
    }
  }
}

struct SidebarRow: View {
  @Environment(AppModel.self) private var app
  let entry: VaultEntry

  var body: some View {
    Label {
      Text(app.displayName(entry)).lineLimit(1)
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

/// The sidebar's actions: names asked natively, the work done by the page
/// (pageOps.ts) so that links, bases and sub-pages follow.
@MainActor
struct SidebarActions {
  let page: PageModel
  private var app: AppModel { AppModel.shared }

  func newPage(in folder: String?) async {
    guard let answer = await page.askName(folder.map { "Nouvelle page dans « \(($0 as NSString).lastPathComponent) »" } ?? "Nouvelle page", initial: "Sans titre", kinds: true) else { return }
    await create(answer, folder: folder ?? "", parent: nil)
  }

  func newSubpage(of parent: String) async {
    guard let answer = await page.askName("Nouvelle sous-page", initial: "Sans titre", kinds: true) else { return }
    await create(answer, folder: AppModel.subpageFolder(parent), parent: parent)
  }

  private func create(_ answer: (name: String, kind: String), folder: String, parent: String?) async {
    let result = await page.run(["op": "newPage", "kind": answer.kind, "name": answer.name, "folder": folder, "parent": parent ?? NSNull()])
    app.reload()
    if let path = result.path { page.show(path) }
  }

  func newFolder(in parent: String) async {
    guard let answer = await page.askName("Nouveau dossier", initial: "Sans titre"), let vault = app.vault else { return }
    do {
      try vault.createFolder(parent.isEmpty ? answer.name : "\(parent)/\(answer.name)")
      app.reload()
    } catch {
      page.notify(error.localizedDescription)
    }
  }

  func rename(_ entry: VaultEntry) async {
    guard let answer = await page.askName(entry.isFolder ? "Renommer le dossier" : "Renommer la page", initial: entry.name), answer.name != entry.name else { return }
    let result = await page.run(entry.isFolder ? ["op": "renameFolder", "folder": entry.path, "title": answer.name] : ["op": "rename", "path": entry.path, "title": answer.name])
    app.follow(result.renamed)
  }

  func move(_ path: String, to folder: String) async {
    guard let entry = app.entry(path), (path as NSString).deletingLastPathComponent != folder else { return }
    let result = await page.run(["op": "move", "path": path, "folder": folder, "isFolder": entry.isFolder])
    app.follow(result.renamed)
  }

  func reveal(_ path: String) {
    if let url = try? app.vault?.resolve(path) { NSWorkspace.shared.activateFileViewerSelecting([url]) }
  }

  func delete(_ entry: VaultEntry) async {
    let alert = NSAlert()
    alert.messageText = entry.isFolder ? "Supprimer le dossier « \(entry.name) » et son contenu ?" : "Supprimer « \(app.displayName(entry)) » ?"
    alert.informativeText = entry.isFolder ? "Il ira dans la corbeille." : "Elle ira dans la corbeille, avec ses sous-pages."
    alert.addButton(withTitle: "Supprimer").hasDestructiveAction = true
    alert.addButton(withTitle: "Annuler")
    let answer = if let window = page.webView.window { await alert.beginSheetModal(for: window) } else { alert.runModal() }
    guard answer == .alertFirstButtonReturn else { return }
    _ = await page.run(entry.isFolder ? ["op": "deleteFolder", "folder": entry.path] : ["op": "delete", "path": entry.path])
    app.closePages(under: entry.path)
  }
}
