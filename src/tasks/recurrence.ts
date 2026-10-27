import { completeRecurringTask, generateRecurringInstances } from "@tasknotes/model/recurrence";
import { setNoteProperty } from "../base/rows";
import type { TaskConfig } from "./config";
import { frontmatterValues, taskTimestamp, type TaskInfo } from "./task";
import { isoDay } from "../dates";

/**
 * Recurring tasks, as TaskNotes keeps them: one note with an RRULE
 * (`recurrence: DTSTART:20261020;FREQ=WEEKLY;BYDAY=MO`), the days done in
 * `complete_instances` (and skipped in `skipped_instances`). Completing an
 * occurrence moves `scheduled` (and `due`, by the same gap) to the next one.
 * The rules are computed by TaskNotes' own model (`@tasknotes/model`), so
 * FlowNote and the plugin see the same occurrences.
 */

const utcDay = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
const utcDate = (day: string) => new Date(`${day}T00:00:00Z`);

/** The days (`YYYY-MM-DD`) of the task's occurrences from `from` to `to`, included. */
export function occurrences(task: TaskInfo, from: string, to: string): string[] {
  if (!task.recurrence) return [];
  try {
    return generateRecurringInstances({ title: task.title, recurrence: task.recurrence, scheduled: task.scheduled ?? undefined, dateCreated: task.created ?? undefined }, utcDate(from), utcDate(to)).map(utcDay);
  } catch {
    return [];
  }
}

const daysBetween = (from: string, to: string) => Math.round((utcDate(to).getTime() - utcDate(from).getTime()) / 86400000);
/** A date value moved by `days`, its time kept. */
const shiftDay = (value: string, days: number) => {
  const d = utcDate(value.slice(0, 10));
  d.setUTCDate(d.getUTCDate() + days);
  return utcDay(d) + value.slice(10);
};

export const isOccurrenceDone = (task: TaskInfo, day: string) => task.completeInstances.includes(day);

const withModified = (text: string, config: TaskConfig, now: Date) => setNoteProperty(text, config.fields.dateModified, taskTimestamp(now));

/**
 * The task with the occurrence of `day` done, or no longer done, as TaskNotes
 * writes it: the day added to `complete_instances` (removed from the skipped
 * ones), `scheduled` and `due` moved to the next occurrence not done, a
 * DTSTART added to the rule (or moved, for a rule following completions).
 */
export function toggleOccurrence(markdown: string, task: TaskInfo, day: string, config: TaskConfig, now = new Date()): string {
  const f = config.fields;
  if (!task.recurrence) return markdown;
  const input = {
    recurrence: task.recurrence,
    recurrenceAnchor: task.recurrenceAnchor,
    scheduled: task.scheduled ?? undefined,
    due: task.due ?? undefined,
    dateCreated: task.created ?? undefined,
    skippedInstances: task.skippedInstances,
  };
  let text = markdown;
  if (!isOccurrenceDone(task, day)) {
    const result = completeRecurringTask({ ...input, completionDate: day, completeInstances: task.completeInstances });
    text = setNoteProperty(text, f.completeInstances, result.completeInstances);
    text = setNoteProperty(text, f.skippedInstances, result.skippedInstances);
    if (result.updatedRecurrence !== task.recurrence) text = setNoteProperty(text, f.recurrence, result.updatedRecurrence);
    if (result.nextScheduled) text = setNoteProperty(text, f.scheduled, result.nextScheduled);
    if (result.nextDue) text = setNoteProperty(text, f.due, result.nextDue);
  } else {
    const completeInstances = task.completeInstances.filter((d) => d !== day);
    text = setNoteProperty(text, f.completeInstances, completeInstances);
    // Not done again: from today on, it is the next occurrence to do (due keeps its gap), as in TaskNotes.
    const scheduled = task.scheduled?.slice(0, 10);
    if (scheduled && day >= isoDay(now) && day < scheduled) {
      text = setNoteProperty(text, f.scheduled, day + (task.scheduled ?? "").slice(10));
      if (task.due) text = setNoteProperty(text, f.due, shiftDay(task.due, daysBetween(scheduled, day)));
    }
  }
  return withModified(text, config, now);
}

/** Sets the rule (null: the task stops recurring), with a DTSTART from the scheduled date (or today), as TaskNotes does. */
export function setRecurrence(markdown: string, rule: string | null, anchor: "scheduled" | "completion", config: TaskConfig, now = new Date()): string {
  const f = config.fields;
  let text = markdown;
  if (rule === null) {
    for (const key of [f.recurrence, f.recurrenceAnchor, f.completeInstances, f.skippedInstances]) text = setNoteProperty(text, key, undefined);
    return withModified(text, config, now);
  }
  const values = frontmatterValues(markdown);
  const scheduled = typeof values[f.scheduled] === "string" ? String(values[f.scheduled]).slice(0, 10) : null;
  const start = (scheduled ?? isoDay(now)).replace(/-/g, "");
  const recurrence = `DTSTART:${start};${rule.replace(/^DTSTART[^;]*;/, "")}`;
  text = setNoteProperty(text, f.recurrence, recurrence);
  // The scheduled date is the first occurrence of the new rule (a Tuesday for "every Monday" would be none).
  const from = scheduled ?? isoDay(now);
  let first: string | undefined;
  try {
    first = generateRecurringInstances({ recurrence }, utcDate(from), utcDate(shiftDay(from, 400))).map(utcDay)[0];
  } catch {
    first = undefined;
  }
  if ((first ?? from) !== scheduled) text = setNoteProperty(text, f.scheduled, first ?? from);
  text = setNoteProperty(text, f.recurrenceAnchor, anchor === "completion" ? "completion" : undefined);
  return withModified(text, config, now);
}

/* ---- Rules in words ---- */

const DAYS: Record<string, string> = { MO: "lundi", TU: "mardi", WE: "mercredi", TH: "jeudi", FR: "vendredi", SA: "samedi", SU: "dimanche" };
const MONTHS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
const ORDINALS: Record<string, string> = { "1": "premier", "2": "deuxième", "3": "troisième", "4": "quatrième", "-1": "dernier" };

/** The parts of a rule: `FREQ=WEEKLY;BYDAY=MO,TH` → { FREQ: "WEEKLY", BYDAY: "MO,TH" } (DTSTART left out). */
export function ruleParts(rule: string): Record<string, string> {
  const parts: Record<string, string> = {};
  for (const part of rule.replace(/^DTSTART[^;]*;?/, "").split(";")) {
    const [k, v] = part.split("=");
    if (k && v !== undefined) parts[k.toUpperCase()] = v;
  }
  return parts;
}

const list = (items: string[]) => (items.length > 1 ? `${items.slice(0, -1).join(", ")} et ${items[items.length - 1]}` : (items[0] ?? ""));
const dayOfMonth = (n: string) => (n === "1" ? "1er" : n);

/** "Tous les lundis et jeudis", "Le 15 de chaque mois", "Tous les 2 jours"… (the rule itself for what it does not say). */
export function recurrenceText(rule: string): string {
  const p = ruleParts(rule);
  const every = Number(p.INTERVAL ?? 1) || 1;
  const days = (p.BYDAY ?? "").split(",").filter(Boolean);
  const byDay = days.map((d) => /^([+-]?\d)?([A-Z]{2})$/.exec(d)).filter((m): m is RegExpExecArray => m !== null);
  let text: string;
  switch (p.FREQ) {
    case "DAILY":
      text = every === 1 ? "Tous les jours" : `Tous les ${every} jours`;
      break;
    case "WEEKLY": {
      const names = byDay.map((m) => DAYS[m[2]]).filter(Boolean);
      if (names.length === 5 && !days.includes("SA") && !days.includes("SU")) text = every === 1 ? "Du lundi au vendredi" : `Du lundi au vendredi, toutes les ${every} semaines`;
      else if (names.length) text = every === 1 ? `Tous les ${list(names.map((n) => `${n}s`))}` : `Le ${list(names)}, toutes les ${every} semaines`;
      else text = every === 1 ? "Toutes les semaines" : `Toutes les ${every} semaines`;
      break;
    }
    case "MONTHLY": {
      const where = p.BYMONTHDAY ? (p.BYMONTHDAY === "-1" ? "Le dernier jour" : `Le ${dayOfMonth(p.BYMONTHDAY)}`) : byDay[0]?.[1] ? `Le ${ORDINALS[byDay[0][1].replace("+", "")] ?? byDay[0][1]} ${DAYS[byDay[0][2]]}` : null;
      const each = every === 1 ? "de chaque mois" : `tous les ${every} mois`;
      text = where ? `${where} ${each}` : every === 1 ? "Tous les mois" : `Tous les ${every} mois`;
      break;
    }
    case "YEARLY": {
      const month = Number(p.BYMONTH);
      text = p.BYMONTHDAY && month ? `Tous les ans le ${dayOfMonth(p.BYMONTHDAY)} ${MONTHS[month - 1]}` : every === 1 ? "Tous les ans" : `Tous les ${every} ans`;
      break;
    }
    default:
      return rule;
  }
  if (p.COUNT) text += `, ${p.COUNT} fois`;
  if (p.UNTIL) text += `, jusqu'au ${p.UNTIL.slice(6, 8)}/${p.UNTIL.slice(4, 6)}/${p.UNTIL.slice(0, 4)}`;
  return text;
}
