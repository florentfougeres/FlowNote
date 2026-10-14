const SHORTCUTS: [string, string][] = [
  ["⌘P / ⌘K", "Rechercher une page"],
  ["⌘N", "Nouvelle page"],
  ["⌘[ / ⌘]", "Page précédente / suivante"],
  ["⌘T / ⌘W", "Nouvel onglet / fermer l'onglet"],
  ["⌘⇧[ / ⌘⇧]", "Onglet précédent / suivant"],
  ["⌘1 … ⌘9", "Aller à l'onglet (⌘9 : le dernier)"],
  ["⌘-clic", "Ouvrir dans un nouvel onglet"],
  ["⌘⇧G", "Panneau Git"],
  ["⌘F / ⌘⌥F", "Rechercher / remplacer dans la note"],
  ["⌘⇧F", "Rechercher dans tout le vault"],
  ["⌘⇧E", "Mode Markdown brut"],
  ["⌘S", "Enregistrer maintenant"],
  ["⌘/", "Cette aide"],
  ["/", "Menu des blocs"],
  ["[[", "Lier une note"],
  ["⌘B / ⌘I / ⌘E", "Gras / italique / code"],
  ["⌘⇧S / ⌘⇧H", "Barré / surligné"],
  ["⌘⌥1…3 / ⌘⌥0", "Titre 1 à 3 / texte"],
  ["Tab / ⇧Tab", "Indenter / désindenter une liste"],
  ["⌘↵", "Cocher une tâche, sortir d'un bloc de code"],
  ["⌘⇧↑ / ⌘⇧↓", "Déplacer le bloc"],
  ["⌘D", "Dupliquer le bloc"],
  ["⇧↵", "Retour à la ligne dans un bloc"],
  ["⌘Z / ⌘⇧Z", "Annuler / rétablir"],
];

export function ShortcutsHelp({ onClose }: { onClose: () => void }) {
  return (
    <div className="modal-backdrop" onMouseDown={onClose} onKeyDown={(e) => e.key === "Escape" && onClose()}>
      <div className="modal shortcuts" onMouseDown={(e) => e.stopPropagation()}>
        <header className="modal-header">
          <strong>Raccourcis clavier</strong>
          <button autoFocus onClick={onClose} aria-label="Fermer">
            ✕
          </button>
        </header>
        <table>
          <tbody>
            {SHORTCUTS.map(([keys, label]) => (
              <tr key={keys}>
                <td>
                  <kbd>{keys}</kbd>
                </td>
                <td>{label}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
