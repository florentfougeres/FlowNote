// Checks of the vault (port of src-tauri's tests): `swift run vault-checks`.
// A plain executable, as Swift Testing and XCTest need Xcode.
import Foundation
@testable import FlowNoteCore

/// A vault in a temporary folder, removed after the test.
private func withVault(_ body: (Vault, URL) throws -> Void) throws {
  let root = FileManager.default.temporaryDirectory.appendingPathComponent("flownote-\(UUID().uuidString)")
  try FileManager.default.createDirectory(at: root.appendingPathComponent(".obsidian"), withIntermediateDirectories: true)
  defer { try? FileManager.default.removeItem(at: root) }
  try body(Vault(root: root), root)
}

func hiddenAndEscapingPathsAreRefused() throws {
  try withVault { vault, _ in
    for path in ["../x.md", "/etc/hosts", ".obsidian/app.json", "a/.git/config", "a/../b.md", "./a.md", "", "a//b.md"] {
      expectThrows { _ = try vault.resolve(path) }
    }
    expect(try vault.resolve("Dossier/Note.md").path.hasSuffix("/Dossier/Note.md"))
  }
}

func filesAreReadAndWrittenByteForByte() throws {
  try withVault { vault, root in
    let original = "\u{FEFF}# Titre\r\nCafé\r\n"
    try vault.create("Note.md", Data(original.utf8))
    expect(try vault.read("Note.md") == original)
    try vault.write("Note.md", "\u{FEFF}# Titre\r\nThé\r\n", expected: original)
    expect(try Data(contentsOf: root.appendingPathComponent("Note.md")) == Data("\u{FEFF}# Titre\r\nThé\r\n".utf8))
  }
}

func writeRefusesWhenTheFileChanged() throws {
  try withVault { vault, _ in
    try vault.create("Note.md", Data("un".utf8))
    expectConflict { try vault.write("Note.md", "trois", expected: "deux") }
    // Canonically equivalent text is still a change: the check is on bytes.
    try vault.write("Note.md", "e\u{301}", expected: "un")
    expectConflict { try vault.write("Note.md", "x", expected: "\u{E9}") }
  }
}

func createNeverOverwritesAndFilesSkipHidden() throws {
  try withVault { vault, root in
    try vault.create("a/Note.md", Data("x".utf8))
    expectThrows { try vault.create("a/Note.md", Data("y".utf8)) }
    try Data().write(to: root.appendingPathComponent(".obsidian/workspace.json"))
    try Data().write(to: root.appendingPathComponent("image.png"))
    expect(vault.files() == ["a/Note.md", "image.png"])
  }
}

func renameRefusesToOverwriteButAllowsCaseChanges() throws {
  try withVault { vault, _ in
    try vault.create("a.md", Data("a".utf8))
    try vault.create("b.md", Data("b".utf8))
    expectThrows { try vault.rename("a.md", "b.md") }
    try vault.rename("a.md", "A.md")
    expect(vault.files().contains("A.md"))
    try vault.rename("A.md", "Dossier/C.md")
    expect(try vault.read("Dossier/C.md") == "a")
  }
}

func treeHasTitlesIconsTicketsAndPresentations() throws {
  try withVault { vault, root in
    try vault.create("Note.md", Data("# Mon [[Cible|beau]] **titre** ##\ntexte".utf8))
    try vault.create("Ticket.md", Data("---\ntype: ticket\nicon: 🐞\ntitle: \"Bogue\"\n---\ncorps".utf8))
    try vault.create("Slides.md", Data("---\nmarp: true\n---\n# Pas le titre".utf8))
    try vault.create("Projets.base", Data("views: []".utf8))
    try vault.createFolder("Vide")
    try FileManager.default.createDirectory(at: root.appendingPathComponent("Images"), withIntermediateDirectories: true)
    try Data().write(to: root.appendingPathComponent("Images/a.png"))
    let tree = try vault.tree()
    expect(tree.map(\.path) == ["Vide", "Note.md", "Projets.base", "Slides.md", "Ticket.md"])
    expect(tree[1].title == "Mon beau titre")
    expect(tree[3].presentation == true && tree[3].title == nil)
    expect(tree[4].ticket == true && tree[4].icon == "🐞" && tree[4].title == "Bogue")
  }
}

func searchFindsLinesUpToTheLimit() throws {
  try withVault { vault, _ in
    try vault.create("a.md", Data("Pomme\npoire\nPOMME verte".utf8))
    let found = vault.search("pomme", caseSensitive: false, limit: 1)
    expect(found.count == 1 && found[0].lines.count == 1)
    expect(vault.search("pomme", caseSensitive: true, limit: 10).isEmpty)
  }
}

func trashIgnoresWhatIsAlreadyGone() throws {
  try withVault { vault, _ in
    try vault.trash("absent.md")
  }
}

nonisolated(unsafe) var failures = 0
nonisolated(unsafe) var current = ""

func expect(_ condition: @autoclosure () throws -> Bool, line: Int = #line) {
  if (try? condition()) != true {
    failures += 1
    print("✘ \(current), ligne \(line)")
  }
}

func expectThrows(line: Int = #line, _ body: () throws -> Void) {
  do {
    try body()
    failures += 1
    print("✘ \(current), ligne \(line) : aucune erreur")
  } catch {}
}

func expectConflict(line: Int = #line, _ body: () throws -> Void) {
  do {
    try body()
    failures += 1
    print("✘ \(current), ligne \(line) : aucun conflit")
  } catch {
    if (error as? VaultError)?.message.hasPrefix("CONFLICT:") != true {
      failures += 1
      print("✘ \(current), ligne \(line) : \(error)")
    }
  }
}

let checks: [(String, () throws -> Void)] = [
  ("hiddenAndEscapingPathsAreRefused", hiddenAndEscapingPathsAreRefused),
  ("filesAreReadAndWrittenByteForByte", filesAreReadAndWrittenByteForByte),
  ("writeRefusesWhenTheFileChanged", writeRefusesWhenTheFileChanged),
  ("createNeverOverwritesAndFilesSkipHidden", createNeverOverwritesAndFilesSkipHidden),
  ("renameRefusesToOverwriteButAllowsCaseChanges", renameRefusesToOverwriteButAllowsCaseChanges),
  ("treeHasTitlesIconsTicketsAndPresentations", treeHasTitlesIconsTicketsAndPresentations),
  ("searchFindsLinesUpToTheLimit", searchFindsLinesUpToTheLimit),
  ("trashIgnoresWhatIsAlreadyGone", trashIgnoresWhatIsAlreadyGone),
]

for (name, check) in checks {
  current = name
  let before = failures
  do { try check() } catch {
    failures += 1
    print("✘ \(name) : \(error)")
  }
  if failures == before { print("✔ \(name)") }
}
print(failures == 0 ? "\(checks.count) vérifications passées" : "\(failures) échec(s)")
exit(failures == 0 ? 0 : 1)
