import type { NodeViewRenderer } from "@tiptap/core";
import type { Node as PMNode } from "@tiptap/pm/model";
import { type BridgeRef, isImage } from "../bridge";
import { basename, noteTitle, resolveLink } from "../../vault/links";
import { element } from "./dom";
import { rememberImage } from "../imageCopies";

/** Notes embedded inside embedded notes stop at this depth (a note embedding itself). */
const EMBED_DEPTH = 3;

/** `[[links]]` and `![[embeds]]`: images, bases and notes are displayed, other files become cards, unresolved links are dimmed. */
export function wikilinkView(bridge: BridgeRef): NodeViewRenderer {
  return ({ node }) => {
    const dom = element("span");
    dom.contentEditable = "false";
    let rendered = "";
    let unmount: (() => void) | null = null;

    const render = (n: PMNode) => {
      const { target, alias, embed } = n.attrs as { target: string; alias: string | null; embed: boolean };
      const resolved = resolveLink(target, bridge.current.files, bridge.current.notePath);
      const key = `${target}|${alias}|${embed}|${resolved}`;
      if (key === rendered) return;
      rendered = key;
      unmount?.();
      unmount = null;
      dom.replaceChildren();
      dom.dataset.target = target;
      if (embed && resolved && /\.base$/i.test(resolved) && bridge.current.mountBase) {
        // A base in the note: its views, live (rendered by the app).
        dom.className = "embed-base";
        const box = element("div");
        dom.append(box);
        unmount = bridge.current.mountBase(box, resolved);
      } else if (embed && resolved && /\.(excalidraw|mindmap)\.md$/i.test(resolved) && bridge.current.readNote) {
        // A drawing or a mind map in the note: drawn read only; the title opens it.
        dom.className = "embed-note embed-page";
        const title = element("button", "embed-note-title");
        title.type = "button";
        title.textContent = alias ?? noteTitle(resolved);
        title.title = "Ouvrir (⌘-clic : dans un nouvel onglet)";
        title.addEventListener("click", (event) => bridge.current.openPath(resolved, event.metaKey || event.ctrlKey));
        const body = element("div", "embed-note-body");
        dom.append(title, body);
        let gone = false;
        const current = bridge.current;
        unmount = () => {
          gone = true;
        };
        void import("./noteEmbed").then(({ mountPageEmbed }) => {
          if (gone) return;
          unmount = mountPageEmbed(body, resolved, current);
        });
      } else if (embed && resolved && /\.md$/i.test(resolved) && !/\.(excalidraw|mindmap)\.md$/i.test(resolved) && bridge.current.readNote && (bridge.current.embedDepth ?? 0) < EMBED_DEPTH) {
        // A note in the note: its text (or one section or block), read only; the title opens it.
        dom.className = "embed-note";
        const subpath = target.includes("#") ? target.slice(target.indexOf("#") + 1) : "";
        const title = element("button", "embed-note-title");
        title.type = "button";
        title.textContent = `${alias && !/^\d+(x\d+)?$/.test(alias) ? alias : noteTitle(resolved)}${subpath ? ` › ${subpath.replace(/^\^/, "")}` : ""}`;
        title.title = "Ouvrir la note (⌘-clic : dans un nouvel onglet)";
        title.addEventListener("click", (event) => bridge.current.openPath(resolved, event.metaKey || event.ctrlKey));
        const body = element("div", "embed-note-body");
        dom.append(title, body);
        let gone = false;
        const current = bridge.current;
        unmount = () => {
          gone = true;
        };
        void import("./noteEmbed").then(({ mountNoteEmbed }) => {
          if (gone) return;
          const remove = mountNoteEmbed(body, resolved, subpath, current);
          unmount = remove;
        });
      } else if (embed && resolved && isImage(resolved)) {
        dom.className = "embed-image";
        const img = element("img");
        img.alt = basename(resolved);
        // `![[image.png|300]]` or `|300x200` sets the displayed size.
        const size = /^(\d+)(?:x(\d+))?$/.exec(alias ?? "");
        if (size) {
          img.width = Number(size[1]);
          if (size[2]) img.height = Number(size[2]);
        }
        void bridge.current.loadImage(resolved).then((url) => (img.src = url));
        rememberImage(`embed:${target}`, img);
        dom.append(img);
      } else if (embed) {
        dom.className = resolved ? "embed-card" : "embed-card unresolved";
        dom.textContent = `${resolved?.endsWith(".md") ? "📄" : "📎"} ${alias ?? (resolved ? noteTitle(resolved) : target)}`;
      } else {
        dom.className = resolved ? "wikilink" : "wikilink unresolved";
        dom.textContent = alias ?? target;
      }
    };
    render(node);
    return {
      dom,
      update: (n) => {
        if (n.type !== node.type) return false;
        render(n);
        return true;
      },
      // Clicks and keys inside an embedded base or note belong to it, not to the editor.
      stopEvent: () => dom.classList.contains("embed-base") || dom.classList.contains("embed-note"),
      ignoreMutation: () => true,
      destroy: () => unmount?.(),
    };
  };
}
