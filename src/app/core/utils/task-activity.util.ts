/**
 * Formatting helpers for "when was this task last touched".
 *
 * The Tasks and Today boards both stamp their cards with the same relative
 * label, so the wording and the day boundaries live here instead of in either
 * component.
 */

/** Local calendar day of an ISO timestamp — "when did I touch this". */
export function localDayKey(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'unknown';
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

/**
 * "just now" / "12 min ago" / "18:04" (today) / "Yesterday 18:04" /
 * "3 Sep 18:04" — the activity stamp shown on a task card.
 */
export function formatActivityLabel(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const minutes = Math.round((Date.now() - date.getTime()) / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;

  const time = date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  const today = localDayKey(new Date().toISOString());
  if (localDayKey(iso) === today) return time;

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  if (localDayKey(iso) === localDayKey(yesterday.toISOString())) return `Yesterday ${time}`;

  return `${date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} ${time}`;
}
