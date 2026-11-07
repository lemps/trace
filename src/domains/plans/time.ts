// How the Plan tab dates a document: the time today, else the date and time.

export function shortTime(ms: number, now: number = Date.now()): string {
  const d = new Date(ms);
  const sameDay = new Date(now).toDateString() === d.toDateString();
  return sameDay
    ? d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

/** The full date and time, for a printed page and tooltips. */
export function fullTime(ms: number): string {
  return new Date(ms).toLocaleString(undefined, { dateStyle: "long", timeStyle: "short" });
}
