import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";

function currency(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}

type ReportTab = "profit-loss" | "rent-roll" | "cash-flow";

export default function Reports() {
  const [tab, setTab] = useState<ReportTab>("profit-loss");
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);

  const { data: plData } = useQuery({
    queryKey: ["report-pl", year],
    queryFn: () => api<any>("/reports/profit-loss", { params: { year } }),
    enabled: tab === "profit-loss",
  });

  const { data: rrData } = useQuery({
    queryKey: ["report-rent-roll"],
    queryFn: () => api<any>("/reports/rent-roll", { params: { year } }),
    enabled: tab === "rent-roll",
  });

  const { data: cfData } = useQuery({
    queryKey: ["report-cash-flow", year],
    queryFn: () => api<any>("/reports/cash-flow", { params: { year } }),
    enabled: tab === "cash-flow",
  });

  const tabs: { key: ReportTab; label: string }[] = [
    { key: "profit-loss", label: "Profit & Loss" },
    { key: "rent-roll", label: "Rent Roll" },
    { key: "cash-flow", label: "Cash Flow" },
  ];

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-bold">Reports</h1>
        <select
          value={year}
          onChange={(e) => setYear(Number(e.target.value))}
          className="rounded-lg border px-3 py-2 text-sm"
        >
          {[currentYear, currentYear - 1, currentYear - 2].map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
      </div>

      <div className="mb-6 flex gap-1 rounded-lg bg-gray-100 p-1">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors ${tab === t.key ? "bg-white shadow text-gray-900" : "text-gray-500 hover:text-gray-700"}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "profit-loss" && plData && (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-4">
            <div className="rounded-xl border bg-white p-4">
              <p className="text-sm text-gray-500">Total Income</p>
              <p className="text-xl font-bold text-green-600">{currency(plData.income?.total ?? 0)}</p>
            </div>
            <div className="rounded-xl border bg-white p-4">
              <p className="text-sm text-gray-500">Total Expenses</p>
              <p className="text-xl font-bold text-red-600">{currency(plData.expenses?.total ?? 0)}</p>
            </div>
            <div className="rounded-xl border bg-white p-4">
              <p className="text-sm text-gray-500">Net Income</p>
              <p className="text-xl font-bold">{currency(plData.netIncome ?? 0)}</p>
            </div>
            <div className="rounded-xl border bg-white p-4">
              <p className="text-sm text-gray-500">Profit Margin</p>
              <p className="text-xl font-bold">{plData.profitMargin ?? 0}%</p>
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <div className="rounded-xl border bg-white p-5">
              <h3 className="mb-3 font-semibold">Income by Category</h3>
              {Object.entries(plData.income?.byCategory ?? {}).map(([cat, amt]) => (
                <div key={cat} className="flex items-center justify-between py-1.5 text-sm">
                  <span>{cat}</span>
                  <span className="font-medium text-green-600">{currency(amt as number)}</span>
                </div>
              ))}
            </div>
            <div className="rounded-xl border bg-white p-5">
              <h3 className="mb-3 font-semibold">Expenses by Category</h3>
              {Object.entries(plData.expenses?.byCategory ?? {}).map(([cat, amt]) => (
                <div key={cat} className="flex items-center justify-between py-1.5 text-sm">
                  <span>{cat}</span>
                  <span className="font-medium text-red-600">{currency(amt as number)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {tab === "rent-roll" && rrData && (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-4">
            <div className="rounded-xl border bg-white p-4">
              <p className="text-sm text-gray-500">Total Units</p>
              <p className="text-xl font-bold">{rrData.totals?.totalUnits ?? 0}</p>
            </div>
            <div className="rounded-xl border bg-white p-4">
              <p className="text-sm text-gray-500">Occupancy</p>
              <p className="text-xl font-bold">{rrData.totals?.occupancyRate ?? 0}%</p>
            </div>
            <div className="rounded-xl border bg-white p-4">
              <p className="text-sm text-gray-500">Market Rent</p>
              <p className="text-xl font-bold">{currency(rrData.totals?.totalMarketRent ?? 0)}</p>
            </div>
            <div className="rounded-xl border bg-white p-4">
              <p className="text-sm text-gray-500">Actual Rent</p>
              <p className="text-xl font-bold">{currency(rrData.totals?.totalActualRent ?? 0)}</p>
            </div>
          </div>

          {(rrData.properties ?? []).map((prop: any) => (
            <div key={prop.property.id} className="rounded-xl border bg-white p-5">
              <h3 className="mb-3 font-semibold">{prop.property.name}</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-b text-xs uppercase text-gray-500">
                    <tr>
                      <th className="py-2 pr-4">Unit</th>
                      <th className="py-2 pr-4">Status</th>
                      <th className="py-2 pr-4">Tenant</th>
                      <th className="py-2 pr-4">Market Rent</th>
                      <th className="py-2 pr-4">Actual Rent</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {(prop.units ?? []).map((u: any) => (
                      <tr key={u.unitId}>
                        <td className="py-2 pr-4 font-medium">{u.unitNumber}</td>
                        <td className="py-2 pr-4">
                          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${u.status === "OCCUPIED" ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"}`}>
                            {u.status}
                          </span>
                        </td>
                        <td className="py-2 pr-4 text-gray-500">
                          {(u.tenants ?? []).map((t: any) => `${t.firstName} ${t.lastName}`).join(", ") || "\u2014"}
                        </td>
                        <td className="py-2 pr-4">{currency(u.marketRent)}</td>
                        <td className="py-2 pr-4">{currency(u.actualRent)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === "cash-flow" && cfData && (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-4">
            <div className="rounded-xl border bg-white p-4">
              <p className="text-sm text-gray-500">Annual Income</p>
              <p className="text-xl font-bold text-green-600">{currency(cfData.totals?.income ?? 0)}</p>
            </div>
            <div className="rounded-xl border bg-white p-4">
              <p className="text-sm text-gray-500">Annual Expenses</p>
              <p className="text-xl font-bold text-red-600">{currency(cfData.totals?.expenses ?? 0)}</p>
            </div>
            <div className="rounded-xl border bg-white p-4">
              <p className="text-sm text-gray-500">Net Cash Flow</p>
              <p className="text-xl font-bold">{currency(cfData.totals?.netCashFlow ?? 0)}</p>
            </div>
            <div className="rounded-xl border bg-white p-4">
              <p className="text-sm text-gray-500">Expense Ratio</p>
              <p className="text-xl font-bold">{cfData.metrics?.operatingExpenseRatio ?? 0}%</p>
            </div>
          </div>

          <div className="rounded-xl border bg-white p-5">
            <h3 className="mb-4 font-semibold">Monthly Cash Flow</h3>
            <ResponsiveContainer width="100%" height={350}>
              <BarChart data={cfData.months ?? []}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="monthName" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip formatter={(value: number) => currency(value)} />
                <Legend />
                <Bar dataKey="income" fill="#22c55e" name="Income" />
                <Bar dataKey="expenses" fill="#ef4444" name="Expenses" />
                <Bar dataKey="netCashFlow" fill="#3b82f6" name="Net Cash Flow" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
}
