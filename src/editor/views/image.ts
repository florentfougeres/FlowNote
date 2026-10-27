import type { NodeViewRenderer } from "@tiptap/core";
import type { Node as PMNode } from "@tiptap/pm/model";
import { type BridgeRef, isImage } from "../bridge";
import { basename, dirname, resolveLink } from "../../vault/links";
import { element, updateAttrs } from "./dom";
import { applySize, isImageEvent, resizableImage, splitAlt } from "./imageResize";
import { rememberImage } from "../imageCopies";
import { videoOf, type Video } from "../../reading/web";

/** Shows in `img` the image at `src`: a web address, or a vault path relative to the note. */
export function showImage(img: HTMLImageElement, src: string, bridge: BridgeRef) {
  if (/^(https?:|data:|blob:)/.test(src)) {
    img.src = src;
    return;
  }
  let path = src;
  try {
    path = decodeURI(src);
  } catch {
    // keep the raw source
  }
  const folder = dirname(bridge.current.notePath);
  const candidate = path.startsWith("/") ? path.slice(1) : [folder, path].filter(Boolean).join("/");
  const normalized: string[] = [];
  for (const part of candidate.split("/")) {
    if (part === "..") normalized.pop();
    else if (part !== ".") normalized.push(part);
  }
  const resolved = resolveLink(normalized.join("/"), bridge.current.files) ?? resolveLink(basename(path), bridge.current.files);
  if (resolved && isImage(resolved)) void bridge.current.loadImage(resolved).then((url) => (img.src = url));
}

/**
 * A YouTube or Vimeo video written as an image, `![](https://youtu.be/…)`, as
 * Obsidian embeds it: its thumbnail, then the player on a click (no request to
 * the site before that). Vimeo has no thumbnail without asking: its player at once.
 */
function videoView(video: Video, alt: string): HTMLElement {
  const box = element("span", "note-video");
  box.contentEditable = "false";
  const play = () => {
    const frame = element("iframe");
    frame.src = video.thumbnail ? `${video.player}${video.player.includes("?") ? "&" : "?"}autoplay=1` : video.player;
    frame.title = alt || "Vidéo";
    frame.allow = "autoplay; encrypted-media; picture-in-picture; fullscreen";
    frame.referrerPolicy = "strict-origin-when-cross-origin";
    frame.allowFullscreen = true;
    box.replaceChildren(frame);
  };
  if (!video.thumbnail) {
    play();
    return box;
  }
  const button = element("button", "note-video-thumbnail");
  button.type = "button";
  button.style.backgroundImage = `url("${video.thumbnail}")`;
  button.setAttribute("aria-label", "Lire la vidéo");
  button.append(element("span", "note-video-play"));
  button.addEventListener("click", play);
  box.append(button);
  return box;
}

/** Markdown images `![alt](path)`: vault paths are relative to the note; a YouTube or Vimeo address is a video. */
export function imageView(bridge: BridgeRef): NodeViewRenderer {
  return ({ node, editor, getPos }) => {
    const video = videoOf(String(node.attrs.src));
    if (video) {
      const dom = videoView(video, node.attrs.alt);
      return {
        dom,
        update: (n) => n.type === node.type && n.attrs.src === node.attrs.src,
        // The thumbnail and the player take their clicks; the editor does not select through them.
        stopEvent: (event) => dom.contains(event.target as globalThis.Node) && event.type !== "dragstart",
        ignoreMutation: () => true,
      };
    }
    const img = element("img");
    let current = node;
    // The new width goes after a `|` in the alt text, as Obsidian reads it (`![texte|300](…)`).
    const dom = resizableImage(img, (width) => {
      const { text } = splitAlt(String(current.attrs.alt));
      updateAttrs(editor, getPos as () => number | undefined, { alt: `${text}|${width}`, raw: null });
    });
    const render = (n: PMNode) => {
      current = n;
      const { text, size } = splitAlt(String(n.attrs.alt));
      img.alt = text;
      applySize(img, size);
      rememberImage(`src:${n.attrs.src}`, img);
      showImage(img, String(n.attrs.src), bridge);
    };
    render(node);
    return {
      dom,
      update: (n) => {
        if (n.type !== node.type || videoOf(String(n.attrs.src))) return false;
        render(n);
        return true;
      },
      stopEvent: isImageEvent,
      ignoreMutation: () => true,
    };
  };
}
