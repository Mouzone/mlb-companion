/**
 * The "game day" rolls over at 6 AM local time, not midnight. MLB late games
 * routinely run past midnight (West Coast games starting at 10 PM ET can finish
 * after 1 AM), so a calendar-midnight boundary would drop in-progress games
 * from the slate and discard their live-plays cache. By anchoring on a morning
 * cutoff, the previous day's slate persists through the night until all games
 * are final and the next day's slate is meaningfully populated.
 */
const GAME_DAY_ROLLOVER_HOUR = 6;

export function gameDateStr(now: Date = new Date()): string {
  const adjusted = new Date(now);
  adjusted.setHours(adjusted.getHours() - GAME_DAY_ROLLOVER_HOUR);
  return `${adjusted.getFullYear()}-${String(adjusted.getMonth() + 1).padStart(2, '0')}-${String(adjusted.getDate()).padStart(2, '0')}`;
}
