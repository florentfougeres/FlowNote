import AppKit
import Observation

/// The tabs of a window, drawn in its toolbar (TabStrip): each one a page with its web view.
@MainActor @Observable
final class TabsModel {
  private(set) var pages: [PageModel] = []
  private(set) var active: PageModel

  init(paths: [String]) {
    let first = PageModel(path: paths.first ?? Self.home)
    active = first
    pages = [first]
    for path in paths.dropFirst() { pages.append(PageModel(path: path)) }
    for page in pages { wire(page) }
  }

  static let home = "flownote:home"

  /// The pages of the tabs, remembered with the window.
  var paths: [String] { pages.map { $0.path ?? Self.home } }

  /// A new tab after the active one, shown at once (or behind it with `select: false`).
  func open(_ path: String?, select: Bool = true) {
    let page = PageModel(path: path ?? Self.home)
    wire(page)
    let index = pages.firstIndex { $0 === active }.map { $0 + 1 } ?? pages.count
    pages.insert(page, at: index)
    if select { active = page }
  }

  func select(_ page: PageModel) { active = page }

  /// The next (1) or previous (-1) tab, around.
  func cycle(_ step: Int) {
    guard let index = pages.firstIndex(where: { $0 === active }) else { return }
    active = pages[(index + step + pages.count) % pages.count]
  }

  func select(at index: Int) {
    if pages.indices.contains(index) { active = pages[index] }
  }

  /// Closes a tab once its page is written; the last one closes the window.
  func close(_ page: PageModel) async {
    await page.saveNow()
    guard pages.count > 1 else {
      page.webView.window?.performClose(nil)
      return
    }
    guard let index = pages.firstIndex(where: { $0 === page }) else { return }
    pages.remove(at: index)
    if active === page { active = pages[min(index, pages.count - 1)] }
  }

  func restore(_ paths: [String]) {
    guard !paths.isEmpty, paths != self.paths else { return }
    pages = paths.map { PageModel(path: $0) }
    for page in pages { wire(page) }
    active = pages[0]
  }

  private func wire(_ page: PageModel) {
    page.openTab = { [weak self] path in self?.open(path) }
  }
}
