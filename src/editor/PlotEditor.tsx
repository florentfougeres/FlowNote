import { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { Icon } from "../Icon";
import { applyModel, parsePlot, PLOT_KINDS, toModel, type PlotModel } from "./plotModel";

interface Props {
  source: string;
  /** New text of the code block. */
  onChange: (source: string) => void;
  onEditText: () => void;
  onClose: () => void;
}

/** The model of a source, or the reason the visual editor cannot show it. */
function read(source: string): { model: PlotModel } | { error: string } {
  try {
    const model = toModel(parsePlot(source).spec);
    return model ? { model } : { error: "Ce graphique (heatmap, 3D, séries aux abscisses différentes…) se modifie en texte." };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

const parseValue = (text: string): number | null | undefined => {
  if (text.trim() === "") return null;
  const value = Number(text.replace(",", "."));
  return Number.isFinite(value) ? value : undefined;
};

/**
 * Visual editor of a ```plotly block: kind, titles and a table of values
 * (rows = labels, one column per series). Each change rewrites the block,
 * keeping its format and the settings it does not show.
 */
function PlotEditor({ source, onChange, onEditText, onClose }: Props) {
  const [state, setState] = useState(() => read(source));
  /** Bumped when the block changed elsewhere: the fields start again from it. */
  const [version, setVersion] = useState(0);
  const emitted = useRef(source);

  useEffect(() => {
    if (source === emitted.current) return;
    emitted.current = source;
    setState(read(source));
    setVersion((v) => v + 1);
  }, [source]);

  if ("error" in state) {
    return (
      <div className="plot-editor">
        <div className="plot-editor-header">
          <strong>Éditeur visuel</strong>
          <button className="plot-editor-close" aria-label="Fermer" onClick={onClose}>
            <Icon name="close" size={13} />
          </button>
        </div>
        <p className="plot-editor-message">{state.error}</p>
        <button onClick={onEditText}>Modifier le texte</button>
      </div>
    );
  }

  const { model } = state;
  const change = (next: PlotModel) => {
    setState({ model: next });
    const text = applyModel(emitted.current, next);
    emitted.current = text;
    onChange(text);
  };
  const pie = model.kind === "pie";
  const setValue = (row: number, column: number, value: number | null) =>
    change({ ...model, series: model.series.map((s, j) => (j === column ? { ...s, values: s.values.map((v, i) => (i === row ? value : v)) } : s)) });
  const addRow = () => change({ ...model, labels: [...model.labels, String(model.labels.length + 1)], series: model.series.map((s) => ({ ...s, values: [...s.values, null] })) });
  const removeRow = (row: number) =>
    change({ ...model, labels: model.labels.filter((_, i) => i !== row), series: model.series.map((s) => ({ ...s, values: s.values.filter((_, i) => i !== row) })) });
  const addSeries = () => change({ ...model, series: [...model.series, { name: `Série ${model.series.length + 1}`, values: model.labels.map(() => null) }] });
  const removeSeries = (column: number) => change({ ...model, series: model.series.filter((_, j) => j !== column) });

  return (
    <div className="plot-editor" key={version}>
      <div className="plot-editor-header">
        <div className="segmented" role="radiogroup" aria-label="Type de graphique">
          {PLOT_KINDS.map(([kind, label]) => (
            <button
              key={kind}
              role="radio"
              aria-checked={model.kind === kind}
              className={model.kind === kind ? "selected" : ""}
              // A pie has one series: the first one is kept.
              onClick={() => change({ ...model, kind, series: kind === "pie" ? model.series.slice(0, 1) : model.series })}
            >
              {label}
            </button>
          ))}
        </div>
        <button className="plot-editor-close" aria-label="Fermer l'éditeur visuel" title="Fermer" onClick={onClose}>
          <Icon name="close" size={13} />
        </button>
      </div>

      <div className="plot-editor-fields">
        <label>
          Titre
          <input defaultValue={model.title} placeholder="Sans titre" onChange={(e) => change({ ...model, title: e.target.value })} />
        </label>
        {!pie && (
          <>
            <label>
              Axe horizontal
              <input defaultValue={model.xTitle} placeholder="—" onChange={(e) => change({ ...model, xTitle: e.target.value })} />
            </label>
            <label>
              Axe vertical
              <input defaultValue={model.yTitle} placeholder="—" onChange={(e) => change({ ...model, yTitle: e.target.value })} />
            </label>
          </>
        )}
      </div>

      <div className="plot-editor-table-wrap">
        <table className="plot-editor-table">
          <thead>
            <tr>
              <th>{pie ? "Part" : "Abscisse"}</th>
              {model.series.map((s, j) => (
                <th key={j}>
                  <div className="plot-editor-series">
                    <input
                      defaultValue={s.name}
                      placeholder={pie ? "Valeur" : `Série ${j + 1}`}
                      aria-label={`Nom de la série ${j + 1}`}
                      onChange={(e) => change({ ...model, series: model.series.map((t, k) => (k === j ? { ...t, name: e.target.value } : t)) })}
                    />
                    {model.series.length > 1 && (
                      <button aria-label={`Supprimer la série ${j + 1}`} title="Supprimer la série" onClick={() => removeSeries(j)}>
                        <Icon name="trash" size={12} />
                      </button>
                    )}
                  </div>
                </th>
              ))}
              <th className="plot-editor-actions" />
            </tr>
          </thead>
          <tbody>
            {model.labels.map((label, i) => (
              <tr key={i}>
                <td>
                  <input
                    defaultValue={label}
                    aria-label={`Étiquette de la ligne ${i + 1}`}
                    onChange={(e) => change({ ...model, labels: model.labels.map((l, k) => (k === i ? e.target.value : l)) })}
                  />
                </td>
                {model.series.map((s, j) => (
                  <td key={j}>
                    <input
                      className="plot-editor-number"
                      inputMode="decimal"
                      defaultValue={s.values[i] ?? ""}
                      aria-label={`Valeur ${i + 1} de la série ${j + 1}`}
                      onChange={(e) => {
                        const value = parseValue(e.target.value);
                        if (value !== undefined) setValue(i, j, value);
                      }}
                    />
                  </td>
                ))}
                <td className="plot-editor-actions">
                  {model.labels.length > 1 && (
                    <button aria-label={`Supprimer la ligne ${i + 1}`} title="Supprimer la ligne" onClick={() => removeRow(i)}>
                      <Icon name="trash" size={12} />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="plot-editor-footer">
        <button onClick={addRow}>
          <Icon name="plus" size={12} /> Ligne
        </button>
        {!pie && (
          <button onClick={addSeries}>
            <Icon name="plus" size={12} /> Série
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
export function mountPlotEditor(dom: HTMLElement, props: Props) {
  const root = createRoot(dom);
  const render = (p: Props) => root.render(<PlotEditor {...p} />);
  render(props);
  return { update: render, unmount: () => queueMicrotask(() => root.unmount()) };
}
