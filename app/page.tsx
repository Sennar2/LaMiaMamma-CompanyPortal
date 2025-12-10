"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import brands from "@/data/brands.json";
import { supabase } from "@/lib/supabaseClient";
import { LOCATIONS as PLANDAY_LOCATIONS } from "@/data/locations";
import ComplianceBar from "@/components/financial/ComplianceBar";
import MaintenanceCountBadge from "@/components/MaintenanceCountBadge";
import PayrollCard from "@/components/PayrollCard";


/* ──────────────────────────────────────────────────────────────────────────────
   Types
   ──────────────────────────────────────────────────────────────────────────── */
type UserRole = "user" | "ops" | "admin";

type ProfileRow = {
  id: string;
  full_name: string | null;
  role: UserRole;
  home_location: string | null;
};

type ShiftCard = {
  name: string;
  start: string;
  end: string;
  location: string;
  _sort: string;
  shiftType?: string | null;
  employmentGroup?: string | null;
};

type RevenueData = { today: number; weekActual: number; weekForecast: number } | null;
type WeatherData = { temp: number; description: string; icon: string } | null;
type FinanceInsights =
  | {
      wkLabel: string;
      salesActual: number;
      salesBudget: number;
      salesVar: number;
      salesVarPct: number;
      payrollPct: number;
      foodPct: number;
      drinkPct: number;
      salesVsLastYearPct: number;
      avgPayrollVar4w: number;
    }
  | null;

type DailyTask = { id: string; text: string; pill?: string; deadline?: string };
type DailyOpsState = { checked: string[]; notes: string };

type OpsMsg = {
  id: string;
  user_id: string | null;
  author_name: string | null;
  target_location: string; // "All" or site name
  text: string;
  created_at: string;
};

type OpsMsgReply = {
  id: string;
  message_id: string;
  user_id: string | null;
  author_name: string | null;
  text: string;
  created_at: string;
};

/* ──────────────────────────────────────────────────────────────────────────────
   Helpers
   ──────────────────────────────────────────────────────────────────────────── */
const fmtGBP = (n?: number | null) =>
  new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 }).format(n ?? 0);

function gbToYmd(gb: string) {
  const [d, m, y] = gb.split("/").map((s) => s.trim());
  return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
}
function todayYmd() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function toLondonDateKey(iso: string) {
  const d = new Date(iso);
  const p = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .format(d)
    .split("/");
  return `${p[2]}-${p[1]}-${p[0]}`;
}
const timeAgo = (iso: string) => {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
};
function startOfWeekMonday(ymd: string) {
  const d = new Date(ymd + "T00:00:00");
  const jsDay = d.getDay(); // 0=Sun..6=Sat
  const delta = jsDay === 0 ? -6 : 1 - jsDay;
  d.setDate(d.getDate() + delta);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}
function addDays(ymd: string, days: number) {
  const d = new Date(ymd + "T00:00:00");
  d.setDate(d.getDate() + days);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}
function weekRangeLondon(anchorYmd: string) {
  const monday = startOfWeekMonday(anchorYmd);
  const sunday = addDays(monday, 6);
  const start = `${monday}T00:00:00Z`;
  const end = `${sunday}T23:59:59.999Z`;
  return { start, end, label: { monday, sunday } };
}
function dayRangeLondon(ymd: string) {
  const start = `${ymd}T00:00:00Z`;
  const end = `${ymd}T23:59:59.999Z`;
  return { start, end };
}

/* Daily tasks config (today only) */
const DAILY_TASKS: Record<string, DailyTask[]> = {
  monday: [
    { id: "mon-stock", text: "Stock checked & finalised", pill: "📦", deadline: "12:00" },
    { id: "mon-variance", text: "Email stock variance report & action plan", pill: "📧", deadline: "14:00" },
    { id: "mon-hr", text: "Email HR updates (leavers / finishing soon)", pill: "🧾" },
    { id: "mon-temps", text: "Check & sign all kitchen temperature forms", pill: "🧪" },
    { id: "mon-accept", text: "Accept any orders delivered", pill: "📦" },
    { id: "mon-wine", text: "Place wine orders (Vinissimo / Berkman)", pill: "🍷", deadline: "16:00" },
    { id: "mon-pasta", text: "Place La Tua Pasta order", pill: "🍝", deadline: "15:00" },
    { id: "mon-budget", text: "Review this week’s budget & plan", pill: "💷" },
  ],
  tuesday: [
    { id: "tue-accept", text: "Accept orders", pill: "📦" },
    { id: "tue-wine", text: "Place wine orders (Vinissimo / Berkman)", pill: "🍷", deadline: "16:00" },
    { id: "tue-pasta", text: "Place La Tua Pasta order", pill: "🍝", deadline: "15:00" },
    { id: "tue-rota", text: "Next week rota ready for approval", pill: "🧾" },
  ],
  wednesday: [
    { id: "wed-warehouse", text: "Place Warehouse orders (STO → Transfers → Kitchen Lab)", pill: "🏷️" },
    { id: "wed-accept", text: "Accept any orders delivered", pill: "📦" },
    { id: "wed-wine", text: "Place wine orders (Vinissimo / Berkman)", pill: "🍷", deadline: "16:00" },
    { id: "wed-pasta", text: "Place La Tua Pasta order", pill: "🍝", deadline: "15:00" },
  ],
  thursday: [
    { id: "thu-accept", text: "Accept any orders delivered", pill: "📦" },
    { id: "thu-wine", text: "Place wine orders (Vinissimo / Berkman)", pill: "🍷", deadline: "16:00" },
    { id: "thu-pasta", text: "Place La Tua Pasta order", pill: "🍝", deadline: "15:00" },
    { id: "thu-rota", text: "Ready the weekend rota / adjust if needed", pill: "🧾" },
  ],
  friday: [
    { id: "fri-acceptall", text: "Accept all orders", pill: "📦" },
    { id: "fri-transfer", text: "Place any transfers between restaurants", pill: "🔁" },
    { id: "fri-accept", text: "Accept any orders delivered", pill: "📦" },
    { id: "fri-wine", text: "Place wine orders (Vinissimo / Berkman)", pill: "🍷", deadline: "16:00" },
    { id: "fri-pasta", text: "Place La Tua Pasta order", pill: "🍝", deadline: "15:00" },
  ],
  saturday: [{ id: "sat-guest", text: "Guest experience first", pill: "🧑‍🍳" }],
  sunday: [
    { id: "sun-checkpend", text: "Confirm all orders & transfers accepted", pill: "📦" },
    { id: "sun-orders", text: "Place orders for the week ahead (Wed delivery)", pill: "🗂️" },
    { id: "sun-hours", text: "Check hours discrepancies", pill: "🧾" },
    { id: "sun-ready", text: "Get ready for the new week ahead", pill: "✅" },
  ],
};
function weekdayKey(): keyof typeof DAILY_TASKS {
  const n = new Date().toLocaleDateString("en-GB", { weekday: "long", timeZone: "Europe/London" });
  return n.toLowerCase() as any;
}

/*Paydate funnction */
function parseGbDate(value: string): Date | null {
  const v = value.trim();
  if (!v) return null;
  const m = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/); // DD/MM/YYYY
  if (!m) return null;
  const [, d, mo, y] = m;
  const dt = new Date(Number(y), Number(mo) - 1, Number(d));
  return Number.isNaN(dt.getTime()) ? null : dt;
}

function formatDisplayDate(date: Date): string {
  return date.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function daysUntil(date: Date): string {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffMs = date.getTime() - today.getTime();
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "In 1 day";
  if (diffDays > 1) return `In ${diffDays} days`;
  if (diffDays === -1) return "1 day ago";
  return `${Math.abs(diffDays)} days ago`;
}


/* Finance helpers */
const API_KEY =
  process.env.NEXT_PUBLIC_GOOGLE_API_KEY ||
  "AIzaSyB_dkFpvk6w_d9dPD_mWVhfB8-lly-9FS8";
const SPREADSHEET_ID =
  process.env.NEXT_PUBLIC_SHEET_ID ||
  "1PPVSEcZ6qLOEK2Z0uRLgXCnS_maazWFO_yMY648Oq1g";

const BRAND_GROUPS: Record<string, string[]> = {
  "La Mia Mamma (Brand)": [
    "La Mia Mamma - Chelsea",
    "La Mia Mamma - Hollywood Road",
    "La Mia Mamma - Notting Hill",
    "La Mia Mamma - Battersea",
  ],
  "Fish and Bubbles (Brand)": ["Fish and Bubbles - Fulham", "Fish and Bubbles - Notting Hill"],
  "Made in Italy (Brand)": ["Made in Italy - Chelsea", "Made in Italy - Battersea"],
};

// Payroll target fallback (used only if live target absent and a single site is selected)
const PAYROLL_TARGET_FALLBACK: Record<string, number> = {
  "La Mia Mamma - Chelsea": 35,
  "La Mia Mamma - Hollywood Road": 35,
  "La Mia Mamma - Notting Hill": 35,
  "La Mia Mamma - Battersea": 35,
  "Made in Italy - Chelsea": 35,
  "Made in Italy - Battersea": 35,
  "Fish and Bubbles - Fulham": 45,
  "Fish and Bubbles - Notting Hill": 35,
};

function getCurrentWeekNumber() {
  const now = new Date();
  const tmp = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  const day = tmp.getUTCDay() || 7;
  tmp.setUTCDate(tmp.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
  return Math.ceil(((tmp.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}
function parseWeekNum(weekStr: string | undefined) {
  const n = parseInt(String(weekStr || "").replace(/[^\d]/g, ""), 10);
  return isNaN(n) ? 0 : n;
}
function parseSheetValues(values: any[][] | undefined) {
  if (!values || values.length < 2) return [];
  const [headers, ...rows] = values;
  return rows.map((row) =>
    headers.reduce((obj: any, key: string, idx: number) => {
      let value = row[idx];
      if (key === "LocationBreakdown" && typeof value === "string") {
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
    }, {})
  );
}
function rollupByWeek(rowsArray: any[]) {
  if (!rowsArray.length) return [];
  const grouped: Record<string, any[]> = {};
  for (const row of rowsArray) {
    const w = String(row.Week || "").trim();
    (grouped[w] ||= []).push(row);
  }
  const numericKeys = Object.keys(rowsArray[0]).filter((k) => typeof rowsArray[0][k] === "number");
  const merged = Object.entries(grouped).map(([Week, rows]) => {
    const totals: Record<string, number> = {};
    numericKeys.forEach((col) => {
      totals[col] = rows.reduce((sum, r) => sum + (r[col] || 0), 0);
    });
    return { Week, ...totals };
  });
  merged.sort((a: any, b: any) => parseWeekNum(a.Week) - parseWeekNum(b.Week));
  return merged;
}
function computeInsightsBundle(rows: any[]): FinanceInsights {
  if (!rows || rows.length === 0) return null;
  const decorated = rows.map((r: any) => ({ ...r, __weekNum: parseWeekNum(r.Week) }));
  const currentWeekNum = getCurrentWeekNumber();
  const snapshotWeek = Math.max(1, currentWeekNum - 1);
  const hasData = (r: any) =>
    (r.Sales_Actual && r.Sales_Actual !== 0) ||
    (r.Payroll_Actual && r.Payroll_Actual !== 0) ||
    (r.Sales_Budget && r.Sales_Budget !== 0);

  let latest =
    decorated.find((r) => r.__weekNum === snapshotWeek && hasData(r)) ??
    decorated
      .filter((r) => r.__weekNum <= snapshotWeek && hasData(r))
      .sort((a, b) => a.__weekNum - b.__weekNum)
      .at(-1) ??
    decorated.filter(hasData).sort((a, b) => a.__weekNum - b.__weekNum).at(-1);

  if (!latest) return null;

  const weekNum = latest.__weekNum;
  const wkLabel = latest.Week || `W${weekNum}`;
  const windowWeeks = [weekNum, weekNum - 1, weekNum - 2, weekNum - 3].filter((n) => n > 0);
  const last4 = decorated.filter((r) => windowWeeks.includes(r.__weekNum));

  const pct = (v: any) => {
    const n = parseFloat(String(v).replace("%", "").trim());
    return Number.isNaN(n) ? 0 : n;
  };
  const avgPayrollVar4w =
    last4.length > 0 ? last4.map((r) => pct(r["Payroll_v%"])).reduce((a, b) => a + b, 0) / last4.length : 0;

  const salesActual = latest.Sales_Actual || 0;
  const salesBudget = latest.Sales_Budget || 0;
  const salesLastYear = latest.Sales_LastYear || 0;
  const salesVar = salesActual - salesBudget;
  const salesVarPct = salesBudget ? (salesVar / salesBudget) * 100 : 0;
  const payrollPct = salesActual ? (latest.Payroll_Actual / salesActual) * 100 : 0;
  const foodPct = salesActual ? (latest.Food_Actual / salesActual) * 100 : 0;
  const drinkPct = salesActual ? (latest.Drink_Actual / salesActual) * 100 : 0;
  const salesVsLastYearPct = salesLastYear ? ((salesActual - salesLastYear) / salesLastYear) * 100 : 0;

  return { wkLabel, salesActual, salesBudget, salesVar, salesVarPct, payrollPct, foodPct, drinkPct, salesVsLastYearPct, avgPayrollVar4w };
}
async function fetchTab(tabName: string) {
  const range = `${tabName}!A1:Z100`;
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent(range)}?key=${API_KEY}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} loading "${tabName}"`);
  const json = await res.json();
  return parseSheetValues(json.values);
}

/* ──────────────────────────────────────────────────────────────────────────────
   Page
   ──────────────────────────────────────────────────────────────────────────── */
export default function HomePage() {
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [profileLoaded, setProfileLoaded] = useState(false);

  /* Location picker */
  const [allowedLocations, setAllowedLocations] = useState<string[]>([]);
  const [selectedLocation, setSelectedLocation] = useState<string>("");

  /* Search */
  const [searchTerm, setSearchTerm] = useState("");
  const [resources, setResources] = useState<any[]>([]);
  const [searchBox, setSearchBox] = useState(""); // for "Go" click UX

  /* Cards */
  const [weather, setWeather] = useState<WeatherData>(null);
  const [revenue, setRevenue] = useState<RevenueData>(null);

  /* This-week payroll (live from Planday, optional) */
  const [weekPayrollPct, setWeekPayrollPct] = useState<number | null>(null);
  const [weekPayrollTargetPct, setWeekPayrollTargetPct] = useState<number | null>(null);
  const [weekWages, setWeekWages] = useState<number>(0); // £
  const [payrollLoading, setPayrollLoading] = useState(false);
  const [payrollLiveSource, setPayrollLiveSource] = useState<"planday" | "fallback" | "none">("none");
   
     // From payroll API / Google Sheet
  const [weekPayrollForecastCost, setWeekPayrollForecastCost] =
    useState<number | null>(null); // £ Payroll_App
  const [weekSalesForecastFromPayroll, setWeekSalesForecastFromPayroll] =
    useState<number | null>(null); // £ SaleForecast

   

  /* Shifts */
  const [selectedShiftDate, setSelectedShiftDate] = useState(new Date().toLocaleDateString("en-GB"));
  const [shifts, setShifts] = useState<ShiftCard[]>([]);

  /* Finance snapshot */
  const [financeInsights, setFinanceInsights] = useState<FinanceInsights>(null);
  const [financeLoading, setFinanceLoading] = useState(false);
  const [financeError, setFinanceError] = useState("");

  /* Daily Ops */
  const today = todayYmd();
  const weekday = weekdayKey();
  const tasksToday = DAILY_TASKS[weekday] || [];
  const [dailyChecked, setDailyChecked] = useState<Set<string>>(new Set());
  const [dailyNotes, setDailyNotes] = useState("");
  const [dailyStatus, setDailyStatus] = useState("");
  const dailySaveTimer = useRef<any>(null);

  /* News / Ops Updates */
  const [messages, setMessages] = useState<OpsMsg[]>([]);
  const [repliesByMsg, setRepliesByMsg] = useState<Record<string, OpsMsgReply[]>>({});
  const [newMsg, setNewMsg] = useState("");
  const [replyInputs, setReplyInputs] = useState<Record<string, string>>({});
  const [postTarget, setPostTarget] = useState<"this" | "all">("this");
  const [posting, setPosting] = useState(false);
  const [postingReplyId, setPostingReplyId] = useState<string | null>(null);

  /* Ops scope — default: This Week */
  type OpsScope = "today" | "week" | "custom";
  const [opsScope, setOpsScope] = useState<OpsScope>("week");
  const [opsDate, setOpsDate] = useState<string>(today);

  /* Lookups */
  const DEPTS_BY_NAME = useMemo(() => {
    const out: Record<string, string[]> = {};
    for (const loc of PLANDAY_LOCATIONS) {
      const id = (loc as any).plandayDepartmentId;
      out[loc.name.toLowerCase()] = id != null ? [String(id)] : [];
    }
    return out;
  }, []);
  const NAME_BY_DEPT = useMemo(() => {
    const pairs: Array<[string, string]> = [];
    for (const loc of PLANDAY_LOCATIONS) {
      if ((loc as any).plandayDepartmentId != null) {
        pairs.push([String((loc as any).plandayDepartmentId), loc.name]);
      }
    }
    return Object.fromEntries(pairs);
  }, []);

  const pickShiftType = (s: any): string | null =>
    s.shiftTypeName ?? s.shiftType?.name ?? s.typeName ?? s.type?.name ?? s.roleName ?? s.positionName ?? s.sectionName ?? null;
  const pickEmploymentGroup = (s: any): string | null =>
    s.employeeGroupName ??
    s.employmentGroupName ??
    s.employment?.employmentGroupName ??
    s.employment?.employmentGroup?.name ??
    s.employeeGroup?.name ??
    s.groupName ??
    null;
   
/* Payday */
type PayrollNext = {
  startRaw: string;
  endRaw: string;
  payRaw: string;
  payDate: Date;
};

const [nextPayroll, setNextPayroll] = useState<PayrollNext | null>(null);
const [nextPayrollLoading, setNextPayrollLoading] = useState(false);
const [nextPayrollError, setNextPayrollError] = useState<string | null>(null);

   
  /* Profile */
  useEffect(() => {
    (async () => {
      try {
        const { data: auth } = await supabase.auth.getUser();
        const user = auth?.user;
        if (!user) {
          window.location.href = "/login";
          return;
        }
        const { data: prof } = await supabase
          .from("profiles")
          .select("id, full_name, role, home_location")
          .eq("id", user.id)
          .limit(1);
        if (!prof || prof.length === 0) {
          setProfile({
            id: user.id,
            full_name: null,
            role: "user",
            home_location: PLANDAY_LOCATIONS[0]?.name || "La Mia Mamma - Chelsea",
          });
        } else {
          setProfile(prof[0] as ProfileRow);
        }
      } finally {
        setProfileLoaded(true);
      }
    })();
  }, []);

  /* Allowed locations */
  useEffect(() => {
    if (!profile) return;
    const locs =
      profile.role === "user"
        ? [profile.home_location || PLANDAY_LOCATIONS[0]?.name || ""]
        : ["All", ...PLANDAY_LOCATIONS.map((l) => l.name)];
    setAllowedLocations(locs);
    if (!selectedLocation && locs.length > 0) setSelectedLocation(locs[0]);
  }, [profile, selectedLocation]);

  /* Search */
  useEffect(() => {
    if (searchTerm.length < 3) return setResources([]);
    (async () => {
      const { data } = await supabase
        .from("resources")
        .select("*")
        .or(`title.ilike.%${searchTerm}%,brand.ilike.%${searchTerm}%,location.ilike.%${searchTerm}%`);
      setResources(data || []);
    })();
  }, [searchTerm]);

  /* Weather (bigger/bolder) */
  useEffect(() => {
    if (!selectedLocation) return;
    fetch("/api/weather-london")
      .then((r) => r.json())
      .then((data) =>
        setWeather(data?.error ? null : { temp: data.temp ?? 0, description: data.description ?? "", icon: data.icon ?? "" })
      )
      .catch(() => setWeather(null));
  }, [selectedLocation]);

   

  /* Revenue (today/week) */
  useEffect(() => {
    if (!selectedLocation) return;
    const ymd = todayYmd();
    const departmentIds =
      selectedLocation === "All"
        ? PLANDAY_LOCATIONS.map((l: any) => (l.plandayDepartmentId != null ? String(l.plandayDepartmentId) : null)).filter(Boolean)
        : DEPTS_BY_NAME[selectedLocation.toLowerCase()] || [];
    (async () => {
      try {
        if (!departmentIds.length) return setRevenue(null);
        const r = await fetch("/api/planday/revenue", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ departmentIds, date: ymd }),
        });
        const j = await r.json();
        if (j?.error) return setRevenue(null);
        setRevenue({
          today: Number(j.todayActual ?? 0),
          weekActual: Number(j.weekActual ?? 0),
          weekForecast: Number(j.weekBudget ?? j.weekForecast ?? 0),
        });
      } catch {
        setRevenue(null);
      }
    })();
  }, [selectedLocation, DEPTS_BY_NAME]);

  /* Live Payroll (THIS WEEK) — uses Planday + sheet forecast */
  useEffect(() => {
    if (!selectedLocation) return;

    const ymdToday = todayYmd();

    const departmentIds =
      selectedLocation === "All"
        ? PLANDAY_LOCATIONS.map((l: any) =>
            l.plandayDepartmentId != null ? String(l.plandayDepartmentId) : null
          ).filter(Boolean)
        : DEPTS_BY_NAME[selectedLocation.toLowerCase()] || [];

    if (!departmentIds.length) {
      setWeekWages(0);
      setWeekPayrollPct(null);
      setWeekPayrollTargetPct(null);
      setWeekPayrollForecastCost(null);
      setWeekSalesForecastFromPayroll(null);
      setPayrollLiveSource("none");
      return;
    }

    (async () => {
      setPayrollLoading(true);
      try {
        const resp = await fetch("/api/planday/payroll", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            departmentIds,
            anchorYmd: ymdToday,
            // for "All" we don't send a location name so the API
            // does NOT try to read a sheet tab called "All"
            locationName: selectedLocation === "All" ? undefined : selectedLocation,
          }),
        });

        if (!resp.ok) {
          setWeekWages(0);
          setWeekPayrollPct(null);
          setWeekPayrollForecastCost(null);
          setWeekSalesForecastFromPayroll(null);
          setWeekPayrollTargetPct(
            selectedLocation !== "All"
              ? PAYROLL_TARGET_FALLBACK[selectedLocation] ?? null
              : null
          );
          setPayrollLiveSource("none");
          return;
        }

        const j = await resp.json();
        const totals = j?.totals || {};
        const sources = j?.sources || {};

        const wagesToDate = Number(
          totals.wagesToDateGBP ?? totals.wagesGBP ?? 0
        );
        const salesActual = Number(totals.salesActual ?? 0);
        const salesForecast = Number(totals.salesForecast ?? 0);
        const payrollForecastGBP =
          totals.payrollForecastGBP != null
            ? Number(totals.payrollForecastGBP)
            : null;

        const apiPctActual =
          typeof totals.payrollPctActual === "number"
            ? Number(totals.payrollPctActual)
            : null;
        const targetPctFromApi =
          typeof totals.targetPct === "number"
            ? Number(totals.targetPct)
            : null;

        const actualPct =
          apiPctActual != null
            ? apiPctActual
            : salesActual > 0
            ? (wagesToDate / salesActual) * 100
            : null;

        let targetPct: number | null = null;
        if (targetPctFromApi != null) targetPct = targetPctFromApi;
        else if (selectedLocation !== "All")
          targetPct = PAYROLL_TARGET_FALLBACK[selectedLocation] ?? null;

        setWeekWages(wagesToDate);
        setWeekPayrollPct(actualPct);
        setWeekPayrollTargetPct(targetPct);
        setWeekSalesForecastFromPayroll(
          salesForecast > 0 ? salesForecast : null
        );
        setWeekPayrollForecastCost(payrollForecastGBP);
        setPayrollLiveSource(
          sources?.target === "planday" ? "planday" : "fallback"
        );
      } catch {
        setWeekWages(0);
        setWeekPayrollPct(null);
        setWeekPayrollForecastCost(null);
        setWeekSalesForecastFromPayroll(null);
        setWeekPayrollTargetPct(
          selectedLocation !== "All"
            ? PAYROLL_TARGET_FALLBACK[selectedLocation] ?? null
            : null
        );
        setPayrollLiveSource("none");
      } finally {
        setPayrollLoading(false);
      }
    })();
  }, [selectedLocation, DEPTS_BY_NAME]);


  /* Finance snapshot (unchanged) */
  useEffect(() => {
    if (!selectedLocation) return;
    const financeLoc = selectedLocation === "All" ? "GroupOverview" : selectedLocation;
    (async () => {
      setFinanceLoading(true);
      setFinanceError("");
      try {
        const isBrand = !!BRAND_GROUPS[financeLoc];
        let weeklyRows: any[] = [];
        if (isBrand) {
          const all = await Promise.all(BRAND_GROUPS[financeLoc].map((site) => fetchTab(site)));
          weeklyRows = rollupByWeek(all.flat());
        } else {
          weeklyRows = await fetchTab(financeLoc);
          weeklyRows.sort((a, b) => parseWeekNum(a.Week) - parseWeekNum(b.Week));
        }
        setFinanceInsights(computeInsightsBundle(weeklyRows));
      } catch (e: any) {
        setFinanceError(e?.message || "Could not load finance data");
        setFinanceInsights(null);
      } finally {
        setFinanceLoading(false);
      }
    })();
  }, [selectedLocation]);

  /* Shifts */
  useEffect(() => {
    if (!selectedLocation) return;
    const controller = new AbortController();
    (async () => {
      try {
        const ymd = gbToYmd(selectedShiftDate);
        const departmentIds =
          selectedLocation === "All"
            ? PLANDAY_LOCATIONS.map((l: any) => (l.plandayDepartmentId != null ? String(l.plandayDepartmentId) : null)).filter(Boolean)
            : DEPTS_BY_NAME[selectedLocation.toLowerCase()] || [];
        if (!departmentIds.length) return setShifts([]);
        const resp = await fetch("/api/planday/day", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({ departmentIds, date: ymd }),
        });
        const json = await resp.json();
        const arr = Array.isArray(json.items) ? json.items : [];
        const filtered = arr.filter((s: any) => s.startISO && toLondonDateKey(s.startISO) === ymd);
        const mapped: ShiftCard[] = filtered
          .map((s: any) => {
            const start = s.startISO ? new Date(s.startISO).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : "—";
            const end = s.endISO ? new Date(s.endISO).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : "—";
            return {
              name: s.name,
              start,
              end,
              location: NAME_BY_DEPT[String(s.departmentId)] || "Unknown",
              shiftType: pickShiftType(s),
              employmentGroup: pickEmploymentGroup(s),
              _sort: s.startISO || "",
            };
          })
          .sort((a, b) => a._sort.localeCompare(b._sort));
        setShifts(mapped);
      } catch (e) {
        console.error("Shifts load failed:", e);
        setShifts([]);
      }
    })();
    return () => controller.abort();
  }, [selectedShiftDate, selectedLocation, DEPTS_BY_NAME, NAME_BY_DEPT]);

  /* Daily Ops: load & autosave (+audit log) */
  useEffect(() => {
    (async () => {
      try {
        const { data } = await supabase
          .from("daily_ops")
          .select("checked, notes")
          .eq("location", selectedLocation || "All")
          .eq("date", today)
          .maybeSingle();
        setDailyChecked(new Set(data?.checked || []));
        setDailyNotes(data?.notes || "");
      } catch {
        setDailyChecked(new Set());
        setDailyNotes("");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedLocation, today, weekday]);

  function debounceSaveDaily(state: DailyOpsState) {
    clearTimeout(dailySaveTimer.current);
    dailySaveTimer.current = setTimeout(async () => {
      try {
        await supabase.from("daily_ops").upsert(
          {
            location: selectedLocation || "All",
            date: today,
            checked: state.checked,
            notes: state.notes,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "location,date" }
        );
        await supabase.from("daily_ops_log").insert({
          user_id: profile?.id || null,
          location: selectedLocation || "All",
          date: today,
          action: "autosave",
          checked_ids: state.checked,
          checked_count: state.checked.length,
          notes_len: (state.notes || "").length,
          client_ts: new Date().toISOString(),
        });
        setDailyStatus("Saved");
        setTimeout(() => setDailyStatus(""), 1200);
      } catch {
        setDailyStatus("Save failed");
      }
    }, 400);
  }
   /*PayDay Funciton*/
useEffect(() => {
  const PAYROLL_CSV_URL =
    "https://docs.google.com/spreadsheets/d/e/2PACX-1vRaO7nFGkJCkKD78MxrQ_gRtd7i3WXqg84TTfdEWyMhgRMk18HaSK99T6YZpWbAEEG2gU3kISx5FyN2/pub?output=csv";

  async function loadPayroll() {
    setNextPayrollLoading(true);
    setNextPayrollError(null);
    try {
      const res = await fetch(PAYROLL_CSV_URL);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const text = await res.text();
      const lines = text.trim().split(/\r?\n/);
      if (lines.length <= 1) {
        setNextPayroll(null);
        return;
      }

      const [, ...rows] = lines; // skip header
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const upcoming: PayrollNext[] = [];

      for (const line of rows) {
        if (!line.trim()) continue;

        // A = start, B = end, C = pay date
        const [startCell = "", endCell = "", payCell = ""] = line.split(",");

        if (!payCell.trim()) continue;

        const payDate = parseGbDate(payCell);
        const startDate = parseGbDate(startCell);
        const endDate = parseGbDate(endCell);

        if (!payDate || !startDate || !endDate) continue;

        payDate.setHours(0, 0, 0, 0);

        if (payDate >= today) {
          upcoming.push({
            startRaw: startCell.trim(),
            endRaw: endCell.trim(),
            payRaw: payCell.trim(),
            payDate,
          });
        }
      }

      upcoming.sort((a, b) => a.payDate.getTime() - b.payDate.getTime());
      setNextPayroll(upcoming[0] ?? null);
    } catch (e) {
      console.error(e);
      setNextPayrollError("Could not load payroll info");
    } finally {
      setNextPayrollLoading(false);
    }
  }

  loadPayroll();
}, []);

   
  /* News & Ops Updates — week/today/custom + realtime */
  useEffect(() => {
    if (!selectedLocation || !opsDate) return;

    const { start, end } =
      opsScope === "week" ? weekRangeLondon(opsDate) : { ...dayRangeLondon(opsScope === "custom" ? opsDate : todayYmd()) };

    const load = async () => {
      try {
        const { data: msgs } = await supabase
          .from("ops_messages")
          .select("id,user_id,author_name,target_location,text,created_at")
          .in("target_location", ["All", selectedLocation])
          .gte("created_at", start)
          .lte("created_at", end)
          .order("created_at", { ascending: false });

        setMessages(msgs || []);

        const ids = (msgs || []).map((m) => m.id);
        if (!ids.length) {
          setRepliesByMsg({});
          return;
        }
        const { data: reps } = await supabase
          .from("ops_message_replies")
          .select("id,message_id,user_id,author_name,text,created_at")
          .in("message_id", ids)
          .order("created_at", { ascending: true });

        const map: Record<string, OpsMsgReply[]> = {};
        (reps || []).forEach((r) => {
          (map[r.message_id] ||= []).push(r);
        });
        setRepliesByMsg(map);
      } catch {
        setMessages([]);
        setRepliesByMsg({});
      }
    };

    load();

    // realtime
    const ch1 = supabase
      .channel("ops_messages_ins")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "ops_messages" }, (payload) => {
        const row = payload.new as OpsMsg;
        if (!row) return;
        const inScopeLocation = row.target_location === "All" || row.target_location === selectedLocation;
        const inScopeDate = row.created_at >= start && row.created_at <= end;
        if (inScopeLocation && inScopeDate) {
          setMessages((prev) => [row, ...prev]);
        }
      })
      .subscribe();

    const ch2 = supabase
      .channel("ops_message_replies_ins")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "ops_message_replies" }, (payload) => {
        const r = payload.new as OpsMsgReply;
        if (!r) return;
        setRepliesByMsg((prev) => {
          const next = { ...prev };
          (next[r.message_id] ||= []).push(r);
          return next;
        });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(ch1);
      supabase.removeChannel(ch2);
    };
  }, [selectedLocation, opsDate, opsScope]);

  const canSeeFinanceBar = profile?.role === "ops" || profile?.role === "admin";
  const canPostMessage = canSeeFinanceBar;
  const canReply = !!profile;

  if (!profileLoaded || !profile || !selectedLocation) {
    return (
      <main className="p-6 max-w-7xl mx-auto bg-gray-50 text-center">
        <div className="animate-pulse text-gray-500 text-sm">Loading your dashboard…</div>
      </main>
    );
  }

      /* Derived KPIs for THIS WEEK */
  const weekActual = Number(revenue?.weekActual ?? 0); // sales so far (Mon–yesterday)

  // Prefer sales forecast coming from payroll API / sheet; fallback to revenue route
  const weekForecastRaw = Number(revenue?.weekForecast ?? 0);
  const weekForecast =
    weekSalesForecastFromPayroll != null && weekSalesForecastFromPayroll > 0
      ? weekSalesForecastFromPayroll
      : weekForecastRaw;

  const salesGap = Math.max(0, weekForecast - weekActual);
  const forecastProgress =
    weekForecast > 0
      ? Math.min(100, Math.round((weekActual / weekForecast) * 100))
      : 0;

  const payrollPctActual =
    typeof weekPayrollPct === "number" ? weekPayrollPct : null;
  const payrollTargetPct =
    typeof weekPayrollTargetPct === "number" ? weekPayrollTargetPct : null;

  // Forecast payroll cost for the week:
  // 1) Prefer Payroll_App from sheet (weekPayrollForecastCost)
  // 2) Fallback to target% * week sales forecast
  const forecastPayrollCost =
    weekPayrollForecastCost != null
      ? weekPayrollForecastCost
      : payrollTargetPct != null && weekForecast > 0
      ? (payrollTargetPct / 100) * weekForecast
      : null;

  // Over / under vs forecast payroll spend
  const payrollCostVarGBP =
    forecastPayrollCost != null ? weekWages - forecastPayrollCost : null;

  const payrollCostVarPct =
    forecastPayrollCost != null && forecastPayrollCost !== 0
      ? (weekWages / forecastPayrollCost) * 100 - 100
      : null;

  /* UI */
  return (
    <main className="p-6 max-w-7xl mx-auto bg-gray-50 space-y-8">
      {/* Welcome */}
      <div className="text-center">
        <h1 className="text-2xl font-semibold text-gray-900 mt-4">Ciao belli di Mamma 👋</h1>
        <p className="text-sm text-gray-500 mt-1">Everything you need today — shifts, sales, weather, SOPs.</p>
        {profile.role === "admin" && (
          <div className="mt-2">
            <Link
              href="/admin"
              className="inline-block rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-[12px] font-semibold text-indigo-700 hover:bg-indigo-100 transition"
            >
              Admin Panel
            </Link>
          </div>
        )}
      </div>

      {/* Search + Location */}
      <div className="max-w-xl mx-auto space-y-6">
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">🔎</span>
          <input
            type="text"
            value={searchBox}
            onChange={(e) => setSearchBox(e.target.value)}
            placeholder="How can I help today?"
            className="w-full pl-9 pr-20 py-3 border rounded-full shadow-sm text-center text-gray-700 bg-white"
          />
          <button
            className="absolute right-1 top-1/2 -translate-y-1/2 px-4 py-2 text-sm rounded-full bg-blue-600 text-white hover:bg-blue-700"
            onClick={() => setSearchTerm(searchBox.trim())}
          >
            Go
          </button>

          {searchTerm.length >= 3 && resources.length > 0 && (
            <ul className="mt-2 border rounded-lg bg-white shadow text-sm max-h-60 overflow-y-auto divide-y">
              {resources.map((res) => (
                <li key={res.id} className="p-3">
                  <strong>{res.title}</strong>
                  <br />
                  <span className="text-xs text-gray-500">
                    {res.brand} · {res.location}
                  </span>
                  <br />
                  <a href={res.link} target="_blank" className="text-blue-600 underline text-xs">
                    Open
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="text-center">
          <label className="block font-bold text-gray-700 mb-1">Select your location</label>
          <select
            value={selectedLocation}
            onChange={(e) => setSelectedLocation(e.target.value)}
            className="w-64 px-4 py-2 border rounded-full shadow text-sm mx-auto bg-white text-gray-700"
          >
            {allowedLocations.map((loc) => (
              <option key={loc}>{loc}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Finance compliance snapshot */}
      {canSeeFinanceBar ? (
        financeLoading ? (
          <div className="text-center text-xs text-gray-500">Loading finance snapshot…</div>
        ) : financeError ? (
          <div className="text-center text-xs text-red-500">{financeError}</div>
        ) : (
          <ComplianceBar insights={financeInsights} />
        )
      ) : null}

      {/* QUICK KPIs: Today + Weather */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Today’s Forecast */}
        <div className="bg-white p-4 rounded-xl shadow text-center hover:shadow-lg">
          <h3 className="text-sm font-semibold text-gray-700">Today&apos;s Forecast</h3>
          <p className="text-2xl font-extrabold text-blue-700 mt-2">{fmtGBP(revenue?.today)}</p>
        </div>

        {/* Weather (bigger/bolder) */}
        <div className="bg-white p-4 rounded-xl shadow text-center hover:shadow-lg">
          <h3 className="text-sm font-semibold text-gray-700">Weather</h3>
          {weather ? (
            <div className="flex justify-center items-center gap-3 mt-2">
              {weather.icon ? <img src={weather.icon} alt="Weather" className="w-10 h-10" /> : null}
              <div className="leading-tight">
                <p className="text-2xl font-extrabold text-gray-900">{weather.temp}°C</p>
                <p className="text-sm capitalize text-gray-500">{weather.description}</p>
              </div>
            </div>
          ) : (
            <div className="text-xs text-gray-400 mt-2">Weather unavailable</div>
          )}
        </div>
 

      {/* Payroll: its own box, same row */}
  <div className="bg-white p-4 rounded-xl shadow text-center hover:shadow-lg">
    <h3 className="text-sm font-semibold text-gray-700">Next Payday</h3>

    {nextPayrollLoading && (
      <p className="text-xs text-gray-400 mt-2">Loading payroll…</p>
    )}

    {!nextPayrollLoading && nextPayrollError && (
      <p className="text-xs text-red-500 mt-2">{nextPayrollError}</p>
    )}

    {!nextPayrollLoading && !nextPayrollError && !nextPayroll && (
      <p className="text-xs text-gray-400 mt-2">
        No upcoming payroll found in the sheet.
      </p>
    )}

    {!nextPayrollLoading && !nextPayrollError && nextPayroll && (
      <div className="mt-2 space-y-1">
        <div>
          
          <p className="text-xl font-extrabold text-gray-900">
            {formatDisplayDate(nextPayroll.payDate)}
          </p>
          <p className="text-xs text-gray-500">
            {daysUntil(nextPayroll.payDate)} • ({nextPayroll.payRaw})
          </p>
        </div>

        <div className="mt-3 text-xs text-gray-600">
          <p className="font-medium">Working period</p>
          <p>
            {nextPayroll.startRaw} → {nextPayroll.endRaw}
          </p>
        </div>

      
      </div>
    )}
  </div>
</div>


            {/* THIS WEEK — sales + payroll */}
      <section className="bg-white p-4 rounded-xl shadow hover:shadow-lg">
        <div className="flex items-center justify-between">
          <h3 className="text-md font-semibold text-gray-900">This Week (Mon–Sun)</h3>
        </div>

        <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3">
          {/* ── 1) Sales: current vs week forecast ───────────────────── */}
          <div className="border rounded-lg p-3">
            <div className="text-xs text-gray-500">Week so far</div>
            <div className="text-lg font-bold text-gray-900">
              {fmtGBP(weekActual)}
            </div>
            <div className="text-xs text-gray-600">
              Forecast (week):{" "}
              <span className="font-semibold">{fmtGBP(weekForecast)}</span>
            </div>
            <div className="mt-2 h-2 bg-gray-100 rounded-full overflow-hidden">
              <div
                className={`h-full ${
                  salesGap === 0 ? "bg-emerald-500" : "bg-blue-600"
                }`}
                style={{ width: `${forecastProgress}%` }}
              />
            </div>
            <div className="mt-1 text-[11px] text-gray-500">
              {forecastProgress}% of forecast
            </div>
            {weekForecast > 0 && salesGap > 0 ? (
              <div className="mt-1 text-[11px] text-amber-700">
                You need <strong>{fmtGBP(salesGap)}</strong> to reach forecast.
              </div>
            ) : weekForecast > 0 ? (
              <div className="mt-1 text-[11px] text-emerald-700">
                You are ahead of forecast — great job!
              </div>
            ) : null}
          </div>

          {/* ── 2) Payroll cost: current spend vs forecasted cost ────── */}
          <div className="border rounded-lg p-3">
            <div className="text-xs text-gray-500">
              Payroll cost (so far vs week forecast)
            </div>

            {payrollLoading ? (
              <div className="mt-1 text-lg font-extrabold text-gray-400">
                …
              </div>
            ) : (
              <>
                <div className="mt-1 text-sm text-gray-600">
                  So far:{" "}
                  <span className="font-semibold">
                    {fmtGBP(weekWages)}
                  </span>
                </div>

                <div className="text-sm text-gray-600">
                  Forecast cost:{" "}
                  {forecastPayrollCost != null ? (
                    <span className="font-semibold">
                      {fmtGBP(Math.round(forecastPayrollCost))}
                    </span>
                  ) : (
                    <span className="text-gray-400">n/a</span>
                  )}
                </div>

                {payrollCostVarGBP != null && (
                  <div className="mt-1 text-xs">
                    <span
                      className={
                        payrollCostVarGBP > 0
                          ? "text-rose-600 font-semibold"
                          : "text-emerald-700 font-semibold"
                      }
                    >
                      {payrollCostVarGBP > 0 ? "Over" : "Under"} by{" "}
                      {fmtGBP(Math.abs(Math.round(payrollCostVarGBP)))}
                    </span>
                    {payrollCostVarPct != null && (
                      <span className="text-gray-500">
                        {" "}
                        (
                        {payrollCostVarPct > 0 ? "+" : ""}
                        {payrollCostVarPct.toFixed(1)}%)
                      </span>
                    )}
                  </div>
                )}
              </>
            )}
          </div>

          {/* ── 3) Payroll % of sales vs target (like Planday footer) ── */}
          <div className="border rounded-lg p-3">
            <div className="text-xs text-gray-500">
              Payroll % of sales (so far)
            </div>

            <div className="mt-1 text-sm">
              Actual:{" "}
              {payrollPctActual != null ? (
                <span className="font-semibold">
                  {payrollPctActual.toFixed(1)}%
                </span>
              ) : (
                <span className="text-gray-400">n/a</span>
              )}
            </div>

            <div className="mt-1 text-sm">
              Target:{" "}
              {payrollTargetPct != null ? (
                <span className="font-semibold">
                  {payrollTargetPct.toFixed(1)}%
                </span>
              ) : (
                <span className="text-gray-400">n/a</span>
              )}
            </div>

            <div className="mt-1 text-sm">
              Variance:{" "}
              {payrollPctActual != null && payrollTargetPct != null ? (
                (() => {
                  const diff = payrollPctActual - payrollTargetPct;
                  const cls =
                    diff > 0
                      ? "text-rose-600 font-semibold"
                      : "text-emerald-700 font-semibold";
                  return (
                    <span className={cls}>
                      {diff > 0 ? "+" : ""}
                      {diff.toFixed(1)}%
                    </span>
                  );
                })()
              ) : (
                <span className="text-gray-400">n/a</span>
              )}
            </div>

            <div className="mt-2 text-xs text-gray-400">
              Target comes from Planday when available; otherwise site
              fallback is used.
            </div>
          </div>
        </div>
      </section>


      {/* Maintenance + Daily Ops */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white p-4 rounded-xl shadow hover:shadow-lg">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-md font-semibold text-gray-800">
              Maintenance 🛠️
              {selectedLocation !== "All" && <span className="ml-2 text-[11px] text-gray-500">· {selectedLocation}</span>}
            </h3>
            <Link href="/maintenance" className="text-xs px-3 py-1 rounded-full border bg-gray-100 hover:bg-gray-200 text-gray-700">
              Portal ⚙️ →
            </Link>
          </div>
          <div className="flex justify-center">
            <MaintenanceCountBadge
              key={`${profile?.role ?? "user"}::${selectedLocation || "All"}`}
              locationName={selectedLocation === "All" ? undefined : selectedLocation}
            />
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl shadow hover:shadow-lg">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold text-gray-700">
              Daily Ops Checklist 📋—{" "}
              <span className="font-normal text-gray-500">
                {new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "short" })}
              </span>
            </h3>
            <span className="text-[11px] text-gray-500">{dailyStatus}</span>
          </div>
          {tasksToday.length === 0 ? (
            <p className="text-sm text-gray-500">No tasks configured for today.</p>
          ) : (
            <ul className="space-y-2">
              {tasksToday.map((t) => {
                const checked = dailyChecked.has(t.id);
                const toggle = () => {
                  const next = new Set(dailyChecked);
                  checked ? next.delete(t.id) : next.add(t.id);
                  setDailyChecked(next);
                  debounceSaveDaily({ checked: Array.from(next), notes: dailyNotes });
                };
                return (
                  <li key={t.id} className="flex items-start gap-3 border border-gray-200 rounded-lg p-2">
                    <input type="checkbox" className="mt-1 w-4 h-4" checked={checked} onChange={toggle} />
                    <div className="flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        {t.pill && <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 border text-gray-600">{t.pill}</span>}
                        <span className="text-sm font-medium text-gray-800">{t.text}</span>
                        {t.deadline && (
                          <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-50 border border-amber-200 text-amber-700">
                            by {t.deadline}
                          </span>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          <div className="mt-3">
            <label className="text-xs font-semibold text-gray-600">Notes (today)</label>
            <textarea
              value={dailyNotes}
              onChange={(e) => {
                const val = e.target.value;
                setDailyNotes(val);
                debounceSaveDaily({ checked: Array.from(dailyChecked), notes: val });
              }}
              rows={4}
              className="mt-1 w-full border rounded-md p-2 text-sm"
              placeholder="Any quick notes for today…"
            />
          </div>
        </div>
      </div>

      {/* News & Ops Updates */}
      <div className="bg-white p-4 rounded-xl shadow hover:shadow-lg">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-md font-semibold text-gray-800">News & Ops Updates 📰</h3>

          <div className="flex items-center gap-2">
            <div className="inline-flex rounded-full border bg-white overflow-hidden">
              <button
                onClick={() => setOpsScope("today")}
                className={`px-3 py-1.5 text-xs ${opsScope === "today" ? "bg-gray-900 text-white" : "text-gray-700 hover:bg-gray-100"}`}
              >
                Today
              </button>
              <button
                onClick={() => {
                  setOpsScope("week");
                  setOpsDate(todayYmd());
                }}
                className={`px-3 py-1.5 text-xs ${opsScope === "week" ? "bg-gray-900 text-white" : "text-gray-700 hover:bg-gray-100"}`}
              >
                This week
              </button>
              <button
                onClick={() => setOpsScope("custom")}
                className={`px-3 py-1.5 text-xs ${opsScope === "custom" ? "bg-gray-900 text-white" : "text-gray-700 hover:bg-gray-100"}`}
              >
                Custom date
              </button>
            </div>

            <input
              type="date"
              value={opsDate}
              onChange={(e) => setOpsDate(e.target.value)}
              className="text-xs border rounded-md px-2 py-1"
              title={opsScope === "week" ? "Anchor date for week view" : "Date"}
            />

            {(() => {
              if (opsScope === "week") {
                const { label } = weekRangeLondon(opsDate);
                const fmt = (s: string) => {
                  const d = new Date(s + "T00:00:00");
                  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
                };
                return (
                  <span className="hidden sm:inline text-[11px] text-gray-500">
                    {selectedLocation} · {fmt(label.monday)} → {fmt(label.sunday)}
                  </span>
                );
              }
              if (opsScope === "today") {
                return (
                  <span className="hidden sm:inline text-[11px] text-gray-500">
                    {selectedLocation} · {new Date().toLocaleDateString("en-GB", { weekday: "short", day: "2-digit", month: "short" })}
                  </span>
                );
              }
              return (
                <span className="hidden sm:inline text-[11px] text-gray-500">
                  {selectedLocation} · {new Date(opsDate).toLocaleDateString("en-GB", { weekday: "short", day: "2-digit", month: "short" })}
                </span>
              );
            })()}
          </div>
        </div>

        {canPostMessage && (
          <div className="mb-3 border rounded-lg p-3 bg-gray-50">
            <div className="flex items-center gap-3 mb-2">
              <label className="text-xs font-semibold text-gray-700">Target:</label>
              <label className="text-xs flex items-center gap-1">
                <input type="radio" name="postTarget" value="this" checked={postTarget === "this"} onChange={() => setPostTarget("this")} />
                {selectedLocation}
              </label>
              <label className="text-xs flex items-center gap-1">
                <input type="radio" name="postTarget" value="all" checked={postTarget === "all"} onChange={() => setPostTarget("all")} />
                All locations
              </label>
            </div>
            <textarea
              value={newMsg}
              onChange={(e) => setNewMsg(e.target.value)}
              rows={3}
              className="w-full border rounded-md p-2 text-sm"
              placeholder="Write an update for your team…"
            />
            <div className="mt-2 flex justify-end">
              <button
                disabled={posting || newMsg.trim().length === 0}
                className={`px-3 py-1.5 rounded-md text-white text-sm ${posting ? "bg-blue-400" : "bg-blue-600 hover:bg-blue-700"}`}
                onClick={async () => {
                  if (!profile) return;
                  try {
                    setPosting(true);
                    const target_location = postTarget === "all" ? "All" : selectedLocation;
                    const { error } = await supabase.from("ops_messages").insert({
                      user_id: profile.id,
                      author_name: profile.full_name || "Ops",
                      target_location,
                      text: newMsg.trim(),
                    });
                    if (error) throw error;
                    setNewMsg("");

                    const { start, end } =
                      opsScope === "week" ? weekRangeLondon(opsDate) : dayRangeLondon(opsScope === "custom" ? opsDate : todayYmd());
                    const { data } = await supabase
                      .from("ops_messages")
                      .select("id,user_id,author_name,target_location,text,created_at")
                      .in("target_location", ["All", selectedLocation])
                      .gte("created_at", start)
                      .lte("created_at", end)
                      .order("created_at", { ascending: false });
                    setMessages(data || []);
                  } catch {
                    /* noop */
                  } finally {
                    setPosting(false);
                  }
                }}
              >
                {posting ? "Posting…" : "Post update"}
              </button>
            </div>
          </div>
        )}

        {messages.length === 0 ? (
          <div className="text-sm text-gray-500">No updates in this range.</div>
        ) : (
          <ul className="space-y-3">
            {messages.map((m) => {
              const replies = repliesByMsg[m.id] || [];
              return (
                <li key={m.id} className="border rounded-lg p-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-[11px] px-2 py-0.5 rounded-full border ${
                          m.target_location === "All"
                            ? "bg-indigo-50 text-indigo-700 border-indigo-200"
                            : "bg-emerald-50 text-emerald-700 border-emerald-200"
                        }`}
                      >
                        {m.target_location}
                      </span>
                      <span className="text-xs text-gray-500">{timeAgo(m.created_at)}</span>
                    </div>
                    <span className="text-xs text-gray-500">{m.author_name || "Ops"}</span>
                  </div>

                  <p className="text-sm text-gray-800 mt-1 whitespace-pre-wrap">{m.text}</p>

                  <div className="mt-2 pl-3 border-l">
                    {replies.length > 0 && (
                      <ul className="space-y-2">
                        {replies.map((r) => (
                          <li key={r.id} className="text-sm">
                            <div className="flex items-center gap-2">
                              <span className="text-[11px] px-2 py-0.5 rounded-full bg-gray-100 border text-gray-600">↪︎ Reply</span>
                              <span className="text-xs text-gray-500">{r.author_name || "Manager"}</span>
                              <span className="text-xs text-gray-400">{timeAgo(r.created_at)}</span>
                            </div>
                            <div className="mt-0.5 text-gray-800 whitespace-pre-wrap">{r.text}</div>
                          </li>
                        ))}
                      </ul>
                    )}

                    <div className="mt-2 flex items-start gap-2">
                      <textarea
                        value={replyInputs[m.id] || ""}
                        onChange={(e) => setReplyInputs((prev) => ({ ...prev, [m.id]: e.target.value }))}
                        rows={2}
                        className="flex-1 border rounded-md p-2 text-sm"
                        placeholder="Reply…"
                      />
                      <button
                        disabled={postingReplyId === m.id || !(replyInputs[m.id] || "").trim()}
                        className={`px-3 py-1.5 rounded-md text-white text-sm ${
                          postingReplyId === m.id ? "bg-gray-400" : "bg-gray-700 hover:bg-gray-800"
                        }`}
                        onClick={async () => {
                          if (!profile) return;
                          const text = (replyInputs[m.id] || "").trim();
                          if (!text) return;
                          try {
                            setPostingReplyId(m.id);
                            const { error } = await supabase.from("ops_message_replies").insert({
                              message_id: m.id,
                              user_id: profile.id,
                              author_name: profile.full_name || "Manager",
                              text,
                            });
                            if (error) throw error;
                            setReplyInputs((prev) => ({ ...prev, [m.id]: "" }));

                            const { data: reps } = await supabase
                              .from("ops_message_replies")
                              .select("id,message_id,user_id,author_name,text,created_at")
                              .eq("message_id", m.id)
                              .order("created_at", { ascending: true });

                            setRepliesByMsg((prev) => ({ ...prev, [m.id]: reps || [] }));
                          } catch {
                            alert("Could not post reply (check table/permissions).");
                          } finally {
                            setPostingReplyId(null);
                          }
                        }}
                      >
                        {postingReplyId === m.id ? "…" : "Reply"}
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Shifts */}
      <div className="bg-white p-4 rounded-xl shadow">
        <div className="flex justify-between items-center mb-3">
          <h3 className="text-md font-semibold text-gray-800">Shifts</h3>
        </div>
        <div className="flex gap-2 overflow-x-auto mb-3">
          {Array.from({ length: 7 }, (_, i) => {
            const d = new Date();
            d.setDate(d.getDate() + i);
            const label = d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric" });
            const value = d.toLocaleDateString("en-GB");
            return (
              <button
                key={value}
                onClick={() => setSelectedShiftDate(value)}
                className={`text-xs px-3 py-1 rounded-full whitespace-nowrap border ${
                  selectedShiftDate === value ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-700"
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
        {shifts.length === 0 ? (
          <p className="text-sm text-gray-500">No shifts found.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {shifts.map((s, i) => (
              <div
                key={`${s.name}-${s.start}-${s.location}-${i}`}
                className="border-l-4 border-blue-500 bg-blue-50 hover:bg-blue-100 transition p-3 rounded shadow-sm"
              >
                <div className="flex flex-wrap items-center gap-2 mb-1">
                  <h4 className="font-bold text-sm text-gray-900">{s.name}</h4>
                  {s.shiftType && (
                    <span className="text-[11px] px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 border border-blue-200">
                      {s.shiftType}
                    </span>
                  )}
                  {s.employmentGroup && (
                    <span className="text-[11px] px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 border border-rose-200">
                      {s.employmentGroup}
                    </span>
                  )}
                </div>
                <p className="text-sm text-gray-800">
                  <span className="font-medium">Start:</span> {s.start}
                  <br />
                  <span className="font-medium">End:</span> {s.end}
                </p>
                <p className="text-xs text-gray-500 mt-1">{s.location}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Important Apps */}
      <div className="bg-white p-4 rounded-xl shadow">
        <h3 className="text-md font-semibold text-center mb-4 text-gray-800">Important Apps</h3>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-sm">
          <a href="/financial" className="bg-green-500 hover:bg-green-600 text-white py-2 rounded text-center">
            Finance
          </a>
          <a
            href="https://lamiamamma.app.allerly.co.uk/"
            target="_blank"
            className="bg-yellow-500 hover:bg-yellow-600 text-white py-2 rounded text-center"
          >
            Allergens
          </a>
          <a href="https://one.mapal-os.com/" target="_blank" className="bg-pink-500 hover:bg-pink-600 text-white py-2 rounded text-center">
            Flow
          </a>
          <a
            href="https://madeinitalygroup2.planday.com/"
            target="_blank"
            className="bg-blue-500 hover:bg-blue-600 text-white py-2 rounded text-center"
          >
            PlanDay
          </a>
          <a
            href="https://la-mia-mamma-closing.vercel.app/"
            target="_blank"
            className="bg-purple-500 hover:bg-purple-600 text-white py-2 rounded text-center"
          >
            Closing App
          </a>
          <a href="/maintenance" className="bg-red-500 hover:bg-red-600 text-white py-2 rounded text-center">
            Maintenance Portal
          </a>
          <a
            href="https://app.stocktake-online.com/stocks-4/mammasuk/login"
            target="_blank"
            className="bg-gray-500 hover:bg-gray-600 text-white py-2 rounded text-center"
          >
            StockTake Online
          </a>
        </div>
      </div>

      {/* Brands & Locations */}
      <section className="space-y-4 mt-10">
        <h2 className="text-lg font-semibold text-gray-700 text-center">Brands & Locations</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {brands.map((brand: any) => (
            <div key={brand.slug} className="bg-white p-4 rounded-xl shadow text-center hover:shadow-md transition">
              <Image
                src={`/brands/${brand.slug}.png`}
                alt={brand.name}
                width={100}
                height={100}
                className="mx-auto mb-2 h-auto w-auto"
              />
              <h3 className="font-semibold mb-2 text-gray-900">{brand.name}</h3>
              <div className="flex flex-wrap justify-center gap-2">
                {brand.locations.map((location: any) => (
                  <Link
                    key={location.slug}
                    href={`/locations/${brand.slug}/${location.slug}`}
                    className="bg-blue-100 px-3 py-1 text-sm rounded-full hover:bg-blue-200 transition text-blue-800 font-medium"
                  >
                    {location.name}
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
