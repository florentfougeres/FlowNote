import CoreServices
import Foundation

/// Calls back when anything changes in the vault folder (FSEvents): this app,
/// Obsidian, git or iCloud. The callback runs on the main queue.
final class VaultWatcher {
  private final class Callback {
    let fire: () -> Void
    init(_ fire: @escaping () -> Void) { self.fire = fire }
  }

  private var stream: FSEventStreamRef?
  private let callback: Unmanaged<Callback>

  init(url: URL, onChange: @escaping () -> Void) {
    callback = Unmanaged.passRetained(Callback(onChange))
    var context = FSEventStreamContext(version: 0, info: callback.toOpaque(), retain: nil, release: nil, copyDescription: nil)
    stream = FSEventStreamCreate(
      nil,
      { _, info, _, _, _, _ in Unmanaged<Callback>.fromOpaque(info!).takeUnretainedValue().fire() },
      &context, [url.path] as CFArray, FSEventStreamEventId(kFSEventStreamEventIdSinceNow), 0.3,
      FSEventStreamCreateFlags(kFSEventStreamCreateFlagNone))
    if let stream {
      FSEventStreamSetDispatchQueue(stream, .main)
      FSEventStreamStart(stream)
    }
  }

  deinit {
    if let stream {
      FSEventStreamStop(stream)
      FSEventStreamInvalidate(stream)
      FSEventStreamRelease(stream)
    }
    callback.release()
  }
}
