import { useEffect, useMemo, useState } from "react";
import { readAllNotes, type Vault } from "../vault/vault";
import { buildGraph, filterGraph, type VaultGraph } from "./graph";
import { GraphView } from "./GraphView";

/** The vault graph in a whole tab, with Obsidian's main filters. */
export function GraphPage({ vault, files, onOpen }: { vault: Vault; files: string[]; onOpen: (path: string, newTab: boolean) => void }) {
  const [graph, setGraph] = useState<VaultGraph | null>(null);
  const [orphans, setOrphans] = useState(true);
  const [missing, setMissing] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void readAllNotes(vault, files).then((notes) => !cancelled && setGraph(buildGraph(notes, files)));
    return () => {
      cancelled = true;
    };
  }, [vault, files]);

  const shown = useMemo(() => graph && filterGraph(graph, (n) => (orphans || n.degree > 0) && (missing || n.kind !== "missing")), [graph, orphans, missing]);
  const notes = shown ? shown.nodes.filter((n) => n.kind !== "missing").length : 0;

  return (
    <div className="graph-page">
      <header className="graph-header">
        <div>
          <h1>Graphe</h1>
          <p className="dash-muted">{shown ? `${notes} note${notes > 1 ? "s" : ""} · ${shown.edges.length} lien${shown.edges.length > 1 ? "s" : ""}` : "Analyse des liens…"}</p>
        </div>
        <div className="graph-filters">
          <label>
            <input type="checkbox" checked={orphans} onChange={(e) => setOrphans(e.target.checked)} /> Notes sans lien
          </label>
          <label>
            <input type="checkbox" checked={missing} onChange={(e) => setMissing(e.target.checked)} /> Notes inexistantes
          </label>
        </div>
      </header>
      {shown && <GraphView graph={shown} onOpen={onOpen} />}
    </div>
  );
}
