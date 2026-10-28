import { Icon } from "./Icon";
import { keys } from "./keys";
import { SHORTCUTS } from "./shortcuts";

export function ShortcutsHelp({ onClose }: { onClose: () => void }) {
  return (
    <div className="modal-backdrop" onMouseDown={onClose} onKeyDown={(e) => e.key === "Escape" && onClose()}>
      <div className="modal shortcuts" onMouseDown={(e) => e.stopPropagation()}>
        <header className="modal-header">
          <strong>Raccourcis clavier</strong>
          <button autoFocus onClick={onClose} aria-label="Fermer">
            <Icon name="close" size={14} />
          </button>
        </header>
        <div className="shortcuts-body">
          <table>
            <tbody>
              {SHORTCUTS.map(({ keys: shortcut, label }) => (
                <tr key={shortcut}>
                  <td>{label}</td>
                  <td>
                    <kbd>{keys(shortcut)}</kbd>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
