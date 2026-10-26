import DOMPurify from "dompurify";
import { INLINE_HTML_TAGS } from "../markdown/inlineHtml";

/**
 * HTML written in notes, shown rendered. It may
 * come from anywhere (a cloned vault): scripts, frames, forms and event
 * handlers are removed, only layout and formatting are kept.
 */
const CONFIG = {
  FORBID_TAGS: ["script", "style", "iframe", "frame", "object", "embed", "form", "input", "button", "textarea", "select", "link", "meta", "base"],
  FORBID_ATTR: ["srcset", "action", "formaction"],
  ALLOW_DATA_ATTR: false,
};

export function sanitizeHtml(html: string): DocumentFragment {
  return DOMPurify.sanitize(html, { ...CONFIG, RETURN_DOM_FRAGMENT: true });
}

/** The attributes kept from an opening tag (`<span style="color: red">`), for the inlineHtml mark. */
export function openingAttributes(open: string, tag: string): Record<string, string> {
  // Outside a browser (tests), no attributes rather than unsanitized ones.
  if (!INLINE_HTML_TAGS.has(tag) || !DOMPurify.isSupported) return {};
  const element = sanitizeHtml(`${open}x</${tag}>`).firstElementChild;
  if (!element || element.tagName.toLowerCase() !== tag) return {};
  return Object.fromEntries([...element.attributes].map((a) => [a.name, a.value]));
}
