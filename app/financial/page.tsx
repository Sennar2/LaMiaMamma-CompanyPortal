'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { CSVLink } from 'react-csv';
import { supabase } from '../../src/lib/supabaseClient';

// Financial UI components
import InsightsBar from '../../src/components/financial/InsightsBar';
import ComplianceBar from '../../src/components/financial/ComplianceBar';
import KPIBlock from '../../src/components/financial/KPIBlock';
import RankingTable from '../../src/components/financial/RankingTable';
import ChartSection from '../../src/components/financial/ChartSection';

// Year-aware trading calendar helpers
import {
  getPeriodForWeek,
  getQuarterForPeriod,
  getWeeksForPeriod,
} from '../../src/utils/tradingCalendar';

// ─────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────

const API_KEY =
  process.env.NEXT_PUBLIC_GOOGLE_API_KEY ||
  'AIzaSyB_dkFpvk6w_d9dPD_mWVhfB8-lly-9FS8';

// One sheet per year (add more as needed)
const YEAR_SHEETS: Record<string, string> = {
  // 2025 – existing sheet
  '2025':
    process.env.NEXT_PUBLIC_SHEET_ID_2025 ||
    '1PPVSEcZ6qLOEK2Z0uRLgXCnS_maazWFO_yMY648Oq1g',

  // 2026 – new sheet
  '2026':
    process.env.NEXT_PUBLIC_SHEET_ID_2026 ||
    '1VRla3bQRJENs5meWdWd2i5UH94FMpPoKLYrMNZCVm9M',
};

const AVAILABLE_YEARS = Object.keys(YEAR_SHEETS).sort();

const DEFAULT_YEAR = (() => {
  const thisYear = String(new Date().getFullYear());
  return YEAR_SHEETS[thisYear] ? thisYear : AVAILABLE_YEARS[0];
})();

function getSheetIdForYear(year: string) {
  return YEAR_SHEETS[year] || YEAR_SHEETS[DEFAULT_YEAR];
}

const BRAND_GROUPS: Record<string, string[]> = {
  'La Mia Mamma (Brand)': [
    'La Mia Mamma - Chelsea',
    'La Mia Mamma - Hollywood Road',
    'La Mia Mamma - Notting Hill',
    'La Mia Mamma - Battersea',
  ],
  'Fish and Bubbles (Brand)': [
    'Fish and Bubbles - Fulham',
    'Fish and Bubbles - Notting Hill',
  ],
  'Made in Italy (Brand)': [
    'Made in Italy - Chelsea',
    'Made in Italy - Battersea',
  ],
};

const STORE_LOCATIONS = [
  'La Mia Mamma - Chelsea',
  'La Mia Mamma - Hollywood Road',
  'La Mia Mamma - Notting Hill',
  'La Mia Mamma - Battersea',
  'Fish and Bubbles - Fulham',
  'Fish and Bubbles - Notting Hill',
  'Made in Italy - Chelsea',
  'Made in Italy - Battersea',
];

const PERIODS = ['Week', 'Period', 'Quarter'];
const TABS = ['Sales', 'Payroll', 'Food', 'Drink'] as const;

// Targets
const PAYROLL_TARGET = 35; // %
const FOOD_TARGET = 12.5; // %
const DRINK_TARGET = 5.5; // %

// ─────────────────────────────────────────────────────────────
// Small helpers
// ─────────────────────────────────────────────────────────────

function parseWeekNum(weekStr: string | number | undefined) {
  const num = parseInt(String(weekStr ?? '').replace(/[^\d]/g, ''), 10);
  return Number.isNaN(num) ? 0 : num;
}

function getISOWeek(date = new Date()) {
  const d = new Date(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()),
  );
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(
    ((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7,
  );

  // allow up to 53 for 53-week years
  return Math.min(53, weekNo);
}

function getCurrentWeekLabel() {
  return `W${getISOWeek()}`;
}

function rowHasData(r: any) {
  return Boolean(
    (r?.Sales_Actual && r.Sales_Actual !== 0) ||
      (r?.Payroll_Actual && r.Payroll_Actual !== 0) ||
      (r?.Sales_Budget && r.Sales_Budget !== 0),
  );
}

// Google Sheets: parse values
function parseSheetValues(values: any[][] | undefined): any[] {
  if (!values || values.length < 2) return [];
  const [headers, ...rows] = values;
  return rows.map((row) =>
    headers.reduce((obj: Record<string, any>, key: string, idx: number) => {
      let value = row[idx];
      if (key === 'LocationBreakdown' && typeof value === 'string') {
        try {
          value = JSON.parse(value);
        } catch {
          value = {};
        }
      } else if (!isNaN(value)) {
        value = Number(value);
      }
      obj[key] = value;
      return obj;
    }, {}),
  );
}

// fetch one tab for a given year
async function fetchTab(tabName: string, year: string) {
  const sheetId = getSheetIdForYear(year);
  const range = `${tabName}!A1:Z100`;
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(
    range,
  )}?key=${API_KEY}`;

  const res = await fetch(url);
  if (!res.ok)
    throw new Error(`HTTP ${res.status} loading "${tabName}" for year ${year}`);
  const json = await res.json();
  return parseSheetValues(json.values);
}

// Merge multiple site rows by Week, summing numeric columns
function rollupByWeek(rowsArray: any[]) {
  if (!rowsArray.length) return [];
  const grouped: Record<string, any[]> = {};

  for (const row of rowsArray) {
    const w = String(row.Week || '').trim();
    if (!grouped[w]) grouped[w] = [];
    grouped[w].push(row);
  }

  const numericKeys = Object.keys(rowsArray[0]).filter(
    (k) => typeof rowsArray[0][k] === 'number',
  );

  const merged = Object.entries(grouped).map(([weekLabel, rows]) => {
    const totals: Record<string, number> = {};
    numericKeys.forEach((col) => {
      totals[col] = rows.reduce((sum, r) => sum + (r[col] || 0), 0);
    });
    return { Week: weekLabel, ...totals };
  });

  merged.sort((a: any, b: any) => parseWeekNum(a.Week) - parseWeekNum(b.Week));
  return merged;
}

/**
 * computeInsightsBundle
 * - Uses "last completed week" snapshot: current ISO week - 1
 * - If exact row missing, falls back to latest <= snapshot with data
 * - 4-week avg for Payroll_v% includes +/- correctly
 */
function computeInsightsBundle(rows: any[]) {
  if (!rows || rows.length === 0) return null;

  const decorated = rows.map((r: any) => ({
    ...r,
    __weekNum: parseWeekNum(r.Week),
  }));

  const currentWeekNum = getISOWeek();
  const snapshotWeekNum =
    currentWeekNum - 1 <= 0 ? currentWeekNum : currentWeekNum - 1;

  let latest = decorated.find(
    (r) => r.__weekNum === snapshotWeekNum && rowHasData(r),
  );
  if (!latest) {
    const candidates = decorated
      .filter((r) => r.__weekNum <= snapshotWeekNum && rowHasData(r))
      .sort((a, b) => a.__weekNum - b.__weekNum);
    latest = candidates[candidates.length - 1];
  }
  if (!latest) {
    const cands = decorated
      .filter(rowHasData)
      .sort((a, b) => a.__weekNum - b.__weekNum);
    latest = cands[cands.length - 1];
  }
  if (!latest) return null;

  const wkNum = latest.__weekNum;
  const wkLabel = latest.Week || `W${wkNum}`;

  // last-4-weeks window
  const windowWeeks = [wkNum, wkNum - 1, wkNum - 2, wkNum - 3].filter(
    (n) => n > 0,
  );
  const last4Rows = decorated.filter((r) => windowWeeks.includes(r.__weekNum));

  const parsePayrollVar = (val: any): number => {
    if (val === undefined || val === null) return 0;
    const cleaned = String(val).replace('%', '').trim();
    const num = parseFloat(cleaned);
    return Number.isNaN(num) ? 0 : num;
  };
  const payrollTrendVals = last4Rows.map((row) =>
    parsePayrollVar(row['Payroll_v%']),
  );
  const avgPayrollVar4w =
    payrollTrendVals.length > 0
      ? payrollTrendVals.reduce((s, n) => s + n, 0) / payrollTrendVals.length
      : 0;

  const salesActual = latest.Sales_Actual || 0;
  const salesBudget = latest.Sales_Budget || 0;
  const salesLastYear = latest.Sales_LastYear || 0;

  const salesVar = salesActual - salesBudget;
  const salesVarPct = salesBudget !== 0 ? (salesVar / salesBudget) * 100 : 0;

  const payrollPct =
    salesActual !== 0 ? (latest.Payroll_Actual / salesActual) * 100 : 0;
  const foodPct =
    salesActual !== 0 ? (latest.Food_Actual / salesActual) * 100 : 0;
  const drinkPct =
    salesActual !== 0 ? (latest.Drink_Actual / salesActual) * 100 : 0;

  const salesVsLastYearPct =
    salesLastYear !== 0
      ? ((salesActual - salesLastYear) / salesLastYear) * 100
      : 0;

  return {
    wkLabel,
    salesActual,
    salesBudget,
    salesVar,
    salesVarPct,
    payrollPct,
    foodPct,
    drinkPct,
    salesVsLastYearPct,
    avgPayrollVar4w,
    currentWeekLabel: getCurrentWeekLabel(),
  };
}

// ─────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────

export default function FinancialPage() {
  // 1) Auth / profile
  const [session, setSession] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => {
    let sub: any;
    (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      setSession(session);

      const { data: listener } = supabase.auth.onAuthStateChange(
        (_ev, newSession) => {
          setSession(newSession);
        },
      );
      sub = listener;
    })();

    return () => {
      if (sub) sub.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    (async () => {
      if (!session) {
        setAuthLoading(false);
        return;
      }
      setAuthLoading(true);
      const { data, error } = await supabase
        .from('profiles')
        .select('full_name, role, home_location')
        .eq('id', session.user.id)
        .single();

      if (error) {
        setProfile(null);
      } else {
        setProfile(data);
      }
      setAuthLoading(false);
    })();
  }, [session]);

  // 2) Permission
  const role = (profile?.role || '').toLowerCase();
  const canView = ['admin', 'operation', 'ops', 'manager', 'user'].includes(
    role,
  );

  // 3) Locations the user can view
  const [allowedLocations, setAllowedLocations] = useState<string[]>([]);
  useEffect(() => {
    if (!profile) return;
    if (['admin', 'operation', 'ops'].includes(role)) {
      setAllowedLocations([
        'GroupOverview',
        'La Mia Mamma (Brand)',
        'Fish and Bubbles (Brand)',
        'Made in Italy (Brand)',
        ...STORE_LOCATIONS,
      ]);
    } else if (['manager', 'user'].includes(role) && profile.home_location) {
      setAllowedLocations([profile.home_location]);
    } else {
      setAllowedLocations([]);
    }
  }, [profile, role]);

  // 4) UI state
  const [location, setLocation] = useState<string>('');
  const [period, setPeriod] = useState<string>('Week');
  const [activeTab, setActiveTab] = useState<(typeof TABS)[number]>('Sales');
  const [year, setYear] = useState<string>(DEFAULT_YEAR);

  useEffect(() => {
    if (!location && allowedLocations.length) {
      setLocation(allowedLocations[0]);
    }
  }, [allowedLocations, location]);

  // 5) Load data for selected location/year
  const [rawRows, setRawRows] = useState<any[]>([]);
  const [loadingData, setLoadingData] = useState(false);
  const [fetchError, setFetchError] = useState('');

  useEffect(() => {
    (async () => {
      if (!location) return;
      try {
        setLoadingData(true);
        setFetchError('');

        const isBrand = Boolean(BRAND_GROUPS[location]);
        let rows: any[] = [];

        if (isBrand) {
          const all = await Promise.all(
            BRAND_GROUPS[location].map((site) => fetchTab(site, year)),
          );
          rows = rollupByWeek(all.flat());
        } else {
          rows = await fetchTab(location, year);
          rows.sort((a, b) => parseWeekNum(a.Week) - parseWeekNum(b.Week));
        }

        setRawRows(rows);
      } catch (err: any) {
        setRawRows([]);
        setFetchError(err?.message || 'Failed to load data');
      } finally {
        setLoadingData(false);
      }
    })();
  }, [location, year]);

  // 6) Merge Week → Period/Quarter using the year-specific trading calendar
  const mergedRows = useMemo(() => {
    if (!rawRows.length) return [];

    const yearNum = Number(year) || new Date().getFullYear();

    return rawRows.map((item) => {
      const weekLabel = String(item.Week || '').trim();
      const periodLabel = getPeriodForWeek(weekLabel, yearNum);
      const quarterLabel = getQuarterForPeriod(periodLabel);

      return {
        ...item,
        Period: periodLabel,
        Quarter: quarterLabel,
      };
    });
  }, [rawRows, year]);

  // 7) Group by Period/Quarter if needed
function groupMergedRowsBy(bucketKey: "Period" | "Quarter"): any[] {
  if (!mergedRows.length) return [];

  const toNum = (v: any) => {
    if (v == null) return 0;
    if (typeof v === "number") return v;
    // handle "277,621" or "£277,621"
    const cleaned = String(v).replace(/[£,]/g, "").trim();
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : 0;
  };

  // group rows by Period or Quarter label
  const grouped = mergedRows.reduce<Record<string, any[]>>((acc, row) => {
    const key = row[bucketKey];
    if (!key || key === "P?" || key === "Q?") return acc; // ignore unknown
    if (!acc[key]) acc[key] = [];
    acc[key].push(row);
    return acc;
  }, {});

  // choose numeric keys by “looks like a metric field”, not typeof number
  // (because some sheet values might be strings)
  const metricKeys = Object.keys(mergedRows[0]).filter((k) =>
    /(Sales_|Payroll_|Food_|Drink_)/.test(k)
  );

  const result = Object.entries(grouped).map(([label, rows]) => {
    const sums: Record<string, number> = {};

    metricKeys.forEach((col) => {
      sums[col] = (rows as any[]).reduce((total, r) => total + toNum(r[col]), 0);
    });

    return {
      // ✅ IMPORTANT: give ALL label fields so charts can use them
      Week: label,            // keep old behaviour
      Period: bucketKey === "Period" ? label : undefined,
      Quarter: bucketKey === "Quarter" ? label : undefined,
      ...sums,
    };
  });

  // sort P1..P13 or Q1..Q4
  result.sort((a: any, b: any) => {
    const na = parseInt(String(a.Week).replace(/[^\d]/g, ""), 10) || 0;
    const nb = parseInt(String(b.Week).replace(/[^\d]/g, ""), 10) || 0;
    return na - nb;
  });

  return result;
}

  

  // 8) Insights + Compliance snapshot (based on last completed week)
  const insights = useMemo(
    () => computeInsightsBundle(mergedRows),
    [mergedRows],
  );
  const currentWeekNow = getCurrentWeekLabel();

  // ─────────────────────────────────────────────────────────────
  // 9) Ranking (admins / ops only) — week + period, multi-year, % + £
  // ─────────────────────────────────────────────────────────────

  const [rankingSource, setRankingSource] = useState<
    { loc: string; rows: any[] }[]
  >([]);

  const [rankingWeekData, setRankingWeekData] = useState<any[]>([]);
  const [rankingPeriodData, setRankingPeriodData] = useState<any[]>([]);
  const [rankingView, setRankingView] = useState<'week' | 'period'>('week');

  const [rankingWeekOptions, setRankingWeekOptions] = useState<string[]>([]);
  const [selectedRankingWeek, setSelectedRankingWeek] = useState<string>('');
  const [rankingPeriodOptions, setRankingPeriodOptions] = useState<string[]>(
    [],
  );
  const [selectedRankingPeriod, setSelectedRankingPeriod] =
    useState<string>('');

  const handleRankingWeekChange = (val: string) => {
    setSelectedRankingWeek(val);
  };
  const handleRankingPeriodChange = (val: string) => {
    setSelectedRankingPeriod(val);
  };

  // Load ranking source data when role/year change
  useEffect(() => {
    (async () => {
      if (!['admin', 'operation', 'ops'].includes(role)) {
        setRankingSource([]);
        setRankingWeekOptions([]);
        setRankingPeriodOptions([]);
        setRankingWeekData([]);
        setRankingPeriodData([]);
        return;
      }

      try {
        const currentWeekNum = getISOWeek();
        const snapshotWeekNum =
          currentWeekNum - 1 <= 0 ? currentWeekNum : currentWeekNum - 1;

        const all = await Promise.all(
          STORE_LOCATIONS.map(async (loc) => {
            const rows = await fetchTab(loc, year);
            const decorated = rows
              .map((r: any) => ({
                ...r,
                __weekNum: parseWeekNum(r.Week),
              }))
              .filter((r: any) => r.__weekNum > 0)
              .sort((a: any, b: any) => a.__weekNum - b.__weekNum);
            return { loc, rows: decorated };
          }),
        );

        setRankingSource(all);

        // collect available weeks & periods (year-aware)
        const weekSet = new Set<string>();
        const periodSet = new Set<string>();
        const yearNum = Number(year) || new Date().getFullYear();

        for (const { rows } of all) {
          for (const r of rows) {
            if (!rowHasData(r)) continue;
            const wLabel = String(r.Week || '').trim();
            if (!wLabel) continue;

            weekSet.add(wLabel);

            const periodLabel = getPeriodForWeek(wLabel, yearNum);
            if (periodLabel && periodLabel !== 'P?') {
              periodSet.add(periodLabel);
            }
          }
        }

        const weekOptions = Array.from(weekSet).sort(
          (a, b) => parseWeekNum(a) - parseWeekNum(b),
        );
        setRankingWeekOptions(weekOptions);

        // default week = last <= snapshotWeekNum
        let defaultWeek = '';
        for (const w of weekOptions) {
          const num = parseWeekNum(w);
          if (num <= snapshotWeekNum) defaultWeek = w;
        }
        if (!defaultWeek && weekOptions.length) {
          defaultWeek = weekOptions[weekOptions.length - 1];
        }
        setSelectedRankingWeek((prev) => prev || defaultWeek);

        const periodOptions = Array.from(periodSet).sort((a, b) => {
          const na = parseInt(a.replace(/[^\d]/g, ''), 10) || 0;
          const nb = parseInt(b.replace(/[^\d]/g, ''), 10) || 0;
          return na - nb;
        });
        setRankingPeriodOptions(periodOptions);

        const yearNumForSnap = yearNum;
        const snapshotWeekLabel = `W${snapshotWeekNum}`;
        let defaultPeriod = getPeriodForWeek(snapshotWeekLabel, yearNumForSnap);
        if (defaultPeriod === 'P?') defaultPeriod = '';
        if (defaultPeriod && !periodSet.has(defaultPeriod)) {
          defaultPeriod = '';
        }
        if (!defaultPeriod && periodOptions.length) {
          defaultPeriod = periodOptions[periodOptions.length - 1];
        }
        setSelectedRankingPeriod((prev) => prev || defaultPeriod);
      } catch (err) {
        console.error('Ranking load failed:', err);
        setRankingSource([]);
        setRankingWeekOptions([]);
        setRankingPeriodOptions([]);
        setRankingWeekData([]);
        setRankingPeriodData([]);
      }
    })();
  }, [role, year]);

  // Build week & period ranking datasets from rankingSource + selected filters
  useEffect(() => {
    if (!rankingSource.length) {
      setRankingWeekData([]);
      setRankingPeriodData([]);
      return;
    }

    // ---- WEEK RANKING ----
    if (selectedRankingWeek) {
      const weekRows: any[] = [];

      for (const { loc, rows } of rankingSource) {
        const match = rows.find(
          (r: any) =>
            String(r.Week || '').trim() === selectedRankingWeek &&
            rowHasData(r),
        );
        if (!match) continue;

        const salesActual = match.Sales_Actual || 0; // Column B ✅
        const salesBudget = match.Sales_Budget || 0;
        const payrollActual = match.Payroll_Actual || 0;
        const foodActual = match.Food_Actual || 0;
        const drinkActual = match.Drink_Actual || 0;

        const payrollPct =
          salesActual !== 0 ? (payrollActual / salesActual) * 100 : 0;
        const foodPct =
          salesActual !== 0 ? (foodActual / salesActual) * 100 : 0;
        const drinkPct =
          salesActual !== 0 ? (drinkActual / salesActual) * 100 : 0;

        const salesVar = salesActual - salesBudget;
        const salesVarPct =
          salesBudget !== 0 ? (salesVar / salesBudget) * 100 : 0;

        weekRows.push({
          location: loc,
          week: match.Week,

          // ✅ Include actual/budget so RankingTable can show Sales column
          Sales_Actual: salesActual,
          Sales_Budget: salesBudget,

          payrollPct,
          foodPct,
          drinkPct,
          salesVar,
          salesVarPct,
          payrollValue: payrollActual,
          foodValue: foodActual,
          drinkValue: drinkActual,
        });
      }

      weekRows.sort((a, b) => b.payrollPct - a.payrollPct);
      setRankingWeekData(weekRows);
    } else {
      setRankingWeekData([]);
    }

    // ---- PERIOD RANKING ----
    if (selectedRankingPeriod) {
      const periodRows: any[] = [];
      const yearNum = Number(year) || new Date().getFullYear();

      // Get all weeks belonging to this period for the selected year
      const periodWeeks = getWeeksForPeriod(selectedRankingPeriod, yearNum);

      for (const { loc, rows } of rankingSource) {
        const filtered = rows.filter(
          (r: any) =>
            periodWeeks.includes(String(r.Week || '').trim()) &&
            rowHasData(r),
        );
        if (!filtered.length) continue;

        let salesActualTotal = 0;
        let salesBudgetTotal = 0;
        let payrollActualTotal = 0;
        let foodActualTotal = 0;
        let drinkActualTotal = 0;

        for (const r of filtered) {
          salesActualTotal += r.Sales_Actual || 0; // Column B ✅
          salesBudgetTotal += r.Sales_Budget || 0;
          payrollActualTotal += r.Payroll_Actual || 0;
          foodActualTotal += r.Food_Actual || 0;
          drinkActualTotal += r.Drink_Actual || 0;
        }

        const payrollPct =
          salesActualTotal !== 0
            ? (payrollActualTotal / salesActualTotal) * 100
            : 0;
        const foodPct =
          salesActualTotal !== 0
            ? (foodActualTotal / salesActualTotal) * 100
            : 0;
        const drinkPct =
          salesActualTotal !== 0
            ? (drinkActualTotal / salesActualTotal) * 100
            : 0;

        const salesVar = salesActualTotal - salesBudgetTotal;
        const salesVarPct =
          salesBudgetTotal !== 0 ? (salesVar / salesBudgetTotal) * 100 : 0;

        periodRows.push({
          location: loc,
          week: selectedRankingPeriod,

          // ✅ Include actual/budget so RankingTable can show Sales column
          Sales_Actual: salesActualTotal,
          Sales_Budget: salesBudgetTotal,

          payrollPct,
          foodPct,
          drinkPct,
          salesVar,
          salesVarPct,
          payrollValue: payrollActualTotal,
          foodValue: foodActualTotal,
          drinkValue: drinkActualTotal,
        });
      }

      periodRows.sort((a, b) => b.payrollPct - a.payrollPct);
      setRankingPeriodData(periodRows);
    } else {
      setRankingPeriodData([]);
    }
  }, [rankingSource, selectedRankingWeek, selectedRankingPeriod, year]);

  // 10) Chart config (preserves Theo lines)
  const chartConfig = {
    Sales: [
      { key: 'Sales_Actual', color: '#4ade80', name: 'Actual' },
      { key: 'Sales_Budget', color: '#60a5fa', name: 'Budget' },
      { key: 'Sales_LastYear', color: '#fbbf24', name: 'Last Year' },
    ],
    Payroll: [
      { key: 'Payroll_Actual', color: '#4ade80', name: 'Actual' },
      { key: 'Payroll_Budget', color: '#60a5fa', name: 'Budget' },
      { key: 'Payroll_Theo', color: '#a78bfa', name: 'Theo' },
    ],
    Food: [
      { key: 'Food_Actual', color: '#4ade80', name: 'Actual' },
      { key: 'Food_Budget', color: '#60a5fa', name: 'Budget' },
      { key: 'Food_Theo', color: '#a78bfa', name: 'Theo' },
    ],
    Drink: [
      { key: 'Drink_Actual', color: '#4ade80', name: 'Actual' },
      { key: 'Drink_Budget', color: '#60a5fa', name: 'Budget' },
      { key: 'Drink_Theo', color: '#a78bfa', name: 'Theo' },
    ],
  };

  // ─────────────────────────────────────────────────────────────
  // Guards
  // ─────────────────────────────────────────────────────────────
  if (authLoading) {
    return (
      <main className="max-w-7xl mx-auto px-4 py-10 text-center text-sm text-gray-500">
        Loading profile…
      </main>
    );
  }
  if (!session || !profile) {
    return (
      <main className="max-w-7xl mx-auto px-4 py-10 text-center">
        <div className="inline-block rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          You are not signed in.
        </div>
      </main>
    );
  }
  if (!canView) {
    return (
      <main className="max-w-7xl mx-auto px-4 py-10 text-center">
        <div className="inline-block rounded-lg border border-yellow-200 bg-yellow-50 px-4 py-3 text-sm text-yellow-700">
          You don&apos;t have permission to view Financial Performance.
        </div>
      </main>
    );
  }

  // ─────────────────────────────────────────────────────────────
  // UI
  // ─────────────────────────────────────────────────────────────
  return (
    <main className="max-w-7xl mx-auto px-4 py-8 space-y-8">
      {/* Title */}
      <div className="text-center">
        <h1 className="text-2xl md:text-3xl font-bold text-gray-900">
          Financial Performance {year}
        </h1>
      </div>

      {/* Controls Row (centered, own line) */}
      <div className="flex flex-col md:flex-row items-center justify-center gap-3 md:gap-4">
        {/* Location */}
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-gray-700">Location</label>
          <select
            className="border rounded-md px-3 py-2 text-sm bg-white"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
          >
            {allowedLocations.map((loc) => (
              <option key={loc} value={loc}>
                {loc}
              </option>
            ))}
          </select>
        </div>

        {/* Year */}
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-gray-700">Year</label>
          <select
            className="border rounded-md px-3 py-2 text-sm bg-white"
            value={year}
            onChange={(e) => setYear(e.target.value)}
          >
            {AVAILABLE_YEARS.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>

        {/* Period */}
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-gray-700">Period</label>
          <select
            className="border rounded-md px-3 py-2 text-sm bg-white"
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
          >
            {PERIODS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* HERO INSIGHTS (Current Week + Last Week Results) */}
      <InsightsBar
        insights={insights}
        payrollTarget={PAYROLL_TARGET}
        currentWeekNow={currentWeekNow}
      />

      {/* Compliance */}
      <ComplianceBar
        insights={insights}
        payrollTarget={PAYROLL_TARGET}
        foodTarget={FOOD_TARGET}
        drinkTarget={DRINK_TARGET}
      />

      {/* KPI cards */}
      {loadingData ? (
        <p className="text-center text-sm text-gray-500">Loading data…</p>
      ) : fetchError ? (
        <p className="text-center text-sm text-red-600">
          Could not load data: {fetchError}
        </p>
      ) : (
        <KPIBlock
          data={filteredData}
          payrollTarget={PAYROLL_TARGET}
          foodTarget={FOOD_TARGET}
          drinkTarget={DRINK_TARGET}
        />
      )}

      {/* Tabs */}
      <div className="flex flex-wrap items-center justify-center gap-2 -mt-2">
        {TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-3 py-2 rounded-md text-sm border ${
              activeTab === tab
                ? 'bg-gray-900 text-white shadow'
                : 'bg-white text-gray-900 hover:bg-gray-50'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* CHARTS */}
      {!loadingData && !fetchError && (
<ChartSection
  activeTab={activeTab}
  filteredData={filteredData}
  chartConfig={chartConfig}
  CSVLink={CSVLink}
  periodView={period}   // 👈 ADD THIS
/>
)}
  

      {/* Space before ranking */}
      <div className="h-4 md:h-6" />

      {/* RANKING: last week / last period with pickers */}
      {['admin', 'operation', 'ops'].includes(role) &&
        (rankingWeekData.length > 0 || rankingPeriodData.length > 0) && (
          <RankingTable
            rankingWeekData={rankingWeekData}
            rankingPeriodData={rankingPeriodData}
            rankingView={rankingView}
            setRankingView={setRankingView}
            weekOptions={rankingWeekOptions}
            selectedWeek={selectedRankingWeek}
            onWeekChange={handleRankingWeekChange}
            periodOptions={rankingPeriodOptions}
            selectedPeriod={selectedRankingPeriod}
            onPeriodChange={handleRankingPeriodChange}
            payrollTarget={PAYROLL_TARGET}
            foodTarget={FOOD_TARGET}
            drinkTarget={DRINK_TARGET}
          />
        )}

      {/* extra bottom space */}
      <div className="h-10" />
    </main>
  );
}
