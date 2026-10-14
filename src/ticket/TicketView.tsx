import { useEffect, useMemo, useRef, useState } from "react";
import { keys } from "../keys";
import { NoteEditor, type FrontmatterControl } from "../editor/NoteEditor";
import type { VaultBridge } from "../editor/bridge";
import type { Editor } from "@tiptap/core";
import { Icon } from "../Icon";
import { setProperty } from "../markdown/frontmatter";
import { commentDate, isoMinute, joinTicket, serializeComments, splitTicket, ticketTitle, type TicketComment } from "./format";
import { dueLabel, ticketInfo, urgency } from "./agenda";

/**
 * A ticket page, like a GitHub / GitLab issue: header (number, title, state,
 * tags, due date), description in the note editor, and the comment thread.
 */

/** Front matter keys shown in the header instead of the properties panel. */
const MANAGED = ["type", "id", "status", "tags", "due", "created", "closed"];

const displayDate = (iso: string | null) => (iso ? new Date(iso.length <= 10 ? `${iso}T12:00:00` : iso).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" }) : "");

/** Comment text, rendered like the note (read-only editor). */
function CommentText({ text, bridge }: { text: string; bridge: VaultBridge }) {
  return (
    <div className="comment-text">
      <NoteEditor source={text} onMarkdown={() => {}} bridge={bridge} editable={false} properties={false} />
    </div>
  );
}

/** A small note editor: live Markdown, slash menu, links and emojis like in the page. */
function Composer({ placeholder, initial = "", submitLabel, bridge, onSubmit, onCancel, extra }: { placeholder: string; initial?: string; submitLabel: string; bridge: VaultBridge; onSubmit: (text: string) => void; onCancel?: () => void; extra?: { label: string; onClick: (text: string) => void } }) {
  const [text, setText] = useState(initial);
  const [generation, setGeneration] = useState(0);
  const [focused, setFocused] = useState(false);
  const editor = useRef<Editor | null>(null);
  const empty = !text.trim();
  const submit = (action: (text: string) => void) => {
    const value = text.trim();
    if (!value) return;
    action(value);
    setText("");
    setGeneration((g) => g + 1);
  };
  useEffect(() => {
    if (onCancel) editor.current?.commands.focus("end");
  }, [onCancel]);
  return (
    <div
      className={focused ? "comment-composer focused" : "comment-composer"}
      onFocus={() => setFocused(true)}
      onBlur={(e) => !e.currentTarget.contains(e.relatedTarget as Node | null) && setFocused(false)}
      onKeyDownCapture={(e) => {
        if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
          e.preventDefault();
          e.stopPropagation();
          submit(onSubmit);
        } else if (e.key === "Escape" && onCancel && !document.querySelector(".slash-menu")) onCancel();
      }}
    >
      <div className="comment-composer-editor" onMouseDown={(e) => e.target === e.currentTarget && (e.preventDefault(), editor.current?.commands.focus("end"))}>
        {empty && <span className="comment-placeholder">{placeholder}</span>}
        <NoteEditor key={generation} source={generation === 0 ? initial : ""} onMarkdown={setText} bridge={bridge} onEditor={(e) => (editor.current = e)} properties={false} />
      </div>
      <div className="comment-composer-actions">
        <small>{keys("Markdown · / pour les blocs · ⌘↵ pour envoyer")}</small>
        {onCancel && <button onClick={onCancel}>Annuler</button>}
        {extra && (
          <button disabled={empty} onClick={() => submit(extra.onClick)}>
            {extra.label}
          </button>
        )}
        <button className="primary" disabled={empty} onClick={() => submit(onSubmit)}>
          {submitLabel}
        </button>
      </div>
    </div>
  );
}

/** The due date as a chip (like the tags); a click opens the system date picker. */
function DueField({ value, urgent, editable, onChange }: { value: string | null; urgent: string | null; editable: boolean; onChange: (due: string | null) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const pick = () => {
    const el = input.current;
    if (!el || !editable) return;
    try {
      el.showPicker();
    } catch {
      el.focus();
      el.click();
    }
  };
  return (
    <span className="due-field">
      <input ref={input} type="date" className="due-field-input" value={value ?? ""} tabIndex={-1} aria-hidden="true" onChange={(e) => onChange(e.target.value || null)} />
      {value ? (
        <span className={`ticket-tag due-chip-field${urgent ? ` ${urgent}` : ""}`}>
          <button className="due-field-open" onClick={pick} disabled={!editable} title="Changer l'échéance">
            📅 {new Date(`${value}T12:00:00`).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short", year: "numeric" })}
            {urgent && /^(aujourd|demain|hier|en retard)/.test(dueLabel(value)) ? ` · ${dueLabel(value)}` : ""}
          </button>
          {editable && (
            <button aria-label="Retirer l'échéance" onClick={() => onChange(null)}>
              ×
            </button>
          )}
        </span>
      ) : (
        editable && (
          <button className="ticket-add" onClick={pick}>
            + échéance
          </button>
        )
      )}
    </span>
  );
}

type Path = number[];

function updateAt(comments: TicketComment[], path: Path, change: (c: TicketComment) => TicketComment | null): TicketComment[] {
  const [index, ...rest] = path;
  return comments.flatMap((comment, i) => {
    if (i !== index) return [comment];
    if (rest.length === 0) {
      const next = change(comment);
      return next ? [next] : [];
    }
    return [{ ...comment, replies: updateAt(comment.replies, rest, change) }];
  });
}

function CommentItem({ comment, path, editable, bridge, onChange }: { comment: TicketComment; path: Path; editable: boolean; bridge: VaultBridge; onChange: (path: Path, change: (c: TicketComment) => TicketComment | null) => void }) {
  const [mode, setMode] = useState<"view" | "edit" | "reply" | "delete">("view");
  return (
    <div className="comment">
      <div className="comment-card">
        <header>
          <span className="comment-avatar" aria-hidden="true">
            <Icon name="comment" size={12} />
          </span>
          <span className="comment-date">{comment.date}</span>
          {editable && mode === "view" && (
            <span className="comment-actions">
              <button onClick={() => setMode("reply")} title="Répondre">
                <Icon name="reply" size={13} />
              </button>
              <button onClick={() => setMode("edit")} title="Modifier">
                <Icon name="compose" size={13} />
              </button>
              <button onClick={() => setMode("delete")} title="Supprimer">
                <Icon name="trash" size={13} />
              </button>
            </span>
          )}
        </header>
        {mode === "edit" ? (
          <Composer
            placeholder="Commentaire"
            initial={comment.text}
            submitLabel="Enregistrer"
            bridge={bridge}
            onSubmit={(text) => {
              onChange(path, (c) => ({ ...c, text }));
              setMode("view");
            }}
            onCancel={() => setMode("view")}
          />
        ) : (
          <CommentText text={comment.text} bridge={bridge} />
        )}
        {mode === "delete" && (
          <div className="comment-confirm">
            <span>Supprimer ce commentaire{comment.replies.length ? " et ses réponses" : ""} ?</span>
            <button onClick={() => setMode("view")}>Garder</button>
            <button className="danger" onClick={() => onChange(path, () => null)}>
              Supprimer
            </button>
          </div>
        )}
      </div>
      {(comment.replies.length > 0 || mode === "reply") && (
        <div className="comment-replies">
          {comment.replies.map((reply, i) => (
            <CommentItem key={`${reply.date}-${i}`} comment={reply} path={[...path, i]} editable={editable} bridge={bridge} onChange={onChange} />
          ))}
          {mode === "reply" && (
            <Composer
              placeholder="Répondre…"
              submitLabel="Répondre"
              bridge={bridge}
              onSubmit={(text) => {
                onChange(path, (c) => ({ ...c, replies: [...c.replies, { date: commentDate(), text, replies: [] }] }));
                setMode("view");
              }}
              onCancel={() => setMode("view")}
            />
          )}
        </div>
      )}
    </div>
  );
}

export function TicketView({
  path,
  source,
  markdown,
  onMarkdown,
  bridge,
  editable,
  onEditor,
}: {
  path: string;
  /** Text the page was loaded from. */
  source: string;
  /** Current text (with unsaved edits). */
  markdown: string;
  onMarkdown: (markdown: string) => void;
  bridge: VaultBridge;
  editable: boolean;
  onEditor: (editor: Editor | null) => void;
}) {
  const initial = useMemo(() => splitTicket(source), [source]);
  const head = useRef(initial.head);
  const section = useRef(initial.commentsSection);
  const [comments, setComments] = useState(initial.comments);
  const control = useRef<FrontmatterControl | null>(null);
  const [tagDraft, setTagDraft] = useState<string | null>(null);
  const info = ticketInfo(path, markdown);
  const { title } = ticketTitle(path);

  const onHead = (text: string) => {
    head.current = text;
    onMarkdown(joinTicket(text, section.current));
  };
  const changeComments = (next: TicketComment[]) => {
    setComments(next);
    section.current = serializeComments(next, initial.layout);
    // Without comments left, the blank line that preceded the section goes too.
    if (!section.current) head.current = head.current.replace(/(\r?\n)(\r?\n)+$/, "$1");
    onMarkdown(joinTicket(head.current, section.current));
  };
  const setField = (key: string, value: string | string[] | undefined) => {
    const c = control.current;
    if (c) c.set(setProperty(c.get(), key, value));
  };
  const setStatus = (closed: boolean) => {
    const c = control.current;
    if (!c) return;
    let raw = setProperty(c.get(), "status", closed ? "closed" : "open");
    raw = setProperty(raw, "closed", closed ? isoMinute() : undefined);
    c.set(raw);
  };
  const addTag = (tag: string) => {
    const clean = tag.trim().replace(/^#/, "").replace(/\s+/g, "-");
    if (clean && !info.tags.includes(clean)) setField("tags", [...info.tags, clean]);
  };
  const count = (list: TicketComment[]): number => list.reduce((n, c) => n + 1 + count(c.replies), 0);
  const closed = info.status === "closed";
  const dueUrgency = info.due && !closed ? urgency(info.due.slice(0, 10)) : null;

  return (
    <div className="ticket">
      <header className="ticket-header">
        <h1 className="ticket-title">
          {title} {info.id !== null && <span className="ticket-number">#{info.id}</span>}
        </h1>
        <div className="ticket-meta">
          <span className={`ticket-state ${closed ? "closed" : "open"}`}>
            <Icon name={closed ? "ticketClosed" : "ticket"} size={14} /> {closed ? "Fermé" : "Ouvert"}
          </span>
          <span className="ticket-meta-text">
            {closed && info.closed ? `fermé le ${displayDate(info.closed)}` : info.created ? `ouvert le ${displayDate(info.created)}` : ""}
            {` · ${count(comments)} commentaire${count(comments) > 1 ? "s" : ""}`}
            {info.tasks.total > 0 ? ` · ${info.tasks.done}/${info.tasks.total} tâches` : ""}
          </span>
          <span className="cell-spacer" />
          {editable && (
            <button className={closed ? "" : "ticket-close"} onClick={() => setStatus(!closed)}>
              {closed ? "Rouvrir" : "Fermer le ticket"}
            </button>
          )}
        </div>
        <div className="ticket-fields">
          <div className="ticket-field">
            <span className="ticket-field-label">Tags</span>
            <div className="ticket-tags">
              {info.tags.map((tag) => (
                <span key={tag} className="ticket-tag">
                  #{tag}
                  {editable && (
                    <button aria-label={`Retirer ${tag}`} onClick={() => setField("tags", info.tags.filter((t) => t !== tag))}>
                      ×
                    </button>
                  )}
                </span>
              ))}
              {editable &&
                (tagDraft === null ? (
                  <button className="ticket-add" onClick={() => setTagDraft("")}>
                    + tag
                  </button>
                ) : (
                  <input
                    className="ticket-tag-input"
                    autoFocus
                    value={tagDraft}
                    placeholder="tag"
                    onChange={(e) => setTagDraft(e.target.value)}
                    onBlur={() => {
                      if (tagDraft) addTag(tagDraft);
                      setTagDraft(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === ",") {
                        e.preventDefault();
                        addTag(tagDraft);
                        setTagDraft("");
                      }
                      if (e.key === "Escape") setTagDraft(null);
                    }}
                  />
                ))}
            </div>
          </div>
          <div className="ticket-field">
            <span className="ticket-field-label">Échéance</span>
            <DueField value={info.due?.slice(0, 10) ?? null} urgent={dueUrgency} editable={editable} onChange={(due) => setField("due", due ?? undefined)} />
          </div>
        </div>
      </header>

      <section className="ticket-body">
        <NoteEditor source={initial.head} onMarkdown={onHead} bridge={bridge} editable={editable} onEditor={onEditor} hiddenProperties={MANAGED} frontmatterControl={control} />
      </section>

      <section className="ticket-thread" aria-label="Commentaires">
        <h2>Commentaires</h2>
        {comments.map((comment, i) => (
          <CommentItem key={`${comment.date}-${i}`} comment={comment} path={[i]} editable={editable} bridge={bridge} onChange={(at, change) => changeComments(updateAt(comments, at, change))} />
        ))}
        {editable && (
          <Composer
            placeholder="Ajouter un commentaire…"
            submitLabel="Commenter"
            bridge={bridge}
            onSubmit={(text) => changeComments([...comments, { date: commentDate(), text, replies: [] }])}
            extra={
              closed
                ? undefined
                : {
                    label: "Commenter et fermer",
                    onClick: (text) => {
                      changeComments([...comments, { date: commentDate(), text, replies: [] }]);
                      setStatus(true);
                    },
                  }
            }
          />
        )}
      </section>
    </div>
  );
}
