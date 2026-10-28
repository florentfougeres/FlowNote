import { useEffect, useMemo, useRef, useState } from "react";
import { keys } from "../keys";
import { NoteEditor, type FrontmatterControl } from "../editor/NoteEditor";
import type { VaultBridge } from "../editor/bridge";
import type { Editor } from "@tiptap/core";
import { Icon, type IconName } from "../Icon";
import type { PropertyValue } from "../markdown/frontmatter";
import { linkTextFor, resolveLink } from "../vault/links";
import { linkItems } from "../editor/wikilinks";
import { commentDate, joinTask, serializeComments, splitTask, type TaskComment } from "./comments";
import { dueLabel, urgency } from "./agenda";
import { priorityOf, statusOf, type TaskConfig } from "./config";
import { actionDay, doneStatus, NEW_TASK_TITLE, reopenStatus, setTaskField, taskInfo } from "./task";
import { setRecurrence, toggleOccurrence } from "./recurrence";
import { RecurrenceField } from "./RecurrenceField";
import { durationLabel, linkText } from "./TaskSummary";
import { DatePicker } from "../DatePicker";
import { isoDay } from "../dates";

/**
 * A task page, like an issue: header (title, status, priority, dates,
 * contexts, projects, tags, estimate), description in the note editor, and
 * the comment thread. The fields are written as TaskNotes writes them.
 */

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

/** The due date as a chip (like the tags); a click opens the date picker. */
function DateField({ value, urgent, editable, onChange, icon = "calendar", add }: { value: string | null; urgent: string | null; editable: boolean; onChange: (due: string | null) => void; icon?: IconName; add: string }) {
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const pick = (event: React.MouseEvent) => editable && setAnchor(event.currentTarget.getBoundingClientRect());
  return (
    <span className="due-field">
      {value ? (
        <span className={`task-tag due-chip-field${urgent ? ` ${urgent}` : ""}`}>
          <button className="due-field-open" onClick={pick} disabled={!editable} title="Changer la date">
            <Icon name={icon} size={12} /> {new Date(`${value}T12:00:00`).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short", year: "numeric" })}
            {urgent && /^(aujourd|demain|hier|en retard)/.test(dueLabel(value)) ? ` · ${dueLabel(value)}` : ""}
          </button>
          {editable && (
            <button aria-label="Retirer la date" onClick={() => onChange(null)}>
              ×
            </button>
          )}
        </span>
      ) : (
        editable && (
          <button className="task-add" onClick={pick}>
            + {add}
          </button>
        )
      )}
      {anchor && <DatePicker value={value} anchor={anchor} onChange={onChange} onClose={() => setAnchor(null)} />}
    </span>
  );
}

type Path = number[];

function updateAt(comments: TaskComment[], path: Path, change: (c: TaskComment) => TaskComment | null): TaskComment[] {
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

function CommentItem({ comment, path, editable, bridge, onChange }: { comment: TaskComment; path: Path; editable: boolean; bridge: VaultBridge; onChange: (path: Path, change: (c: TaskComment) => TaskComment | null) => void }) {
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

/** A list of chips (tags, contexts) with a field to add one. */
function ChipsField({ values, prefix = "", label, editable, kind, onChange }: { values: string[]; prefix?: string; label: string; editable: boolean; kind?: "context"; onChange: (values: string[]) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  const add = (text: string) => {
    const clean = text.trim().replace(/^[#@]/, "");
    const value = clean.replace(/\s+/g, "-");
    if (value && !values.includes(value)) onChange([...values, value]);
  };
  return (
    <div className="task-tags">
      {values.map((value) => (
        <span key={value} className={kind ? `task-chip ${kind}` : "task-tag"}>
          {prefix}
          {value}
          {editable && (
            <button aria-label={`Retirer ${value}`} onClick={() => onChange(values.filter((v) => v !== value))}>
              ×
            </button>
          )}
        </span>
      ))}
      {editable &&
        (draft === null ? (
          <button className="task-add" onClick={() => setDraft("")}>
            + {label}
          </button>
        ) : (
          <input
            className="task-tag-input"
            autoFocus
            value={draft}
            placeholder={label}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => {
              if (draft) add(draft);
              setDraft(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === ",") {
                e.preventDefault();
                add(draft);
                setDraft("");
              }
              if (e.key === "Escape") setDraft(null);
            }}
          />
        ))}
    </div>
  );
}

/**
 * The projects of a task: notes of the vault, chosen in a list as TaskNotes
 * does (written `"[[Note]]"`, the shortest link Obsidian would write).
 */
function ProjectsField({ values, files, editable, onChange, onOpen }: { values: string[]; files: string[]; editable: boolean; onChange: (values: string[]) => void; onOpen: (value: string) => void }) {
  const [query, setQuery] = useState<string | null>(null);
  const [active, setActive] = useState(0);
  const found = query === null ? [] : linkItems(query, files, false).filter((item) => item.path && !values.includes(`[[${linkTextFor(item.path, files)}]]`)).slice(0, 8);
  const pick = (path: string) => {
    onChange([...values, `[[${linkTextFor(path, files)}]]`]);
    setQuery(null);
  };
  return (
    <div className="task-tags">
      {values.map((value) => (
        <span key={value} className="task-chip project">
          <button className="task-chip-open" onClick={() => onOpen(value)} title="Ouvrir la note">
            {linkText(value)}
          </button>
          {editable && (
            <button aria-label={`Retirer ${linkText(value)}`} onClick={() => onChange(values.filter((v) => v !== value))}>
              ×
            </button>
          )}
        </span>
      ))}
      {editable &&
        (query === null ? (
          <button className="task-add" onClick={() => (setQuery(""), setActive(0))}>
            + projet
          </button>
        ) : (
          <span className="task-picker">
            <input
              className="task-tag-input"
              autoFocus
              value={query}
              placeholder="Chercher une note"
              role="combobox"
              aria-expanded={found.length > 0}
              aria-controls="task-project-list"
              onChange={(e) => (setQuery(e.target.value), setActive(0))}
              onBlur={() => setQuery(null)}
              onKeyDown={(e) => {
                const path = found[active]?.path;
                if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                  e.preventDefault();
                  setActive((active + (e.key === "ArrowDown" ? 1 : found.length - 1)) % Math.max(1, found.length));
                } else if (e.key === "Enter" && path) {
                  e.preventDefault();
                  pick(path);
                } else if (e.key === "Escape") setQuery(null);
              }}
            />
            {found.length > 0 && (
              <span className="task-picker-list" id="task-project-list" role="listbox" onMouseDown={(e) => e.preventDefault()}>
                {found.map((item, i) => (
                  <button key={item.key} role="option" aria-selected={i === active} className={i === active ? "active" : undefined} onMouseEnter={() => setActive(i)} onClick={() => item.path && pick(item.path)}>
                    <span>{item.title}</span>
                    <small>{item.description}</small>
                  </button>
                ))}
              </span>
            )}
          </span>
        ))}
    </div>
  );
}

/** "1h30", "90", "45 min" → minutes. */
export function parseMinutes(text: string): number | null {
  const t = text.trim().toLowerCase().replace(",", ".");
  const hm = /^(\d+(?:\.\d+)?)\s*h\s*(\d+)?\s*(?:min)?$/.exec(t);
  if (hm) return Math.round(Number(hm[1]) * 60 + Number(hm[2] ?? 0));
  const m = /^(\d+)\s*(?:min|m)?$/.exec(t);
  return m ? Number(m[1]) : null;
}

function EstimateField({ value, editable, onChange }: { value: number | null; editable: boolean; onChange: (minutes: number | null) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    if (draft !== null) onChange(draft.trim() === "" ? null : parseMinutes(draft) ?? value);
    setDraft(null);
  };
  if (draft !== null)
    return <input className="task-tag-input" autoFocus value={draft} placeholder="1 h 30" onChange={(e) => setDraft(e.target.value)} onBlur={commit} onKeyDown={(e) => (e.key === "Enter" ? commit() : e.key === "Escape" && setDraft(null))} />;
  return value ? (
    <span className="task-tag">
      <button className="task-chip-open" disabled={!editable} onClick={() => setDraft(durationLabel(value))}>
        <Icon name="clock" size={12} /> {durationLabel(value)}
      </button>
      {editable && (
        <button aria-label="Retirer l'estimation" onClick={() => onChange(null)}>
          ×
        </button>
      )}
    </span>
  ) : editable ? (
    <button className="task-add" onClick={() => setDraft("")}>
      + estimation
    </button>
  ) : null;
}

/** A choice among the statuses or priorities, as the app's menus. */
function ChoiceMenu({ choices, value, editable, className, children, onChange }: { choices: { value: string; label: string; color: string }[]; value: string; editable: boolean; className: string; children: React.ReactNode; onChange: (value: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="task-state-wrap">
      <button className={className} disabled={!editable} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}>
        {children}
        {editable && <Icon name="chevronDown" size={11} />}
      </button>
      {open && (
        <span className="task-state-menu" role="menu" onMouseLeave={() => setOpen(false)}>
          {choices.map((c) => (
            <button
              key={c.value}
              role="menuitemradio"
              aria-checked={c.value === value}
              className={c.value === value ? "selected" : undefined}
              onClick={() => {
                setOpen(false);
                if (c.value !== value) onChange(c.value);
              }}
            >
              <span className="board-dot" style={{ background: c.color }} /> {c.label}
            </button>
          ))}
        </span>
      )}
    </span>
  );
}

/**
 * The task's title, typed in place (Enter or leaving the field): the file
 * name, or the title property when TaskNotes names files by id. A new task
 * opens with it selected.
 */
function TaskTitle({ title, editable, onChange }: { title: string; editable: boolean; onChange: (title: string) => Promise<boolean> }) {
  const [value, setValue] = useState(title);
  useEffect(() => setValue(title), [title]);
  const field = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (editable && title === NEW_TASK_TITLE) field.current?.select();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const commit = async () => {
    const next = value.trim();
    if (!next || next === title) return setValue(title);
    if (!(await onChange(next))) setValue(title);
  };
  return (
    <input
      ref={field}
      className="task-title"
      value={value}
      readOnly={!editable}
      spellCheck={false}
      aria-label="Titre de la tâche"
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => void commit()}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") {
          setValue(title);
          requestAnimationFrame(() => (e.target as HTMLInputElement).blur());
        }
      }}
    />
  );
}

export function TaskView({
  path,
  source,
  markdown,
  onMarkdown,
  bridge,
  editable,
  onEditor,
  onRename,
  config,
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
  /** Renames the task's file (its title, unless TaskNotes names files by id). */
  onRename: (title: string) => Promise<boolean>;
  config: TaskConfig;
}) {
  const initial = useMemo(() => splitTask(source), [source]);
  const head = useRef(initial.head);
  const section = useRef(initial.commentsSection);
  const [comments, setComments] = useState(initial.comments);
  const control = useRef<FrontmatterControl | null>(null);
  const info = taskInfo(path, markdown, config);
  const f = config.fields;
  /** Front matter keys shown in the header instead of the properties panel. */
  const managed = useMemo(() => [...Object.values(config.fields), "tags"], [config]);

  const onHead = (text: string) => {
    head.current = text;
    onMarkdown(joinTask(text, section.current));
  };
  const changeComments = (next: TaskComment[]) => {
    setComments(next);
    section.current = serializeComments(next, initial.layout);
    // Without comments left, the blank line that preceded the section goes too.
    if (!section.current) head.current = head.current.replace(/(\r?\n)(\r?\n)+$/, "$1");
    onMarkdown(joinTask(head.current, section.current));
  };
  /** Sets a field the way TaskNotes does (modification date, completion date). */
  const setField = (key: string, value: PropertyValue | undefined) => changeFrontmatter((text) => setTaskField(text, key, value, config));
  /** Changes the front matter as a whole note's text (the helpers work on notes). */
  const changeFrontmatter = (change: (text: string) => string) => {
    const c = control.current;
    if (!c) return;
    const raw = c.get();
    c.set(change(raw ? `${raw}\n` : "").replace(/\n$/, ""));
  };
  /** A recurring task's next occurrence to complete. */
  const occurrence = info.recurrence ? actionDay(info) : null;
  const setDone = (done: boolean) => setField(f.status, done ? doneStatus(config) : reopenStatus(config));
  const status = statusOf(config, info.status || null);
  const priority = priorityOf(config, info.priority);
  const count = (list: TaskComment[]): number => list.reduce((n, c) => n + 1 + count(c.replies), 0);
  const day = (iso: string | null) => (iso ? iso.slice(0, 10) : null);
  const openProject = (value: string) => {
    const target = linkText(value.replace(/\|[^\]]*\]\]$/, "]]"));
    const found = resolveLink(target, bridge.files, path);
    if (found) bridge.openPath(found);
  };

  return (
    <div className="task">
      <header className="task-header">
        <TaskTitle
          title={info.title}
          editable={editable}
          onChange={async (title) => {
            if (config.titleInFilename) return onRename(title);
            setField(f.title, title);
            return true;
          }}
        />
        <div className="task-meta">
          <ChoiceMenu choices={config.statuses} value={info.status} editable={editable} className={`task-state${info.done ? " done" : ""}`} onChange={(value) => setField(f.status, value)}>
            <span className="board-dot" style={{ background: status.color }} /> {status.label}
          </ChoiceMenu>
          <span className="task-meta-text">
            {info.done && info.completed ? `terminée le ${displayDate(info.completed)}` : info.created ? `créée le ${displayDate(info.created)}` : ""}
            {count(comments) > 0 ? ` · ${count(comments)} commentaire${count(comments) > 1 ? "s" : ""}` : ""}
            {info.checklist.total > 0 ? ` · ${info.checklist.done}/${info.checklist.total} cases cochées` : ""}
          </span>
          <span className="cell-spacer" />
          {editable &&
            (occurrence && !info.done ? (
              <button className="task-close" onClick={() => changeFrontmatter((text) => toggleOccurrence(text, info, occurrence, config))}>
                Fait pour {occurrence === isoDay() ? "aujourd'hui" : `le ${displayDate(occurrence)}`}
              </button>
            ) : (
              <button className={info.done ? "" : "task-close"} onClick={() => setDone(!info.done)}>
                {info.done ? "Rouvrir" : "Terminer la tâche"}
              </button>
            ))}
        </div>
        <div className="task-fields">
          <div className="task-field">
            <span className="task-field-label">Priorité</span>
            <ChoiceMenu choices={config.priorities} value={info.priority ?? ""} editable={editable} className="task-priority" onChange={(value) => setField(f.priority, value)}>
              <span className="board-dot" style={{ background: priority?.color ?? "var(--faint)" }} /> {priority?.label ?? "Aucune"}
            </ChoiceMenu>
          </div>
          <div className="task-field">
            <span className="task-field-label">Échéance</span>
            <DateField value={day(info.due)} urgent={info.due && !info.done ? urgency(info.due.slice(0, 10)) : null} editable={editable} add="échéance" onChange={(due) => setField(f.due, due ?? undefined)} />
          </div>
          <div className="task-field">
            <span className="task-field-label">Prévue le</span>
            <DateField value={day(info.scheduled)} urgent={null} icon="hourglass" editable={editable} add="date prévue" onChange={(date) => setField(f.scheduled, date ?? undefined)} />
          </div>
          <div className="task-field">
            <span className="task-field-label">Estimation</span>
            <EstimateField value={info.timeEstimate} editable={editable} onChange={(minutes) => setField(f.timeEstimate, minutes ?? undefined)} />
          </div>
          <div className="task-field">
            <span className="task-field-label">Projets</span>
            <ProjectsField values={info.projects} files={bridge.files} editable={editable} onOpen={openProject} onChange={(values) => setField(f.projects, values.length ? values : undefined)} />
          </div>
          <div className="task-field">
            <span className="task-field-label">Contextes</span>
            <ChipsField values={info.contexts} prefix="@" label="contexte" kind="context" editable={editable} onChange={(values) => setField(f.contexts, values.length ? values : undefined)} />
          </div>
          <div className="task-field">
            <span className="task-field-label">Tags</span>
            <ChipsField
              values={info.tags}
              prefix="#"
              label="tag"
              editable={editable}
              onChange={(values) => {
                // The task tag stays (TaskNotes recognises the task by it).
                const marker = config.identification === "tag" ? [config.tag] : [];
                setField("tags", [...marker, ...values]);
              }}
            />
          </div>
          <div className="task-field">
            <span className="task-field-label">Répéter</span>
            <RecurrenceField
              key={info.recurrence ?? ""}
              rule={info.recurrence}
              anchor={info.recurrenceAnchor}
              start={new Date(`${(info.scheduled ?? isoDay()).slice(0, 10)}T12:00:00`)}
              done={info.completeInstances.length}
              editable={editable}
              onChange={(rule, anchor) => changeFrontmatter((text) => setRecurrence(text, rule, anchor, config))}
            />
          </div>
        </div>
      </header>

      <section className="task-body">
        <NoteEditor source={initial.head} onMarkdown={onHead} bridge={bridge} editable={editable} onEditor={onEditor} hiddenProperties={managed} frontmatterControl={control} />
      </section>

      <section className="task-thread" aria-label="Commentaires">
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
              info.done
                ? undefined
                : {
                    label: "Commenter et terminer",
                    onClick: (text) => {
                      changeComments([...comments, { date: commentDate(), text, replies: [] }]);
                      setDone(true);
                    },
                  }
            }
          />
        )}
      </section>
    </div>
  );
}
