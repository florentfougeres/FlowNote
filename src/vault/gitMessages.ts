/** Plain-French wording of Git states, results and common errors for the Git panel. */

const commits = (n: number) => `${n} commit${n > 1 ? "s" : ""}`;

/** "À jour avec origin/main", "2 commits à envoyer · 1 à récupérer"… */
export function syncSummary(upstream: string | null | undefined, ahead: number, behind: number): string {
  if (!upstream) return "Pas encore de branche distante : le premier Push la créera.";
  if (ahead === 0 && behind === 0) return `À jour avec ${upstream}`;
  const parts: string[] = [];
  if (ahead > 0) parts.push(`${commits(ahead)} à envoyer`);
  if (behind > 0) parts.push(`${commits(behind)} à récupérer`);
  return parts.join(" · ");
}

export function pushResult(ahead: number, upstream: string | null | undefined): string {
  if (!upstream) return "Branche envoyée : elle existe maintenant sur le dépôt distant.";
  return ahead > 0 ? `${commits(ahead)} envoyé${ahead > 1 ? "s" : ""} vers ${upstream}.` : `Rien à envoyer : tout est déjà sur ${upstream}.`;
}

export function pullResult(behind: number, upstream: string | null | undefined): string {
  return behind > 0 ? `${commits(behind)} récupéré${behind > 1 ? "s" : ""}${upstream ? ` depuis ${upstream}` : ""}.` : "Déjà à jour : rien de nouveau sur le dépôt distant.";
}

export function fetchResult(behind: number, upstream: string | null | undefined): string {
  if (!upstream) return "Vérifié. Cette branche n'a pas encore de branche distante.";
  return behind > 0 ? `${commits(behind)} disponible${behind > 1 ? "s" : ""} sur ${upstream} : faites un Pull pour ${behind > 1 ? "les" : "le"} récupérer.` : `Vérifié : rien de nouveau sur ${upstream}.`;
}

/** A short explanation of a Git error; the raw output is shown separately. */
export function explainGitError(raw: string): string {
  const text = raw.toLowerCase();
  if (/rejected|non-fast-forward|fetch first|tip of your current branch is behind/.test(text))
    return "Le dépôt distant contient des modifications que vous n'avez pas encore : faites d'abord un Pull, puis renvoyez.";
  if (/authentication failed|could not read username|permission denied|publickey|403|access denied|invalid credentials/.test(text))
    return "Accès refusé par le dépôt distant : vérifiez vos identifiants Git (clé SSH ou jeton d'accès).";
  if (/could not resolve host|unable to access|network is unreachable|connection timed out|failed to connect|operation timed out/.test(text))
    return "Impossible de joindre le dépôt distant : vérifiez votre connexion internet.";
  if (/no configured push destination|does not appear to be a git repository|no such remote|'origin' does not appear/.test(text))
    return "Aucun dépôt distant n'est configuré pour ce vault (remote « origin »).";
  if (/nothing to commit|no changes added to commit/.test(text)) return "Rien à commiter : indexez d'abord des fichiers.";
  if (/please tell me who you are|user\.email|user\.name/.test(text))
    return "Git ne connaît pas encore votre nom et votre e-mail : configurez user.name et user.email.";
  if (/local changes .* would be overwritten|commit your changes or stash them/.test(text))
    return "Des modifications locales non commitées bloquent l'opération : commitez-les d'abord.";
  return "L'opération Git a échoué.";
}
