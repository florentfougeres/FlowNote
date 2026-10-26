import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { createRoot } from "react-dom/client";
import { Icon, type IconName } from "../Icon";
import { PopoverMenu, type MenuItem } from "../Sidebar";
import {
  addStep,
  BRANCH_LABELS,
  branchesOf,
  FLOW_DIRECTIONS,
  FLOW_STEP_TYPES,
  parseFlow,
  removeStep,
  serializeFlow,
  setStepType,
  type FlowLink,
  type FlowModel,
  type FlowStep,
  type FlowStepType,
} from "./flowModel";

interface Props {
  source: string;
  /** New text of the code block. */
  onChange: (source: string) => void;
  onEditText: () => void;
  onClose: () => void;
}

const TYPE_ICONS: Record<FlowStepType, IconName> = {
  start: "ellipse",
  end: "ellipse",
  operation: "rectangle",
  condition: "diamond",
  inputoutput: "export",
  subroutine: "blocks",
  parallel: "split",
};
const TYPE_LABELS = Object.fromEntries(FLOW_STEP_TYPES) as Record<FlowStepType, string>;
const DIRECTION_ICONS: Record<string, IconName> = { bottom: "chevronDown", right: "chevronRight", left: "chevronLeft", top: "chevronUp" };

/** A button showing a choice, opening the app's menu of the others (in the page body: the table's styles stay out of it). */
function Picker({ label, icon, items, title }: { label: string; icon?: IconName; items: MenuItem[]; title: string }) {
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  return (
    <>
      <button className="flow-picker" title={title} aria-label={title} onClick={(event) => setAnchor(event.currentTarget.getBoundingClientRect())}>
        {icon && <Icon name={icon} size={13} />}
        <span>{label}</span>
        <Icon name="chevronDown" size={11} />
      </button>
      {anchor && createPortal(<PopoverMenu anchor={anchor} items={items} onClose={() => setAnchor(null)} />, document.body)}
    </>
  );
}

/** How a step is named in the links: its text, with its id when two steps share it. */
function stepName(model: FlowModel, step: FlowStep | undefined, id: string): string {
  if (!step) return `${id} (absente)`;
  const text = step.text.trim();
  if (!text) return step.id;
  return model.steps.some((s) => s !== step && s.text.trim() === text) ? `${text} · ${step.id}` : text;
}

/**
 * Visual editor of a ```flow block: the steps (shape and text) and the
 * arrows between them (from, way out, to, side). flowchart.js lays the
 * diagram out; each change rewrites the block, keeping what it does not show.
 */
function FlowEditor({ source, onChange, onEditText, onClose }: Props) {
  const [model, setModel] = useState(() => parseFlow(source));
  /** Bumped when the block changed elsewhere: the fields start again from it. */
  const [version, setVersion] = useState(0);
  const emitted = useRef(source);
  /** The step to focus once drawn (one just added). */
  const focusId = useRef<string | null>(null);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (source === emitted.current) return;
    emitted.current = source;
    setModel(parseFlow(source));
    setVersion((v) => v + 1);
  }, [source]);

  useEffect(() => {
    if (!focusId.current) return;
    root.current?.querySelector<HTMLInputElement>(`input[data-step="${CSS.escape(focusId.current)}"]`)?.focus();
    focusId.current = null;
  });

  const change = (next: FlowModel) => {
    setModel(next);
    const text = serializeFlow(next);
    emitted.current = text;
    onChange(text);
  };
  const byId = new Map(model.steps.map((s) => [s.id, s]));
  const add = (after?: string) => {
    const last = after ?? model.steps.at(-1)?.id;
    const added = addStep(model, model.steps.length === 0 ? "start" : "operation", last);
    focusId.current = added.id;
    change(added.model);
  };
  const setLink = (index: number, link: FlowLink) => change({ ...model, links: model.links.map((l, i) => (i === index ? link : l)) });
  /** A new arrow from the first step with a free way out, to the step after it. */
  const addLink = () => {
    const from = model.steps.find((s) => {
      const used = model.links.filter((l) => l.from === s.id);
      const branches = branchesOf(s.type);
      return s.type !== "end" && (branches.length ? branches.some((b) => !used.some((l) => l.branch === b)) : used.length === 0);
    }) ?? model.steps[0];
    if (!from) return;
    const to = model.steps[model.steps.indexOf(from) + 1] ?? model.steps[0];
    const used = model.links.filter((l) => l.from === from.id);
    const branch = branchesOf(from.type).find((b) => !used.some((l) => l.branch === b));
    change({ ...model, links: [...model.links, { from: from.id, to: to.id, ...(branch ? { branch } : {}) }] });
  };
  const stepItems = (pick: (id: string) => void): MenuItem[] =>
    model.steps.map((s) => ({ label: stepName(model, s, s.id), icon: TYPE_ICONS[s.type], run: () => pick(s.id) }));

  return (
    <div className="plot-editor flow-editor" key={version} ref={root}>
      <div className="plot-editor-header">
        <strong>Organigramme</strong>
        <button className="plot-editor-close" aria-label="Fermer l'éditeur visuel" title="Fermer" onClick={onClose}>
          <Icon name="close" size={13} />
        </button>
      </div>

      <div className="flow-editor-section">Étapes</div>
      <div className="plot-editor-table-wrap">
        <table className="plot-editor-table flow-editor-table">
          <tbody>
            {model.steps.map((step) => (
              <tr key={step.id}>
                <td className="flow-editor-shape">
                  <Picker
                    title="Forme de l'étape"
                    label={TYPE_LABELS[step.type]}
                    icon={TYPE_ICONS[step.type]}
                    items={FLOW_STEP_TYPES.map(([type, label]) => ({ label, icon: TYPE_ICONS[type], run: () => change(setStepType(model, step.id, type)) }))}
                  />
                </td>
                <td>
                  <input
                    data-step={step.id}
                    defaultValue={step.text}
                    placeholder={TYPE_LABELS[step.type]}
                    aria-label={`Texte de l'étape ${step.id}`}
                    onChange={(e) => change({ ...model, steps: model.steps.map((s) => (s.id === step.id ? { ...s, text: e.target.value.replace(/\n/g, " ") } : s)) })}
                    onKeyDown={(e) => {
                      if (e.key !== "Enter") return;
                      e.preventDefault();
                      add(step.id);
                    }}
                  />
                </td>
                <td className="plot-editor-actions flow-editor-actions">
                  <button className="flow-editor-add" aria-label={`Ajouter une étape après ${step.id}`} title="Ajouter une étape après celle-ci" onClick={() => add(step.id)}>
                    <Icon name="plus" size={12} />
                  </button>
                  <button aria-label={`Supprimer l'étape ${step.id}`} title="Supprimer l'étape et ses flèches" onClick={() => change(removeStep(model, step.id))}>
                    <Icon name="trash" size={12} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {model.links.length > 0 && (
        <>
          <div className="flow-editor-section">Flèches</div>
          <div className="plot-editor-table-wrap">
            <table className="plot-editor-table flow-editor-table">
              <tbody>
                {model.links.map((link, i) => {
                  const from = byId.get(link.from);
                  const branches = branchesOf(from?.type);
                  return (
                    <tr key={i}>
                      <td>
                        <Picker
                          title="Départ"
                          label={stepName(model, from, link.from)}
                          icon={from ? TYPE_ICONS[from.type] : undefined}
                          items={stepItems((id) => {
                            const next = branchesOf(byId.get(id)?.type);
                            const { branch, ...rest } = link;
                            setLink(i, { ...rest, from: id, ...(next.length ? { branch: branch && next.includes(branch) ? branch : next[0] } : {}) });
                          })}
                        />
                      </td>
                      <td className="flow-editor-branch">
                        {branches.length > 0 && (
                          <Picker
                            title="Sortie"
                            label={link.branch ? BRANCH_LABELS[link.branch] : BRANCH_LABELS[branches[0]]}
                            items={branches.map((b) => ({ label: BRANCH_LABELS[b], icon: b === "yes" ? "check" : b === "no" ? "close" : "split", run: () => setLink(i, { ...link, branch: b }) }))}
                          />
                        )}
                      </td>
                      <td className="flow-editor-arrow" aria-hidden="true">
                        →
                      </td>
                      <td>
                        <Picker
                          title="Arrivée"
                          label={stepName(model, byId.get(link.to), link.to)}
                          icon={byId.get(link.to) ? TYPE_ICONS[byId.get(link.to)!.type] : undefined}
                          items={stepItems((id) => setLink(i, { ...link, to: id }))}
                        />
                      </td>
                      <td className="flow-editor-direction">
                        <Picker
                          title="Côté de départ de la flèche"
                          label={link.direction ? FLOW_DIRECTIONS.find(([d]) => d === link.direction)![1] : "Auto"}
                          icon={link.direction ? DIRECTION_ICONS[link.direction] : undefined}
                          items={[
                            {
                              label: "Auto",
                              icon: "arrow",
                              run: () => {
                                const { direction: _direction, ...rest } = link;
                                setLink(i, rest);
                              },
                            },
                            ...FLOW_DIRECTIONS.map(([direction, label]) => ({ label, icon: DIRECTION_ICONS[direction], run: () => setLink(i, { ...link, direction }) })),
                          ]}
                        />
                      </td>
                      <td className="plot-editor-actions">
                        <button aria-label="Supprimer la flèche" title="Supprimer la flèche" onClick={() => change({ ...model, links: model.links.filter((_, j) => j !== i) })}>
                          <Icon name="trash" size={12} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      <div className="plot-editor-footer">
        <button onClick={() => add()}>
          <Icon name="plus" size={12} /> Étape
        </button>
        {model.steps.length > 1 && (
          <button onClick={addLink}>
            <Icon name="plus" size={12} /> Flèche
          </button>
        )}
        <button className="plot-editor-text" onClick={onEditText}>
          <Icon name="code" size={12} /> Modifier le texte
        </button>
      </div>
    </div>
  );
}

/** Mounts the editor in a code block's node view. */
export function mountFlowEditor(dom: HTMLElement, props: Props) {
  const root = createRoot(dom);
  const render = (p: Props) => root.render(<FlowEditor {...p} />);
  render(props);
  return { update: render, unmount: () => queueMicrotask(() => root.unmount()) };
}
