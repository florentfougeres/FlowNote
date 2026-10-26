import { Extension, InputRule, markInputRule, textblockTypeInputRule, wrappingInputRule } from "@tiptap/core";
import { TextSelection } from "@tiptap/pm/state";
import { canJoin, findWrapping } from "@tiptap/pm/transform";
import { editMathBlock } from "./views/rawBlock";

/**
 * Markdown shortcuts typed at the start of a block or around a word. Each one
 * records the syntax that was typed (`*` or `-` bullet, `**` or `__`, ...) so
 * the file gets exactly what the user wrote.
 */
export const MarkdownShortcuts = Extension.create({
  name: "markdownShortcuts",

  addInputRules() {
    const { editor } = this;
    const { nodes, marks } = editor.schema;

    const taskRule = new InputRule({
      find: /^\[([ xX]?)\]\s$/,
      handler: ({ state, range, match }) => {
        const { tr } = state;
        const checked = /x/i.test(match[1]);
        const checkChar = checked ? match[1] : " ";
        const $from = tr.doc.resolve(range.from);
        const item = $from.depth >= 2 ? $from.node(-1) : null;
        // Inside the first paragraph of a list item: turn the item into a task.
        if (item && item.type === nodes.listItem && $from.index(-1) === 0) {
          tr.delete(range.from, range.to);
          tr.setNodeMarkup($from.before(-1), undefined, { ...item.attrs, checked, checkChar });
          return;
        }
        tr.delete(range.from, range.to);
        const blockRange = tr.doc.resolve(range.from).blockRange();
        const wrapping = blockRange && findWrapping(blockRange, nodes.list, { ordered: false, bullet: "-" });
        if (!blockRange || !wrapping) return null;
        const itemIndex = wrapping.findIndex((w) => w.type === nodes.listItem);
        if (itemIndex >= 0) wrapping[itemIndex] = { type: nodes.listItem, attrs: { checked, checkChar } };
        tr.wrap(blockRange, wrapping);
        const before = tr.doc.resolve(range.from - 1).nodeBefore;
        if (before && before.type === nodes.list && !before.attrs.ordered && canJoin(tr.doc, range.from - 1)) {
          tr.join(range.from - 1);
        }
      },
    });

    // `> [!note] ` typed at the start of a quote turns it into an Obsidian callout.
    const calloutRule = new InputRule({
      find: /^\[!([\w-]+)\]([+-]?)\s$/,
      handler: ({ state, range, match }) => {
        const { tr } = state;
        const $from = tr.doc.resolve(range.from);
        if ($from.depth < 2) return null;
        const quote = $from.node(-1);
        if (quote.type !== nodes.blockquote || $from.index(-1) !== 0) return null;
        const quotePos = $from.before(-1);
        tr.delete(range.from, range.to);
        const updated = tr.doc.nodeAt(quotePos)!;
        const children: (typeof updated)[] = [];
        updated.forEach((child) => children.push(child));
        const [first, ...rest] = children;
        const title = nodes.calloutTitle.create(null, first.content);
        const callout = nodes.callout.create({ calloutType: match[1], fold: match[2] }, [title, ...rest]);
        tr.replaceWith(quotePos, quotePos + updated.nodeSize, callout);
        tr.setSelection(TextSelection.create(tr.doc, quotePos + 2 + title.content.size));
      },
    });

    // `:::info ` typed at the start of a line: a HedgeDoc admonition (`:::spoiler ` folds).
    const containerRule = new InputRule({
      find: /^(:{3,})([A-Za-z][\w-]*)\s$/,
      handler: ({ state, range, match }) => {
        const { tr } = state;
        const $from = tr.doc.resolve(range.from);
        if ($from.parent.type !== nodes.paragraph || range.from !== $from.start()) return null;
        const spoiler = match[2].toLowerCase() === "spoiler";
        tr.delete(range.from, range.to);
        const paragraph = tr.doc.resolve(range.from).parent;
        const start = $from.before();
        const callout = nodes.callout.create({ calloutType: match[2], fold: spoiler ? "-" : "", syntax: "hedgedoc", marker: match[1] }, [
          nodes.calloutTitle.create(),
          nodes.paragraph.create(null, paragraph.content),
        ]);
        tr.replaceWith(start, start + paragraph.nodeSize, callout);
        // The title of a spoiler is shown; the other admonitions start with their text.
        tr.setSelection(TextSelection.create(tr.doc, spoiler ? start + 2 : start + 4));
      },
    });

    // `---`, `***` or `___` typed alone in a paragraph inserts a divider.
    const dividerRule = new InputRule({
      find: /^(---|\*\*\*|___)$/,
      handler: ({ state, range, match }) => {
        const { tr } = state;
        const $from = tr.doc.resolve(range.from);
        if ($from.parent.type !== nodes.paragraph || range.from !== $from.start() || range.to !== $from.end()) return null;
        const start = $from.before();
        tr.replaceWith(start, $from.after(), [nodes.horizontalRule.create({ raw: match[1] }), nodes.paragraph.create()]);
        tr.setSelection(TextSelection.create(tr.doc, start + 2));
      },
    });

    // `![alt](url)` and `[text](url)` typed in text become an image and a link at the
    // closing parenthesis; otherwise the brackets would be saved escaped (`\[text\]`).
    const destination = String.raw`\(([^()\s]+)(?:\s+"([^"]*)")?\)$`;
    const imageRule = new InputRule({
      find: new RegExp(String.raw`!\[([^[\]]*)\]` + destination),
      handler: ({ state, range, match }) => {
        state.tr.replaceWith(range.from, range.to, nodes.image.create({ src: match[2], alt: match[1], title: match[3] ?? null }));
      },
    });
    const linkRule = new InputRule({
      find: new RegExp(String.raw`(?<![!\[])\[([^[\]]+)\]` + destination),
      handler: ({ state, range, match }) => {
        const link = marks.link.create({ href: match[2], title: match[3] ?? null, kind: "inline" });
        state.tr.replaceWith(range.from, range.to, state.schema.text(match[1], [link]));
      },
    });

    // `$x^2$` typed in text becomes a formula, with Obsidian's rule: no space just
    // inside the dollars, no letter or digit just before the first one (5$ et 10$ stays text).
    const inlineMathRule = new InputRule({
      find: /(?<![\\$\p{L}\p{N}])\$([^\s$](?:[^$\n]*[^\s$\\])?)\$$/u,
      handler: ({ state, range, match }) => {
        const $from = state.doc.resolve(range.from);
        if ($from.parent.type.spec.code || state.doc.rangeHasMark(range.from, range.to, marks.code)) return null;
        state.tr.replaceWith(range.from, range.to, nodes.inlineRaw.create({ source: match[0], kind: "inlineMath" }));
      },
    });
    // `$$` then a space at the start of an empty paragraph: a formula block, its source open.
    const mathBlockRule = new InputRule({
      find: /^\$\$\s$/,
      handler: ({ state, range }) => {
        const { tr } = state;
        const $from = tr.doc.resolve(range.from);
        if ($from.parent.type !== nodes.paragraph || range.to !== $from.end()) return null;
        const start = $from.before();
        const formula = nodes.rawBlock.create({ source: "$$\n\n$$", kind: "math" });
        tr.replaceWith(start, $from.after(), [formula, nodes.paragraph.create()]);
        tr.setSelection(TextSelection.create(tr.doc, start + formula.nodeSize + 1));
        editMathBlock(editor.view, start);
      },
    });

    const mark = (find: RegExp, type: (typeof marks)[string], marker?: string) =>
      markInputRule({ find, type, getAttributes: marker ? { marker } : undefined });

    return [
      textblockTypeInputRule({ find: /^(#{1,6})\s$/, type: nodes.heading, getAttributes: (m) => ({ level: m[1].length }) }),
      textblockTypeInputRule({
        find: /^(```|~~~)([\w+#.-]*)\s$/,
        type: nodes.codeBlock,
        getAttributes: (m) => ({ fence: m[1], language: m[2] }),
      }),
      taskRule,
      wrappingInputRule({
        find: /^\s*([-+*])\s$/,
        type: nodes.list,
        getAttributes: (m) => ({ ordered: false, bullet: m[1] }),
        joinPredicate: (m, node) => !node.attrs.ordered && node.attrs.bullet === m[1],
      }),
      wrappingInputRule({
        find: /^(\d{1,9})([.)])\s$/,
        type: nodes.list,
        getAttributes: (m) => ({ ordered: true, start: Number(m[1]), bullet: m[2] }),
        joinPredicate: (m, node) => node.attrs.ordered && node.attrs.bullet === m[2] && node.attrs.start + node.childCount === Number(m[1]),
      }),
      wrappingInputRule({ find: /^\s*>\s$/, type: nodes.blockquote }),
      calloutRule,
      containerRule,
      dividerRule,
      imageRule,
      linkRule,
      inlineMathRule,
      mathBlockRule,
      // Delimiters may follow punctuation (l'*italique*) but not a letter (snake_case).
      mark(/(?<=^|[^\p{L}\p{N}*])(\*\*(?!\s)([^*]+?)\*\*)$/u, marks.bold, "**"),
      mark(/(?<=^|[^\p{L}\p{N}_])(__(?!\s)([^_]+?)__)$/u, marks.bold, "__"),
      mark(/(?<=^|[^\p{L}\p{N}*])(\*(?![\s*])([^*]+?)\*)$/u, marks.italic, "*"),
      mark(/(?<=^|[^\p{L}\p{N}_])(_(?![\s_])([^_]+?)_)$/u, marks.italic, "_"),
      mark(/(?<=^|[^\p{L}\p{N}~])(~~(?!\s)([^~]+?)~~)$/u, marks.strike),
      mark(/(?<=^|[^\p{L}\p{N}=])(==(?!\s)([^=]+?)==)$/u, marks.highlight),
      mark(/(?<=^|[^`])(`(?!\s)([^`]+?)`)$/u, marks.code),
    ];
  },
});
