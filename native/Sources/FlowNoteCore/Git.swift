import Foundation

// Git manager (port of src-tauri/src/git.rs). Runs the system `git` (the
// user's configuration, credentials and hooks apply) with `-C <vault>`. Paths
// exchanged with the page are relative to the vault, which may be a
// sub-folder of the repository. Optional fields are encoded as `null`, as the
// page expects (serde does the same).

public struct GitFile: Codable, Equatable, Sendable {
  public var path: String
  public var origPath: String?
  /// Porcelain status letters (`M`, `A`, `D`, `R`, `C`, `U`, `?`), or a space.
  public var index: String
  public var worktree: String

  /// Unmerged: both modified (UU), added (AA), deleted (DD) or one side deleted (AU, UA, DU, UD).
  public var isConflicted: Bool { index == "U" || worktree == "U" || (index == "A" && worktree == "A") || (index == "D" && worktree == "D") }
}

public struct GitStatus: Codable, Equatable, Sendable {
  public var isRepo = false
  /// A merge is in progress (MERGE_HEAD exists).
  public var merging = false
  public var branch: String?
  public var upstream: String?
  public var ahead = 0
  public var behind = 0
  public var files: [GitFile] = []

  public init() {}

  private enum Keys: String, CodingKey { case isRepo, merging, branch, upstream, ahead, behind, files }
  public func encode(to encoder: Encoder) throws {
    var c = encoder.container(keyedBy: Keys.self)
    try c.encode(isRepo, forKey: .isRepo)
    try c.encode(merging, forKey: .merging)
    try c.encode(branch, forKey: .branch)
    try c.encode(upstream, forKey: .upstream)
    try c.encode(ahead, forKey: .ahead)
    try c.encode(behind, forKey: .behind)
    try c.encode(files, forKey: .files)
  }
}

public struct GitCommit: Codable, Equatable, Sendable {
  public var hash: String
  public var short: String
  public var author: String
  /// ISO 8601 author date.
  public var date: String
  public var subject: String
  /// Path of the file in that commit (it may have been renamed since).
  public var path: String
}

public struct ConflictVersions: Codable, Sendable {
  /// Common ancestor, "mine" and "theirs"; nil when a side deleted the file.
  public var base: String?
  public var ours: String?
  public var theirs: String?
  /// Working file, with conflict markers.
  public var working: String?

  private enum Keys: String, CodingKey { case base, ours, theirs, working }
  public func encode(to encoder: Encoder) throws {
    var c = encoder.container(keyedBy: Keys.self)
    try c.encode(base, forKey: .base)
    try c.encode(ours, forKey: .ours)
    try c.encode(theirs, forKey: .theirs)
    try c.encode(working, forKey: .working)
  }
}

/// Parses `git status --porcelain=v2 --branch -z`. `prefix` is the vault's path
/// inside the repository: files outside the vault are dropped.
public func parseGitStatus(_ raw: String, prefix: String) -> GitStatus {
  var status = GitStatus()
  status.isRepo = true
  let strip = { (p: Substring) -> String? in p.hasPrefix(prefix) ? String(p.dropFirst(prefix.count)) : nil }
  var entries = raw.split(separator: "\0", omittingEmptySubsequences: true).makeIterator()
  while let entry = entries.next() {
    if entry.hasPrefix("# branch.head ") {
      let head = entry.dropFirst("# branch.head ".count)
      status.branch = head == "(detached)" ? nil : String(head)
    } else if entry.hasPrefix("# branch.upstream ") {
      status.upstream = String(entry.dropFirst("# branch.upstream ".count))
    } else if entry.hasPrefix("# branch.ab ") {
      for part in entry.dropFirst("# branch.ab ".count).split(separator: " ") {
        if part.hasPrefix("+") { status.ahead = Int(part.dropFirst()) ?? 0 } else if part.hasPrefix("-") { status.behind = Int(part.dropFirst()) ?? 0 }
      }
    } else if entry.hasPrefix("1 ") || entry.hasPrefix("2 ") || entry.hasPrefix("u ") {
      let fields = entry.hasPrefix("1 ") ? 9 : entry.hasPrefix("2 ") ? 10 : 11
      let parts = entry.split(separator: " ", maxSplits: fields - 1, omittingEmptySubsequences: false)
      guard parts.count >= 2 else { continue }
      let xy = Array(parts[1])
      let letter = { (c: Character) in c == "." ? " " : String(c) }
      let orig = entry.hasPrefix("2 ") ? entries.next().flatMap(strip) : nil
      if let last = parts.last, let path = strip(last), xy.count == 2 {
        status.files.append(GitFile(path: path, origPath: orig, index: letter(xy[0]), worktree: letter(xy[1])))
      }
    } else if entry.hasPrefix("? "), let path = strip(entry.dropFirst(2)) {
      status.files.append(GitFile(path: path, origPath: nil, index: "?", worktree: "?"))
    }
  }
  return status
}

private let FIELD: Character = "\u{1f}"
private let RECORD: Character = "\u{1e}"

/// Parses `git log --name-status --format=<RS>%H<US>%h<US>%an<US>%aI<US>%s`.
public func parseGitLog(_ raw: String, prefix: String) -> [GitCommit] {
  raw.split(separator: RECORD).compactMap { record in
    var lines = record.split(separator: "\n", omittingEmptySubsequences: false).map { $0.hasSuffix("\r") ? $0.dropLast() : $0 }
    guard !lines.isEmpty else { return nil }
    let fields = lines.removeFirst().split(separator: FIELD, omittingEmptySubsequences: false)
    // The last name-status line names the file in this commit ("R100\told\tnew" -> new).
    guard fields.count >= 5, let last = lines.last(where: { !$0.trimmingCharacters(in: .whitespaces).isEmpty }), let path = last.split(separator: "\t").last else { return nil }
    return GitCommit(hash: String(fields[0]), short: String(fields[1]), author: String(fields[2]), date: String(fields[3]), subject: String(fields[4]),
                     path: path.hasPrefix(prefix) ? String(path.dropFirst(prefix.count)) : String(path))
  }
}

public struct Git: Sendable {
  public let root: URL

  public init(root: URL) { self.root = root }

  /// GUI apps on macOS get a minimal PATH: the usual install locations first.
  static let binary = ["/opt/homebrew/bin/git", "/usr/local/bin/git", "/usr/bin/git"].first { FileManager.default.isExecutableFile(atPath: $0) } ?? "/usr/bin/git"

  struct Output {
    let out: Data
    let err: Data
    var text: String { String(decoding: out, as: UTF8.self) }
    /// stdout and stderr together (pull and push report on stderr).
    var combined: String { "\(text)\n\(String(decoding: err, as: UTF8.self))".trimmingCharacters(in: .whitespacesAndNewlines) }
  }

  @discardableResult
  func run(_ args: [String], input: Data? = nil, accept: [Int32] = []) throws -> Output {
    let process = Process()
    process.executableURL = URL(fileURLWithPath: Self.binary)
    // A vault received with its .git folder could name a program to run on every
    // `git status` (core.fsmonitor): never run it.
    process.arguments = ["-C", root.path, "-c", "core.fsmonitor=false"] + args
    var environment = ProcessInfo.processInfo.environment
    environment["GIT_TERMINAL_PROMPT"] = "0" // never wait for a prompt nobody sees
    environment["GIT_OPTIONAL_LOCKS"] = "0" // read-only commands leave the index lock to others (Obsidian Git)
    process.environment = environment
    let out = Pipe(), err = Pipe(), stdin = Pipe()
    process.standardOutput = out
    process.standardError = err
    process.standardInput = input == nil ? FileHandle.nullDevice : stdin
    do { try process.run() } catch { throw VaultError("git introuvable : \(error.localizedDescription)") }
    if let input {
      stdin.fileHandleForWriting.write(input)
      try? stdin.fileHandleForWriting.close()
    }
    // stderr is read on the side, so that neither pipe can fill up and block git.
    var errData = Data()
    let errDone = DispatchSemaphore(value: 0)
    DispatchQueue.global().async {
      errData = err.fileHandleForReading.readDataToEndOfFile()
      errDone.signal()
    }
    let outData = out.fileHandleForReading.readDataToEndOfFile()
    errDone.wait()
    process.waitUntilExit()
    let output = Output(out: outData, err: errData)
    if process.terminationStatus == 0 || accept.contains(process.terminationStatus) { return output }
    let stderr = String(decoding: errData, as: UTF8.self).trimmingCharacters(in: .whitespacesAndNewlines)
    throw VaultError(stderr.isEmpty ? output.text.trimmingCharacters(in: .whitespacesAndNewlines) : stderr)
  }

  static func checkPath(_ path: String) throws {
    let parts = path.split(separator: "/", omittingEmptySubsequences: false)
    guard !path.isEmpty, !path.hasPrefix("/"), parts.allSatisfy({ !$0.isEmpty && $0 != "." && $0 != ".." }) else { throw VaultError("Chemin refusé : \(path)") }
  }

  private func prefix() throws -> String { try run(["rev-parse", "--show-prefix"]).text.trimmingCharacters(in: .whitespacesAndNewlines) }

  private var hasHead: Bool { (try? run(["rev-parse", "--verify", "-q", "HEAD"])) != nil }

  public func status() throws -> GitStatus {
    guard let prefix = try? prefix() else { return GitStatus() }
    var status = parseGitStatus(try run(["status", "--porcelain=v2", "--branch", "-z", "--untracked-files=all"]).text, prefix: prefix)
    status.merging = (try? run(["rev-parse", "-q", "--verify", "MERGE_HEAD"])) != nil
    return status
  }

  /// Unified diff of one file: staged changes, working tree changes, or the whole content of an untracked file.
  public func diff(_ path: String, staged: Bool, untracked: Bool) throws -> String {
    try Self.checkPath(path)
    // Exit code 1 only means "files differ".
    if untracked { return try run(["diff", "--no-color", "--no-ext-diff", "--no-index", "--", "/dev/null", path], accept: [1]).text }
    return try run(["diff", "--no-color", "--no-ext-diff", "-M"] + (staged ? ["--cached"] : []) + ["--", path]).text
  }

  public func stage(_ paths: [String]) throws {
    try paths.forEach(Self.checkPath)
    try run(["add", "-A", "--"] + paths)
  }

  public func unstage(_ paths: [String]) throws {
    try paths.forEach(Self.checkPath)
    // No commit yet: nothing to restore from.
    try run((hasHead ? ["restore", "--staged", "--"] : ["rm", "--cached", "-r", "-q", "--"]) + paths)
  }

  /// Tracked files go back to their indexed version; new untracked files go to the trash.
  public func discard(_ paths: [String]) throws {
    try paths.forEach(Self.checkPath)
    // .obsidian and other hidden folders are never touched.
    if let hidden = paths.first(where: { $0.split(separator: "/").contains { $0.hasPrefix(".") } }) { throw VaultError("Chemin refusé : \(hidden)") }
    let untrackedPaths = Set(try status().files.filter { $0.index == "?" }.map(\.path))
    let tracked = paths.filter { !untrackedPaths.contains($0) }
    if !tracked.isEmpty { try run(["restore", "--worktree", "--"] + tracked) }
    for path in paths where untrackedPaths.contains(path) {
      let url = root.appendingPathComponent(path)
      if FileManager.default.fileExists(atPath: url.path) { try FileManager.default.trashItem(at: url, resultingItemURL: nil) }
    }
  }

  /// Commits the staged changes; the message is passed on stdin, untouched.
  public func commit(_ message: String) throws -> String {
    guard !message.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { throw VaultError("Le message de commit est vide.") }
    return firstLine(try run(["commit", "-F", "-"], input: Data(message.utf8)).text)
  }

  /// History of one note, following renames.
  public func log(_ path: String, limit: Int = 200) throws -> [GitCommit] {
    try Self.checkPath(path)
    let prefix = try prefix()
    let output = try run(["-c", "core.quotePath=false", "log", "--follow", "--name-status", "--no-color", "-n\(limit)",
                          "--format=\(RECORD)%H\(FIELD)%h\(FIELD)%an\(FIELD)%aI\(FIELD)%s", "--", path])
    return parseGitLog(output.text, prefix: prefix)
  }

  /// Commits per day over the last `days` days, for the dashboard: [[date, count]].
  public func activity(days: Int) throws -> [[SearchLine]] {
    let output = try run(["log", "--no-color", "--date=short", "--format=%ad", "--since=\(days) days ago"], accept: [128])
    var counts: [String: Int] = [:]
    for line in output.text.split(separator: "\n") where !line.trimmingCharacters(in: .whitespaces).isEmpty { counts[line.trimmingCharacters(in: .whitespaces), default: 0] += 1 }
    return counts.keys.sorted().map { [.text($0), .number(counts[$0]!)] }
  }

  public func lastCommit() throws -> GitCommit? {
    guard hasHead else { return nil }
    let fields = try run(["log", "-1", "--no-color", "--format=%H\(FIELD)%h\(FIELD)%an\(FIELD)%aI\(FIELD)%s"]).text
      .trimmingCharacters(in: .newlines).split(separator: FIELD, omittingEmptySubsequences: false)
    guard fields.count >= 5 else { return nil }
    return GitCommit(hash: String(fields[0]), short: String(fields[1]), author: String(fields[2]), date: String(fields[3]), subject: String(fields[4]), path: "")
  }

  /// Content of a file at a given commit.
  public func show(_ hash: String, _ path: String) throws -> String {
    try Self.checkPath(path)
    guard !hash.isEmpty, hash.allSatisfy(\.isHexDigit) else { throw VaultError("Identifiant de commit invalide.") }
    return try run(["show", "\(hash):./\(path)"]).text
  }

  public func fetch() throws { try run(["fetch", "--quiet"]) }

  /// Pulls with a merge (never a rebase). A conflict is an error starting with "CONFLICT:".
  public func pull() throws -> String {
    do {
      return try run(["pull", "--no-rebase", "--no-edit"]).combined
    } catch let error as VaultError {
      if try status().files.contains(where: \.isConflicted) { throw VaultError("CONFLICT:\(error.message)") }
      throw error
    }
  }

  /// Pushes the current branch; sets the upstream on "origin" the first time.
  public func push() throws -> String {
    let status = try status()
    if status.upstream != nil { return try run(["push"]).combined }
    guard let branch = status.branch else { throw VaultError("Aucune branche à envoyer (HEAD détachée).") }
    return try run(["push", "--set-upstream", "origin", branch]).combined
  }

  private func ensureConflicted(_ path: String) throws {
    try Self.checkPath(path)
    guard try status().files.contains(where: { $0.path == path && $0.isConflicted }) else { throw VaultError("\(path) n'est pas en conflit.") }
  }

  public func conflict(_ path: String) throws -> ConflictVersions {
    try ensureConflicted(path)
    let stage = { (n: Int) in (try? self.run(["show", ":\(n):./\(path)"]))?.text }
    let working = (try? Data(contentsOf: root.appendingPathComponent(path))).map { String(decoding: $0, as: UTF8.self) }
    return ConflictVersions(base: stage(1), ours: stage(2), theirs: stage(3), working: working)
  }

  /// Writes the resolved content of a conflicted file (nil deletes it) and marks it resolved.
  public func resolve(_ path: String, _ content: String?) throws {
    try ensureConflicted(path)
    if let content {
      let url = root.appendingPathComponent(path)
      try FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
      try Data(content.utf8).write(to: url)
      try run(["add", "--", path])
    } else {
      try run(["rm", "-q", "--ignore-unmatch", "--", path])
    }
  }

  /// Concludes the merge with git's prepared message, once no conflict remains.
  public func continueMerge() throws -> String {
    let status = try status()
    guard status.merging else { throw VaultError("Aucune fusion en cours.") }
    let remaining = status.files.filter(\.isConflicted).count
    if remaining > 0 { throw VaultError("Il reste \(remaining) fichier(s) en conflit.") }
    return firstLine(try run(["commit", "--no-edit"]).text)
  }

  public func abortMerge() throws { try run(["merge", "--abort"]) }

  private func firstLine(_ text: String) -> String { text.split(separator: "\n", omittingEmptySubsequences: false).first.map(String.init) ?? "" }
}
