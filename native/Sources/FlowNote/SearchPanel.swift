import FlowNoteCore
import SwiftUI

/// ⌘P: go to a page by its title or name, or to a note containing the text.
struct SearchPanel: View {
  @Environment(AppModel.self) private var app
  @Environment(\.dismiss) private var dismiss
  let page: PageModel
  @State private var query = ""
  @State private var found: [SearchFile] = []
  @State private var selection: String?
  @FocusState private var focused: Bool

  /// Pages whose title or name contains the query, shortest names first.
  private var pages: [VaultEntry] {
    let query = query.trimmingCharacters(in: .whitespaces)
    var out: [VaultEntry] = []
    func walk(_ entries: [VaultEntry]) {
      for entry in entries {
        if entry.isFolder { walk(entry.children ?? []) } else if query.isEmpty || app.displayName(entry).localizedStandardContains(query) || entry.path.localizedStandardContains(query) { out.append(entry) }
      }
    }
    walk(app.tree)
    return Array(out.sorted { app.displayName($0).count < app.displayName($1).count }.prefix(query.isEmpty ? 12 : 30))
  }

  var body: some View {
    VStack(spacing: 0) {
      HStack(spacing: 8) {
        Image(systemName: "magnifyingglass").foregroundStyle(.secondary)
        TextField("Aller à une page ou chercher dans les notes", text: $query)
          .textFieldStyle(.plain)
          .font(.title3)
          .focused($focused)
          .onSubmit(openSelection)
      }
      .padding(14)
      Divider()
      List(selection: $selection) {
        Section("Pages") {
          ForEach(pages) { entry in
            Label { Text(app.displayName(entry)) } icon: { Image(systemName: "doc.text") }
              .tag(entry.path)
          }
        }
        if !found.isEmpty {
          Section("Dans les notes") {
            ForEach(found, id: \.path) { file in
              VStack(alignment: .leading, spacing: 2) {
                Text(app.entry(file.path).map(app.displayName) ?? file.path).fontWeight(.medium)
                ForEach(Array(file.lines.prefix(2).enumerated()), id: \.offset) { _, line in
                  if case .text(let text) = line.last { Text(text.trimmingCharacters(in: .whitespaces)).font(.caption).foregroundStyle(.secondary).lineLimit(1) }
                }
              }
              .tag("text:\(file.path)")
            }
          }
        }
      }
      .listStyle(.sidebar)
      .scrollContentBackground(.hidden)
      .onChange(of: selection) { _, _ in if NSApp.currentEvent?.type == .leftMouseUp { openSelection() } }
    }
    .frame(width: 560, height: 420)
    .onAppear { focused = true }
    .onKeyPress(.downArrow) { move(1) }
    .onKeyPress(.upArrow) { move(-1) }
    .task(id: query) {
      // Full-text search once typing pauses (three letters at least).
      let text = query.trimmingCharacters(in: .whitespaces)
      selection = pages.first?.path
      guard text.count >= 3, let vault = app.vault else { found = []; return }
      try? await Task.sleep(for: .milliseconds(200))
      guard !Task.isCancelled else { return }
      found = await Task.detached { vault.search(text, caseSensitive: false, limit: 60) }.value
    }
  }

  private var order: [String] { pages.map(\.path) + found.map { "text:\($0.path)" } }

  private func move(_ step: Int) -> KeyPress.Result {
    let ids = order
    guard !ids.isEmpty else { return .handled }
    let index = selection.flatMap(ids.firstIndex) ?? -step
    selection = ids[max(0, min(ids.count - 1, index + step))]
    return .handled
  }

  private func openSelection() {
    guard let id = selection ?? order.first else { return }
    page.show(id.hasPrefix("text:") ? String(id.dropFirst(5)) : id)
    dismiss()
  }
}
