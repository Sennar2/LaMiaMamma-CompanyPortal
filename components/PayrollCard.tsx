// components/PayrollCard.tsx

const PAYROLL_CSV_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vRaO7nFGkJCkKD78MxrQ_gRtd7i3WXqg84TTfdEWyMhgRMk18HaSK99T6YZpWbAEEG2gU3kISx5FyN2/pub?output=csv";

// A: Working Period Start
// B: Working Period End
// C: Pay Date

function parseDateFromCell(v: string): Date | null {
  const value = v.trim();
  if (!value) return null;

  // 1) try native (e.g. 2025-11-17)
  const native = new Date(value);
  if (!Number.isNaN(native.getTime())) return native;

  // 2) try DD/MM/YYYY (your screenshot format)
  const m = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) {
    const [, d, mo, y] = m;
    return new Date(Number(y), Number(mo) - 1, Number(d));
  }

  return null;
}

type NextPayroll = {
  startDate: Date;
  endDate: Date;
  payDate: Date;
  startRaw: string;
  endRaw: string;
  payRaw: string;
};

async function getNextPayroll(): Promise<NextPayroll | null> {
  const res = await fetch(PAYROLL_CSV_URL, { cache: "no-store" });

  if (!res.ok) {
    console.error("Failed to fetch payroll CSV", res.status);
    return null;
  }

  const csv = await res.text();
  const lines = csv.trim().split("\n");
  if (lines.length <= 1) return null;

  // first row is header
  const dataLines = lines.slice(1);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const upcoming: NextPayroll[] = [];

  for (const line of dataLines) {
    if (!line.trim()) continue;

    // A,B,C -> start,end,pay
    const [startCell = "", endCell = "", payCell = ""] = line.split(",");

    if (!payCell.trim()) continue;

    const startDate = parseDateFromCell(startCell);
    const endDate = parseDateFromCell(endCell);
    const payDate = parseDateFromCell(payCell);

    if (!startDate || !endDate || !payDate) continue;

    startDate.setHours(0, 0, 0, 0);
    endDate.setHours(0, 0, 0, 0);
    payDate.setHours(0, 0, 0, 0);

    // we care about the next pay date from today
    if (payDate >= today) {
      upcoming.push({
        startDate,
        endDate,
        payDate,
        startRaw: startCell.trim(),
        endRaw: endCell.trim(),
        payRaw: payCell.trim(),
      });
    }
  }

  if (!upcoming.length) return null;

  upcoming.sort((a, b) => Number(a.payDate) - Number(b.payDate));
  return upcoming[0];
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

export default async function PayrollCard() {
  const next = await getNextPayroll();

  return (
    <div className="rounded-xl border bg-white p-4 shadow-sm flex flex-col gap-1">
      <p className="text-sm font-medium text-gray-500">Payroll</p>

      {next ? (
        <>
          <p className="text-xs text-gray-500 uppercase tracking-wide">
            Next Pay Date
          </p>
          <p className="text-2xl font-semibold">
            {formatDisplayDate(next.payDate)}
          </p>
          <p className="text-xs text-gray-500">
            {daysUntil(next.payDate)} • ({next.payRaw})
          </p>

          <div className="mt-3 text-xs text-gray-500">
            <p className="font-medium">Working Period</p>
            <p>
              {next.startRaw} → {next.endRaw}
            </p>
          </div>

          <p className="text-[10px] text-gray-400 mt-2">
            Data from Google Sheet (Working Period Start / End / Pay Date)
          </p>
        </>
      ) : (
        <p className="text-sm text-gray-500">
          No upcoming payroll row found in the sheet.
        </p>
      )}
    </div>
  );
}
