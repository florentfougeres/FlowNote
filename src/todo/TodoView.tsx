import { useEffect, useRef, useState } from "react";
import type { Vault } from "../vault/vault";
import { DateField, formatDateValue, isoDay } from "../DatePicker";
import { TagInput } from "../reading/TagInput";
import { Icon } from "../Icon";
import { addTodo, categoriesOf, parseTodos, removeTodo, toggleTodo } from "./todo";

/** The "Tâches" view: a form to add a task, then the tasks by category. */
export function TodoView({ vault, path, exists, onCreated }: { vault: Vault; path: string; exists: boolean; onCreated: () => void }) {
  const [text, setText] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("");
  const [due, setDue] = useState<string | null>(null);
  const [tags, setTags] = useState<string[]>([]);
  const [showDone, setShowDone] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (exists) vault.read(path).then(setText, () => setText(""));
    else setText("");
    input.current?.focus();
  }, [vault, path, exists]);

  const save = async (next: string) => {
    const before = text ?? "";
    setText(next);
    if (!exists) {
      await vault.create(path, next);
      onCreated();
    } else await vault.write(path, next, before);
  };

  if (text === null) return null;
  const todos = parseTodos(text);
  const categories = categoriesOf(text);
  const allTags = [...new Set(todos.flatMap((t) => t.tags))];
  const today = isoDay(new Date());
  const groups = [null, ...categories].map((c) => ({ category: c, items: todos.filter((t) => t.category === c && (showDone || !t.done)) })).filter((g) => g.items.length > 0);

  const submit = () => {
    if (!title.trim()) return;
    void save(addTodo(text, title, category.trim() || null, due, tags));
    setTitle("");
    setDue(null);
    setTags([]);
    input.current?.focus();
  };

  return (
    <div className="todo-view">
      <h1>Tâches</h1>
      <form
        className="todo-form"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <input ref={input} className="todo-title" value={title} placeholder="Nouvelle tâche…" onChange={(e) => setTitle(e.target.value)} />
        <div className="todo-fields">
          <input className="todo-category" value={category} placeholder="Catégorie" list="todo-categories" onChange={(e) => setCategory(e.target.value)} />
          <datalist id="todo-categories">
            {categories.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
          <DateField value={due} placeholder="Échéance" className="todo-due" onChange={setDue} />
          <div className="todo-tags">
            <TagInput tags={tags} suggestions={allTags} onChange={setTags} />
          </div>
          <button type="submit" className="todo-add" disabled={!title.trim()}>
            Ajouter
          </button>
        </div>
      </form>
      <label className="todo-show-done">
        <input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} /> Afficher les tâches faites
      </label>
      {groups.length === 0 && <p className="todo-empty">Aucune tâche.</p>}
      {groups.map((g) => (
        <section key={g.category ?? ""} className="todo-group">
          {g.category && <h2>{g.category}</h2>}
          {g.items.map((t) => (
            <div key={t.line} className={t.done ? "todo-item done" : "todo-item"}>
              <input type="checkbox" checked={t.done} onChange={(e) => void save(toggleTodo(text, t.line, e.target.checked))} />
              <span className="todo-item-title">{t.title}</span>
              {t.tags.map((tag) => (
                <span key={tag} className="todo-tag">
                  #{tag}
                </span>
              ))}
              {t.due && <span className={!t.done && t.due < today ? "todo-date late" : t.due === today ? "todo-date today" : "todo-date"}>{formatDateValue(t.due)}</span>}
              <button type="button" className="todo-remove" title="Supprimer" onClick={() => void save(removeTodo(text, t.line))}>
                <Icon name="close" size={13} />
              </button>
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}
