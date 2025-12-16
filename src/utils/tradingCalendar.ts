// src/utils/tradingCalendar.ts

// Simple type describing a period definition
export type PeriodDef = {
  period: string;      // e.g. "P1"
  startWeek: number;   // inclusive, 1-based
  endWeek: number;     // inclusive, 1-based
};

/**
 * Helper to parse "W1", "W25" etc. into numeric week.
 */
export function parseWeekNumFromLabel(weekLabel: string | number | undefined): number {
  const num = parseInt(String(weekLabel ?? "").replace(/[^\d]/g, ""), 10);
  return Number.isNaN(num) ? 0 : num;
}

/**
 * Year-specific period definitions.
 * 
 * You can tweak these freely per year.
 * 2025 is your current 4-4-5 pattern:
 *  P1 W1–4, P2 W5–8, P3 W9–13, ..., P12 W48–52
 * 
 * 2026 is an example: same pattern but P12 gets the extra W53.
 * If you later want a different split, just change the numbers here.
 */
export const TRADING_CALENDARS: Record<number, PeriodDef[]> = {
  2025: [
    { period: "P1",  startWeek:  1, endWeek:  4 },
    { period: "P2",  startWeek:  5, endWeek:  8 },
    { period: "P3",  startWeek:  9, endWeek: 13 },
    { period: "P4",  startWeek: 14, endWeek: 17 },
    { period: "P5",  startWeek: 18, endWeek: 21 },
    { period: "P6",  startWeek: 22, endWeek: 26 },
    { period: "P7",  startWeek: 27, endWeek: 30 },
    { period: "P8",  startWeek: 31, endWeek: 34 },
    { period: "P9",  startWeek: 35, endWeek: 39 },
    { period: "P10", startWeek: 40, endWeek: 43 },
    { period: "P11", startWeek: 44, endWeek: 47 },
    { period: "P12", startWeek: 48, endWeek: 52 },
  ],

  // You can adjust this to the *actual* 2026 plan.
  // For now: same as 2025 but P12 = W48–53 (53-week year).
  2026: [
    { period: "P1",  startWeek:  1, endWeek:  4 },
    { period: "P2",  startWeek:  5, endWeek:  8 },
    { period: "P3",  startWeek:  9, endWeek: 13 },
    { period: "P4",  startWeek: 14, endWeek: 17 },
    { period: "P5",  startWeek: 18, endWeek: 21 },
    { period: "P6",  startWeek: 22, endWeek: 26 },
    { period: "P7",  startWeek: 27, endWeek: 30 },
    { period: "P8",  startWeek: 31, endWeek: 34 },
    { period: "P9",  startWeek: 35, endWeek: 39 },
    { period: "P10", startWeek: 40, endWeek: 43 },
    { period: "P11", startWeek: 44, endWeek: 47 },
    { period: "P12", startWeek: 48, endWeek: 53 }, // 6-week period
  ],
};

/**
 * Get the calendar for a given trading year.
 * Falls back to 2025 if the year isn't configured yet.
 */
export function getCalendarForYear(year: number): PeriodDef[] {
  return TRADING_CALENDARS[year] ?? TRADING_CALENDARS[2025];
}

/**
 * Map a week label ("W25") + year to a period label ("P5", "P12", etc.)
 */
export function getPeriodForWeek(weekLabel: string | number, year: number): string {
  const weekNum = parseWeekNumFromLabel(weekLabel);
  if (!weekNum) return "P?";

  const calendar = getCalendarForYear(year);
  const match = calendar.find(
    (p) => weekNum >= p.startWeek && weekNum <= p.endWeek
  );

  return match?.period ?? "P?";
}

/**
 * Period → Quarter. (P1–3=Q1, 4–6=Q2, 7–9=Q3, 10–12=Q4)
 */
export function getQuarterForPeriod(periodLabel: string): string {
  const n = parseInt(String(periodLabel).replace(/[^\d]/g, ""), 10);
  if (!n || Number.isNaN(n)) return "Q?";
  const q = Math.floor((n - 1) / 3) + 1;
  return `Q${q}`;
}
