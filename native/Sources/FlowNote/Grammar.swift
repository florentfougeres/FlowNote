import FlowNoteCore
import Foundation

/// French grammar and spelling through the Grammalecte companion (port of
/// src-tauri/src/grammar.rs): a separate GPL program bundled next to the app,
/// started on the first check and kept running; one JSON line per request.
final class Grammar: @unchecked Sendable {
  static let shared = Grammar()

  private let queue = DispatchQueue(label: "flownote.grammar")
  private var process: Process?
  private var input: FileHandle?
  private var output: FileHandle?
  private var buffer = Data()
  private var nextId = 1

  /// Bundled app: next to the main executable. Development: the build in src-tauri/binaries.
  private var companion: URL? {
    let beside = Bundle.main.executableURL!.deletingLastPathComponent().appendingPathComponent("flownote-grammar")
    if FileManager.default.isExecutableFile(atPath: beside.path) { return beside }
    if let dir = ProcessInfo.processInfo.environment["FLOWNOTE_GRAMMAR"] { return URL(fileURLWithPath: dir) }
    return nil
  }

  /// Errors of each paragraph: `[{ grammar: [...], spelling: [...] }, ...]`.
  func check(_ paragraphs: [String]) async throws -> Any {
    try await withCheckedThrowingContinuation { continuation in
      queue.async {
        do {
          if self.process == nil { try self.start() }
          continuation.resume(returning: try self.exchange(paragraphs))
        } catch {
          // Restarted on the next request.
          self.stop()
          continuation.resume(throwing: error)
        }
      }
    }
  }

  private func start() throws {
    guard let path = companion else { throw VaultError("Correcteur Grammalecte introuvable (lancez scripts/build-grammar.sh).") }
    let process = Process()
    process.executableURL = path
    let stdin = Pipe(), stdout = Pipe()
    process.standardInput = stdin
    process.standardOutput = stdout
    process.standardError = FileHandle.nullDevice
    try process.run()
    self.process = process
    input = stdin.fileHandleForWriting
    output = stdout.fileHandleForReading
    buffer = Data()
    guard let ready = readLine(), ready.contains("ready") else { throw VaultError("Le correcteur n'a pas démarré.") }
  }

  private func exchange(_ paragraphs: [String]) throws -> Any {
    let id = nextId
    nextId += 1
    var request = try JSONSerialization.data(withJSONObject: ["id": id, "paragraphs": paragraphs])
    request.append(0x0A)
    try input?.write(contentsOf: request)
    guard let line = readLine() else { throw VaultError("Le correcteur s'est arrêté.") }
    let answer = try JSONSerialization.jsonObject(with: Data(line.utf8)) as? [String: Any] ?? [:]
    if let error = answer["error"] { throw VaultError("\(error)") }
    return answer["results"] ?? []
  }

  /// The next line of the companion's output, nil when it stopped.
  private func readLine() -> String? {
    while true {
      if let end = buffer.firstIndex(of: 0x0A) {
        let line = buffer[buffer.startIndex..<end]
        buffer.removeSubrange(buffer.startIndex...end)
        return String(decoding: line, as: UTF8.self)
      }
      guard let chunk = output?.availableData, !chunk.isEmpty else { return nil }
      buffer.append(chunk)
    }
  }

  /// Stops the companion (on error, and when the app quits).
  func stop() {
    process?.terminate()
    process = nil
    input = nil
    output = nil
  }
}
