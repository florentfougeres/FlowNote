import type { NodeViewRenderer } from "@tiptap/core";
import type { Node as PMNode } from "@tiptap/pm/model";
import { type BridgeRef, isImage } from "../bridge";
import { basename, dirname, resolveLink } from "../../vault/links";
import { element } from "./dom";

/** Markdown images `![alt](path)`: vault paths are relative to the note. */
export function imageView(bridge: BridgeRef): NodeViewRenderer {
  return ({ node }) => {
    const img = element("img");
    const render = (n: PMNode) => {
      const src = String(n.attrs.src);
      img.alt = n.attrs.alt;
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
    };
    render(node);
    return {
      dom: img,
      update: (n) => {
        if (n.type !== node.type) return false;
        render(n);
        return true;
      },
    };
  };
}
