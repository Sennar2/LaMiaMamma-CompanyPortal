// src/utils/tradingCalendar.ts

/**
 * Trading calendar utilities.
 *
 * - Year-aware period/quarter mapping
 * - Supports 52-week and 53-week years
 *
 * 2025:
 *  P1  : W1–4
 *  P2  : W5–8
 *  P3  : W9–13
 *  P4  : W14–17
 *  P5  : W18–21
 *  P6  : W22–26
 *  P7  : W27–30
 *  P8  : W31–34
 *  P9  : W35–39
 *  P10 : W40–43
 *  P11 : W44–47
 *  P12 : W48–52
 *
 * 2026:
 *  Same pattern, but P12 gets W48–53 (53-week year).
 */

type PeriodRange = {
  period: string;   // "P1".."P12"
  quarter: string;  // "Q1".."Q4"
  start: number;    // week number (1-based)
  end: number;      // week number (inclusive)
};

const YEAR_PERIOD_DEFS: Record<number, PeriodRange[]> = {
  2025: [
    { period: 'P1',  quarter: 'Q1', start: 1,  end: 4 },
    { period: 'P2',  quarter: 'Q1', start: 5,  end: 8 },
    { period: 'P3',  quarter: 'Q1', start: 9,  end: 13 },

    { period: 'P4',  quarter: 'Q2', start: 14, end: 17 },
    { period: 'P5',  quarter: 'Q2', start: 18, end: 21 },
    { period: 'P6',  quarter: 'Q2', start: 22, end: 26 },

    { period: 'P7',  quarter: 'Q3', start: 27, end: 30 },
    { period: 'P8',  quarter: 'Q3', start: 31, end: 34 },
    { period: 'P9',  quarter: 'Q3', start: 35, end: 39 },

    { period: 'P10', quarter: 'Q4', start: 40, end: 43 },
    { period: 'P11', quarter: 'Q4', start: 44, end: 47 },
    { period: 'P12', quarter: 'Q4', start: 48, end: 52 },
  ],

  2026: [
    { period: 'P1',  quarter: 'Q1', start: 1,  end: 4 },
    { period: 'P2',  quarter: 'Q1', start: 5,  end: 8 },
    { period: 'P3',  quarter: 'Q1', start: 9,  end: 13 },

    { period: 'P4',  quarter: 'Q2', start: 14, end: 17 },
    { period: 'P5',  quarter: 'Q2', start: 18, end: 21 },
    { period: 'P6',  quarter: 'Q2', start: 22, end: 26 },

    { period: 'P7',  quarter: 'Q3', start: 27, end: 30 },
    { period: 'P8',  quarter: 'Q3', start: 31, end: 34 },
    { period: 'P9',  quarter: 'Q3', start: 35, end: 39 },

    { period: 'P10', quarter: 'Q4', start: 40, end: 43 },
    { period: 'P11', quarter: 'Q4', start: 44, end: 47 },
    // 53-week year: put W53 into P12
    { period: 'P12', quarter: 'Q4', start: 48, end: 53 },
  ],
};

/**
 * Fallback definition used if a year isn’t explicitly listed.
 * Mirrors the 2025 52-week structure.
 */
const DEFAULT_PERIOD_DEFS: PeriodRange[] = YEAR_PERIOD_DEFS[2025];

/**
 * Normalise a "Wxx" label into a week number (e.g. "W25" -> 25).
 */
function parseWeekLabel(weekLabel: string): number {
  const num = parseInt(weekLabel.replace(/[^\d]/g, ''), 10);
  return Number.isNaN(num) ? 0 : num;
}

/**
 * Returns the period label (e.g. "P5") for a given week + year.
 * If no match is found, returns "P?".
 */
export function getPeriodForWeek(weekLabel: string, year: number): string {
  const weekNum = parseWeekLabel(weekLabel);
  if (!weekNum) return 'P?';

  const defs = YEAR_PERIOD_DEFS[year] || DEFAULT_PERIOD_DEFS;
  const match = defs.find(
    (d) => weekNum >= d.start && weekNum <= d.end,
  );

  return match ? match.period : 'P?';
}

/**
 * Returns the quarter ("Q1".."Q4") for a given period label.
 * Falls back to "Q?" if it can’t infer the quarter.
 */
export function getQuarterForPeriod(periodLabel: string): string {
  const num = parseInt(periodLabel.replace(/[^\d]/g, ''), 10);
  if (!num) return 'Q?';

  if (num >= 1 && num <= 3) return 'Q1';
  if (num >= 4 && num <= 6) return 'Q2';
  if (num >= 7 && num <= 9) return 'Q3';
  if (num >= 10 && num <= 12) return 'Q4';
  return 'Q?';
}

/**
 * Returns all week labels ("W1".."W53") belonging to a given period in a given year.
 * Example: getWeeksForPeriod("P5", 2025) -> ["W18","W19","W20","W21"]
 */
export function getWeeksForPeriod(
  periodLabel: string,
  year: number,
): string[] {
  const defs = YEAR_PERIOD_DEFS[year] || DEFAULT_PERIOD_DEFS;
  const periodNum = parseInt(periodLabel.replace(/[^\d]/g, ''), 10);
  if (!periodNum) return [];

  const match = defs.find((d) => {
    const pNum = parseInt(d.period.replace(/[^\d]/g, ''), 10);
    return pNum === periodNum;
  });

  if (!match) return [];

  const weeks: string[] = [];
  for (let w = match.start; w <= match.end; w += 1) {
    weeks.push(`W${w}`);
  }
  return weeks;
}
