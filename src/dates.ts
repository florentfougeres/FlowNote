/** "2026-10-14": the local day of a date (today by default), as notes and properties write it. */
export function isoDay(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
