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


/// A git repository with the vault in a sub-folder, removed after the check.
private func withRepo(_ body: (Git, URL) throws -> Void) throws {
  let repo = FileManager.default.temporaryDirectory.appendingPathComponent("flownote-git-\(UUID().uuidString)")
  let vault = repo.appendingPathComponent("Notes")
  try FileManager.default.createDirectory(at: vault.appendingPathComponent(".obsidian"), withIntermediateDirectories: true)
  defer { try? FileManager.default.removeItem(at: repo) }
  let git = Git(root: vault)
  try git.run(["init", "-q", "-b", "main"])
  try git.run(["config", "user.email", "test@example.com"])
  try git.run(["config", "user.name", "Test"])
  try body(git, vault)
}

func gitStatusParsing() throws {
  let raw = "# branch.oid abc\0# branch.head main\0# branch.upstream origin/main\0# branch.ab +2 -1\0" +
    "1 .M N... 100644 100644 100644 a b Notes/Une note.md\0" + "2 R. N... 100644 100644 100644 a b R100 Notes/Nouveau.md\0Notes/Ancien.md\0" +
    "? Notes/Neuf.md\0? Ailleurs.md\0"
  let status = parseGitStatus(raw, prefix: "Notes/")
  expect(status.branch == "main" && status.upstream == "origin/main" && status.ahead == 2 && status.behind == 1)
  expect(status.files == [
    GitFile(path: "Une note.md", origPath: nil, index: " ", worktree: "M"),
    GitFile(path: "Nouveau.md", origPath: "Ancien.md", index: "R", worktree: " "),
    GitFile(path: "Neuf.md", origPath: nil, index: "?", worktree: "?"),
  ])
  let json = String(decoding: try JSONEncoder().encode(GitStatus()), as: UTF8.self)
  expect(json.contains("\"branch\":null"))
}

func gitStageCommitLogAndDiscard() throws {
  try withRepo { git, vault in
    try Data("un\n".utf8).write(to: vault.appendingPathComponent("Note.md"))
    expect(try git.status().files.map(\.path) == ["Note.md"])
    try git.stage(["Note.md"])
    let summary = try git.commit("Premier commit\n\nCorps")
    let short = try git.lastCommit()!.short
    expect(summary.hasSuffix("] Premier commit") && summary.contains(short))
    try Data("deux\n".utf8).write(to: vault.appendingPathComponent("Note.md"))
    expect(try git.diff("Note.md", staged: false, untracked: false).contains("+deux"))
    try git.discard(["Note.md"])
    expect(try String(contentsOf: vault.appendingPathComponent("Note.md"), encoding: .utf8) == "un\n")
    expect(try git.log("Note.md").map(\.subject) == ["Premier commit"])
    expect(try git.show(git.lastCommit()!.hash, "Note.md") == "un\n")
    expectThrows { _ = try git.show("HEAD;rm", "Note.md") }
    expectThrows { try git.stage(["../x"]) }
    expectThrows { try git.discard([".obsidian/app.json"]) }
  }
}

func webTitles() throws {
  expect(WebTitle.title(in: "<html><head><TITLE>\n  Bonjour &amp; bienvenue </title></head>") == "Bonjour & bienvenue")
  expect(WebTitle.title(in: "<meta content='Titre OG' property=\"og:title\"><title>Autre</title>") == "Titre OG")
  expect(WebTitle.title(in: "<p>rien</p>") == nil)
  expect(!WebTitle.isWebURL("file:///etc/hosts"))
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
  ("gitStatusParsing", gitStatusParsing),
  ("gitStageCommitLogAndDiscard", gitStageCommitLogAndDiscard),
  ("webTitles", webTitles),
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
