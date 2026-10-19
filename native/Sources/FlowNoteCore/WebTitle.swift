import Foundation

/// Title of a web page (port of `fetch_page_title` in src-tauri/src/web.rs):
/// `og:title`, else `<title>`. Reads at most 512 KB, gives up after 6 seconds.
public enum WebTitle {
  public static func isWebURL(_ text: String) -> Bool {
    let lower = text.trimmingCharacters(in: .whitespaces).lowercased()
    return lower.hasPrefix("http://") || lower.hasPrefix("https://")
  }

  public static func fetch(_ address: String) async -> String? {
    guard isWebURL(address), let url = URL(string: address.trimmingCharacters(in: .whitespaces)) else { return nil }
    var request = URLRequest(url: url, timeoutInterval: 6)
    request.setValue("Mozilla/5.0 (Macintosh) FlowNote", forHTTPHeaderField: "User-Agent")
    guard let (bytes, _) = try? await URLSession.shared.bytes(for: request) else { return nil }
    var data = Data()
    do {
      for try await byte in bytes {
        data.append(byte)
        if data.count >= 512 * 1024 { break }
      }
    } catch {}
    return title(in: String(decoding: data, as: UTF8.self))
  }

  public static func title(in html: String) -> String? {
    // <meta property="og:title" content="…">, attributes in either order.
    var rest = html[...]
    while let start = rest.range(of: "<meta", options: .caseInsensitive) {
      let end = rest[start.lowerBound...].firstIndex(of: ">") ?? rest.endIndex
      let tag = rest[start.lowerBound..<end]
      if tag.range(of: "og:title", options: .caseInsensitive) != nil, let value = attribute(tag, "content") { return clean(value) }
      rest = rest[end...]
    }
    guard let open = html.range(of: "<title", options: .caseInsensitive),
          let close = html[open.upperBound...].firstIndex(of: ">"),
          let end = html[close...].range(of: "</title", options: .caseInsensitive) else { return nil }
    return clean(html[html.index(after: close)..<end.lowerBound])
  }

  private static func attribute(_ tag: Substring, _ name: String) -> String? {
    guard let at = tag.range(of: "\(name)=", options: .caseInsensitive) else { return nil }
    let rest = tag[at.upperBound...]
    guard let quote = rest.first else { return nil }
    if quote == "\"" || quote == "'" { return String(rest.dropFirst().prefix { $0 != quote }) }
    return String(rest.prefix { !$0.isWhitespace && $0 != ">" })
  }

  /// Collapses whitespace and decodes the usual HTML entities.
  private static func clean<S: StringProtocol>(_ raw: S) -> String? {
    var text = raw.split(whereSeparator: \.isWhitespace).joined(separator: " ")
    for (entity, char) in [("&amp;", "&"), ("&lt;", "<"), ("&gt;", ">"), ("&quot;", "\""), ("&#39;", "'"), ("&#x27;", "'"), ("&apos;", "'"), ("&nbsp;", " "), ("&ndash;", "–"), ("&mdash;", "—"), ("&rsquo;", "’"), ("&laquo;", "«"), ("&raquo;", "»")] {
      text = text.replacingOccurrences(of: entity, with: char)
    }
    text = text.trimmingCharacters(in: .whitespaces)
    return text.isEmpty ? nil : text
  }
}
