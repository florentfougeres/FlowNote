import { Plugin } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";
import { isImage, type BridgeRef } from "./bridge";
import { element } from "./views/dom";
import { noteTitle, resolveLink } from "../vault/links";

/**
 * Hovering a link to a note (`[[Note]]`, `[[Note#Titre]]`, `[texte](Note.md)`)
 * shows the note in a small window after a moment, as Obsidian's page preview
 * does: its text (or the section or block aimed at), a drawing, a mind map or
 * an image, read only. The window stays while the mouse is over it, so it
 * scrolls and its title opens the note. A click, a key or a scroll closes it.
 */

const OPEN_DELAY = 500;
const CLOSE_DELAY = 250;
const WIDTH = 440;
const HEIGHT = 340;

/** The vault path and the part (`Titre`, `^id`) a link in the editor aims at, or null. */
function linkedPath(link: Element, bridge: BridgeRef): { path: string; subpath: string } | null {
  let target: string;
  if (link.classList.contains("wikilink")) {
    if (link.classList.contains("unresolved")) return null;
    target = (link as HTMLElement).dataset.target ?? "";
  } else {
    const href = link.getAttribute("href") ?? "";
    if (/^[a-z][\w+.-]*:/i.test(href)) return null;
    try {
      target = decodeURI(href);
    } catch {
      return null;
    }
  }
  const { files, notePath } = bridge.current;
  const path = resolveLink(target, files, notePath);
  if (!path || !(path.endsWith(".md") || isImage(path))) return null;
  const hash = target.indexOf("#");
  return { path, subpath: hash === -1 ? "" : target.slice(hash + 1) };
}

/** Places the window under the link, or above when there is more room there, inside the window. */
function place(box: HTMLElement, link: Element) {
  const rect = link.getBoundingClientRect();
  const left = Math.max(8, Math.min(rect.left, window.innerWidth - WIDTH - 8));
  const below = window.innerHeight - rect.bottom - 14;
  const above = rect.top - 14;
  box.style.left = `${left}px`;
  if (below >= HEIGHT || below >= above) {
    box.style.top = `${rect.bottom + 6}px`;
    box.style.maxHeight = `${Math.min(HEIGHT, below)}px`;
  } else {
    box.style.bottom = `${window.innerHeight - rect.top + 6}px`;
    box.style.maxHeight = `${Math.min(HEIGHT, above)}px`;
  }
}

class LinkPreview {
  private box: HTMLElement | null = null;
  private link: Element | null = null;
  private unmount: (() => void) | null = null;
  private openTimer = 0;
  private closeTimer = 0;

  constructor(
    private view: EditorView,
    private bridge: BridgeRef,
  ) {
    view.dom.addEventListener("mouseover", this.over);
    view.dom.addEventListener("mouseout", this.out);
    view.dom.addEventListener("mousedown", this.close);
    view.dom.addEventListener("keydown", this.close);
    window.addEventListener("scroll", this.scrolled, true);
  }

  /** The page scrolls: the window would float away from its link. Scrolling inside it keeps it. */
  private scrolled = (event: Event) => {
    if (this.box && !this.box.contains(event.target as Node)) this.close();
  };

  private over = (event: MouseEvent) => {
    const link = (event.target as Element).closest?.(".wikilink, a[href]");
    // A link of a note embedded in this one belongs to that note's editor.
    if (!link || link.closest(".ProseMirror") !== this.view.dom || !this.bridge.current.readNote) return;
    // No preview inside a preview.
    if (this.view.dom.closest(".link-preview")) return;
    if (link === this.link) {
      window.clearTimeout(this.closeTimer);
      return;
    }
    window.clearTimeout(this.openTimer);
    this.openTimer = window.setTimeout(() => this.open(link), OPEN_DELAY);
  };

  private out = (event: MouseEvent) => {
    const link = (event.target as Element).closest?.(".wikilink, a[href]");
    if (!link || link.contains(event.relatedTarget as Node)) return;
    window.clearTimeout(this.openTimer);
    if (link === this.link) this.closeSoon();
  };

  private closeSoon = () => {
    window.clearTimeout(this.closeTimer);
    this.closeTimer = window.setTimeout(this.close, CLOSE_DELAY);
  };

  private keep = () => window.clearTimeout(this.closeTimer);

  private open(link: Element) {
    const target = linkedPath(link, this.bridge);
    if (!target || !link.isConnected) return;
    this.close();
    const { path, subpath } = target;
    const bridge = this.bridge.current;
    const box = element("div", "link-preview");
    const title = element("button", "embed-note-title");
    title.type = "button";
    title.textContent = `${noteTitle(path)}${subpath ? ` › ${subpath.replace(/^\^/, "")}` : ""}`;
    title.title = "Ouvrir (⌘-clic : dans un nouvel onglet)";
    title.addEventListener("click", (event) => {
      this.close();
      bridge.openPath(path, event.metaKey || event.ctrlKey);
    });
    const body = element("div", "link-preview-body");
    box.append(title, body);
    box.addEventListener("mouseenter", this.keep);
    box.addEventListener("mouseleave", this.closeSoon);
    place(box, link);
    document.body.append(box);
    this.box = box;
    this.link = link;
    if (isImage(path)) {
      const img = element("img");
      img.alt = noteTitle(path);
      void bridge.loadImage(path).then((url) => (img.src = url));
      body.append(img);
      return;
    }
    let gone = false;
    this.unmount = () => {
      gone = true;
    };
    void import("./views/noteEmbed").then(({ mountNoteEmbed, mountPageEmbed }) => {
      if (gone) return;
      this.unmount = /\.(excalidraw|mindmap)\.md$/i.test(path) ? mountPageEmbed(body, path, bridge) : mountNoteEmbed(body, path, subpath, bridge);
    });
  }

  close = () => {
    window.clearTimeout(this.openTimer);
    window.clearTimeout(this.closeTimer);
    this.unmount?.();
    this.unmount = null;
    this.box?.remove();
    this.box = null;
    this.link = null;
  };

  destroy() {
    this.close();
    this.view.dom.removeEventListener("mouseover", this.over);
    this.view.dom.removeEventListener("mouseout", this.out);
    this.view.dom.removeEventListener("mousedown", this.close);
    this.view.dom.removeEventListener("keydown", this.close);
    window.removeEventListener("scroll", this.scrolled, true);
  }
}

export function linkPreviewPlugin(bridge: BridgeRef) {
  return new Plugin({
    view: (view) => {
      const preview = new LinkPreview(view, bridge);
      return { destroy: () => preview.destroy() };
    },
  });
}
