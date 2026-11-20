import { useCallback, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { AdPanel, AdRefresh, AdState } from "../../components/admin/AdminUi";
import useResource from "../../components/admin/useResource";
import { adminApi, authApi, ordersApi } from "../../api/client";
import { formatDateTime, formatMoney, formatNumber, toISODate } from "../../utils/format";
import { getDisplayPreferences } from "../../utils/preferences";
import welcomeCoffee from "../../assets/admin-welcome-coffee.jpg";
import {
  AlertIcon,
  BagIcon,
  BanknoteIcon,
  CheckCircleIcon,
  ClipboardIcon,
  CutleryIcon,
  PlusIcon,
  TrendingIcon,
  UserIcon,
} from "../../components/Icons";

const DAY_MS = 86400000;
const MAX_COLUMNS = 10;

const PRESETS = [
  { key: "week", label: "Last 7 Days", days: 6 },
  { key: "month", label: "Last 30 Days", days: 29 },
  { key: "today", label: "Today", days: 0 },
];

function fillDays(rows, from, to) {
  const byDate = new Map(rows.map((row) => [row.date, row]));
  const days = [];
  const start = Date.parse(`${from}T00:00:00`);
  const end = Date.parse(`${to}T00:00:00`);

  for (let at = start; at <= end; at += DAY_MS) {
    const key = toISODate(new Date(at));
    const row = byDate.get(key);
    days.push({ date: key, orders: row?.orders ?? 0, sales: row?.sales ?? 0 });
  }

  return days;
}

const niceDay = (iso) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
  });

const dayLabel = (date, columns) =>
  columns <= 7
    ? new Date(`${date}T00:00:00`).toLocaleDateString("en-GB", { weekday: "short" })
    : niceDay(date);

function toColumns(days) {
  if (days.length <= MAX_COLUMNS) {
    return days.map((day) => ({
      key: day.date,
      label: dayLabel(day.date, days.length),
      title: `${day.date} · ${formatMoney(day.sales)} · ${day.orders} orders`,
      ...day,
    }));
  }

  const columns = [];
  for (let at = 0; at < days.length; at += 7) {
    const week = days.slice(at, at + 7);
    const sales = week.reduce((sum, day) => sum + day.sales, 0);
    const orders = week.reduce((sum, day) => sum + day.orders, 0);
    columns.push({
      key: week[0].date,
      label: niceDay(week[0].date),
      title: `${week[0].date} – ${week[week.length - 1].date} · ${formatMoney(sales)} · ${orders} orders`,
      date: week[0].date,
      sales,
      orders,
    });
  }
  return columns;
}

function rangeOf(days) {
  return {
    from: toISODate(new Date(Date.now() - days * DAY_MS)),
    to: toISODate(),
  };
}

function previousRange(from, to) {
  const start = Date.parse(`${from}T00:00:00`);
  const end = Date.parse(`${to}T00:00:00`);
  const span = Math.max(0, Math.round((end - start) / DAY_MS));
  const prevTo = toISODate(new Date(start - DAY_MS));
  const prevFrom = toISODate(new Date(start - (span + 1) * DAY_MS));
  return { from: prevFrom, to: prevTo };
}

function pctChange(current, previous) {
  const cur = Number(current) || 0;
  const prev = Number(previous) || 0;
  if (prev === 0) return cur === 0 ? 0 : 100;
  return Math.round(((cur - prev) / prev) * 100);
}

function greetingFor(date = new Date()) {
  const hour = date.getHours();
  if (hour < 12) return "Good Morning!";
  if (hour < 17) return "Good Afternoon!";
  return "Good Evening!";
}

function statusTone(status) {
  const value = String(status || "").toLowerCase();
  if (value.includes("cancel") || value.includes("revers")) return "danger";
  if (value.includes("complet") || value === "paid" || value === "ready" || value === "served")
    return "success";
  if (value.includes("prepar") || value.includes("pending") || value.includes("open") || value.includes("kitchen"))
    return "warning";
  return "muted";
}

const CHART_W = 680;
const CHART_H = 268;
const PLOT = { left: 62, right: 14, top: 20, bottom: 38 };

const compact = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 1,
});

const axisMoney = (value) => {
  const currency = getDisplayPreferences().currency || "Rs";
  return `${currency} ${compact.format(value)}`;
};

function niceCeil(value) {
  if (!Number.isFinite(value) || value <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const scaled = value / magnitude;
  const step = scaled <= 1 ? 1 : scaled <= 2 ? 2 : scaled <= 5 ? 5 : 10;
  return step * magnitude;
}

function smoothPath(points) {
  if (points.length === 0) return "";
  if (points.length === 1) return `M ${points[0][0]} ${points[0][1]}`;
  let path = `M ${points[0][0]} ${points[0][1]}`;
  for (let index = 0; index < points.length - 1; index += 1) {
    const [x0, y0] = points[index];
    const [x1, y1] = points[index + 1];
    const midX = (x0 + x1) / 2;
    path += ` C ${midX} ${y0}, ${midX} ${y1}, ${x1} ${y1}`;
  }
  return path;
}

function Sparkline({ values, color }) {
  const width = 72;
  const height = 28;
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const span = Math.max(max - min, 1);
  const step = values.length > 1 ? width / (values.length - 1) : width;
  const points = values
    .map((value, index) => {
      const x = index * step;
      const y = height - ((value - min) / span) * (height - 4) - 2;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <svg className="ad-spark" viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      <polyline
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points}
      />
    </svg>
  );
}

function AreaChart({ columns, peak }) {
  const [hover, setHover] = useState(null);
  const count = columns.length;
  const max = niceCeil(peak);
  const plotW = CHART_W - PLOT.left - PLOT.right;
  const plotH = CHART_H - PLOT.top - PLOT.bottom;
  const baseY = PLOT.top + plotH;
  const step = count > 0 ? plotW / count : plotW;
  const xAt = (index) => PLOT.left + step * (index + 0.5);
  const yAt = (value) => baseY - (value / max) * plotH;
  const points = columns.map((column, index) => [xAt(index), yAt(column.sales)]);
  const line = smoothPath(points);
  const area = points.length
    ? `${line} L ${points[points.length - 1][0]} ${baseY} L ${points[0][0]} ${baseY} Z`
    : "";
  const gridValues = [0, 0.25, 0.5, 0.75, 1].map((fraction) => max * fraction);
  const hitWidth = Math.max(step, 24);
  const active = hover != null ? columns[hover] : null;

  return (
    <div className="ad-area" onMouseLeave={() => setHover(null)}>
      <div className="ad-area-canvas">
        <svg className="ad-area-svg" viewBox={`0 0 ${CHART_W} ${CHART_H}`} role="img">
          <defs>
            <linearGradient id="adAreaFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#D41468" stopOpacity="0.28" />
              <stop offset="100%" stopColor="#D41468" stopOpacity="0.02" />
            </linearGradient>
          </defs>

          {gridValues.map((value) => {
            const y = yAt(value);
            return (
              <g key={value}>
                <line className="ad-area-grid" x1={PLOT.left} y1={y} x2={CHART_W - PLOT.right} y2={y} />
                <text className="ad-area-tick" x={PLOT.left - 10} y={y + 4} textAnchor="end">
                  {axisMoney(value)}
                </text>
              </g>
            );
          })}

          {area ? <path className="ad-area-fill" d={area} fill="url(#adAreaFill)" /> : null}
          {line ? <path className="ad-area-line" d={line} /> : null}

          {columns.map((column, index) => (
            <circle
              key={`dot-${column.key}`}
              className={`ad-area-dot${hover === index ? " ad-area-dot--on" : ""}`}
              cx={xAt(index)}
              cy={yAt(column.sales)}
              r={hover === index ? 5 : 3.5}
            />
          ))}

          {active ? (
            <line
              className="ad-area-guide"
              x1={xAt(hover)}
              x2={xAt(hover)}
              y1={PLOT.top}
              y2={baseY}
            />
          ) : null}

          {columns.map((column, index) => (
            <text
              key={`label-${column.key}`}
              className={`ad-area-x${hover === index ? " ad-area-x--on" : ""}`}
              x={xAt(index)}
              y={CHART_H - 12}
              textAnchor="middle"
            >
              {column.label}
            </text>
          ))}

          {columns.map((column, index) => (
            <rect
              key={`hit-${column.key}`}
              className="ad-area-hit"
              x={PLOT.left + step * index}
              y={PLOT.top}
              width={hitWidth}
              height={plotH}
              onMouseEnter={() => setHover(index)}
            />
          ))}
        </svg>

        {active ? (
          <div
            className="ad-area-tip"
            style={{
              left: `${Math.min(86, Math.max(14, (xAt(hover) / CHART_W) * 100))}%`,
              top: `${(yAt(active.sales) / CHART_H) * 100}%`,
            }}
            role="status"
          >
            <strong>{formatMoney(active.sales)}</strong>
            <small>
              {active.label} · {formatNumber(active.orders)} order
              {active.orders === 1 ? "" : "s"}
            </small>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function Dashboard() {
  const [range, setRange] = useState(() => rangeOf(6));
  const [adminName, setAdminName] = useState("Admin");

  const load = useCallback(async () => {
    const from = range.from <= range.to ? range.from : range.to;
    const to = range.from <= range.to ? range.to : range.from;
    const prior = previousRange(from, to);

    const [period, previous, catalogue, loyalty, stock, recent, me] = await Promise.all([
      adminApi.reports({ dateFrom: from, dateTo: to }),
      adminApi.reports({ dateFrom: prior.from, dateTo: prior.to }).catch(() => null),
      adminApi.products.list(),
      adminApi.loyalty.list().catch(() => ({ totals: { members: 0 } })),
      adminApi.inventory.list().catch(() => ({ items: [] })),
      ordersApi.list({ limit: 6, offset: 0 }).catch(() => ({ orders: [] })),
      authApi.me().catch(() => null),
    ]);

    if (me?.name) setAdminName(me.name);

    const days = fillDays(period.daily, period.range.from, period.range.to);
    const products = catalogue.products || [];
    const attention = [
      ...(stock.items || [])
        .filter((item) => item.level !== "OK")
        .map((item) => ({
          key: `stock-${item.productId}`,
          title:
            item.level === "Out"
              ? `${item.name} is out of stock`
              : `${item.name} is low (${item.quantity} ${item.unit})`,
          text: "Restock before the till blocks sales.",
          to: "/admin/inventory",
          Glyph: AlertIcon,
        })),
      ...products
        .filter((product) => product.isAvailable === false)
        .slice(0, 6)
        .map((product) => ({
          key: `menu-${product.id}`,
          title: `${product.name} is unavailable`,
          text: "Hidden from the counter until re-enabled.",
          to: "/admin/menu",
          Glyph: CheckCircleIcon,
        })),
    ];

    return {
      period,
      previous,
      columns: toColumns(days),
      sparkOrders: days.map((day) => day.orders),
      sparkSales: days.map((day) => day.sales),
      products,
      customers: loyalty.totals?.members ?? (loyalty.members?.length || 0),
      recentOrders: recent.orders || [],
      attention,
      generatedAt: new Date().toISOString(),
    };
  }, [range]);

  const { data, status, error, reload } = useResource(load);

  const activePreset = useMemo(() => {
    const preset = PRESETS.find(
      ({ days }) => range.from === rangeOf(days).from && range.to === toISODate()
    );
    return preset?.key ?? "custom";
  }, [range]);

  const greeting = greetingFor();
  const peak = data ? Math.max(...data.columns.map((column) => column.sales), 1) : 1;

  const cards = data
    ? [
        {
          key: "orders",
          label: "Total Orders",
          value: formatNumber(data.period.summary.orders),
          change: pctChange(data.period.summary.orders, data.previous?.summary?.orders),
          Glyph: ClipboardIcon,
          tone: "pink",
          spark: data.sparkOrders,
          sparkColor: "#c9185b",
        },
        {
          key: "revenue",
          label: "Total Revenue",
          value: formatMoney(data.period.summary.sales),
          change: pctChange(data.period.summary.sales, data.previous?.summary?.sales),
          Glyph: BanknoteIcon,
          tone: "green",
          spark: data.sparkSales,
          sparkColor: "#16A36A",
        },
        {
          key: "customers",
          label: "Total Customers",
          value: formatNumber(data.customers),
          change: null,
          Glyph: UserIcon,
          tone: "orange",
          spark: data.sparkOrders,
          sparkColor: "#F59E0B",
        },
        {
          key: "items",
          label: "Total Items",
          value: formatNumber(data.products.length),
          change: 0,
          Glyph: BagIcon,
          tone: "sky",
          spark: data.products.slice(0, 8).map((_, index) => index + 1),
          sparkColor: "#7eb8d8",
        },
      ]
    : [];

  return (
    <div className="om-page ad-page ad-dash">
      {status === "loading" || (status === "error" && !data) ? (
        <AdState status={status === "error" ? "error" : "loading"} error={error} onRetry={reload} />
      ) : (
        <>
          <section className="ad-welcome" aria-label="Welcome">
            <div className="ad-welcome-copy">
              <h1 className="ad-welcome-title">{greeting}</h1>
              <span className="ad-welcome-kicker">Welcome back, {adminName}!</span>
              <p className="ad-welcome-sub">
                Here’s what’s happening with your restaurant today.
              </p>
              <Link className="ad-welcome-btn" to="/admin/reports">
                View Reports →
              </Link>
            </div>
            <div className="ad-welcome-art" aria-hidden="true">
              <img src={welcomeCoffee} alt="" className="ad-welcome-food" />
            </div>
            <div className="ad-dash-toolbar ad-dash-toolbar--welcome">
              <AdRefresh onClick={reload} busy={status === "loading" || status === "refreshing"} />
            </div>
          </section>

          <section className="ad-kpi-grid" aria-label="Key metrics">
            {cards.map(({ key, label, value, change, Glyph, tone, spark, sparkColor }) => (
              <article key={key} className={`ad-kpi ad-kpi--${tone}`}>
                <div className="ad-kpi-top">
                  <span className="ad-kpi-icon">
                    <Glyph />
                  </span>
                  <Sparkline values={spark} color={sparkColor} />
                </div>
                <span className="ad-kpi-label">{label}</span>
                <strong className="ad-kpi-value">{value}</strong>
                {change == null ? (
                  <span className="ad-kpi-trend ad-kpi-trend--muted">Loyalty members</span>
                ) : (
                  <span
                    className={`ad-kpi-trend${
                      change > 0 ? " ad-kpi-trend--up" : change < 0 ? " ad-kpi-trend--down" : ""
                    }`}
                  >
                    {change > 0 ? "+" : ""}
                    {change}% vs prior period
                  </span>
                )}
              </article>
            ))}
          </section>

          <div className="ad-dash-grid">
            <AdPanel
              title="Sales Overview"
              sub={`${data.columns.length} day${data.columns.length === 1 ? "" : "s"} · net of cancellations`}
              actions={
                <select
                  className="ad-select"
                  aria-label="Sales range"
                  value={activePreset}
                  onChange={(event) => {
                    const preset = PRESETS.find((item) => item.key === event.target.value);
                    if (preset) setRange(rangeOf(preset.days));
                  }}
                >
                  {PRESETS.map((preset) => (
                    <option key={preset.key} value={preset.key}>
                      {preset.label}
                    </option>
                  ))}
                  {activePreset === "custom" ? <option value="custom">Custom</option> : null}
                </select>
              }
            >
              <AreaChart columns={data.columns} peak={peak} />
            </AdPanel>

            <AdPanel
              title="Recent Orders"
              sub="Latest till and Web orders"
              actions={
                <Link className="ad-panel-link" to="/admin/orders">
                  View All →
                </Link>
              }
              className="scroll"
            >
              {data.recentOrders.length === 0 ? (
                <p className="ad-blank">No orders yet.</p>
              ) : (
                <ul className="ad-order-list">
                  {data.recentOrders.map((order) => {
                    const tone = statusTone(order.status);
                    return (
                      <li key={order.id} className="ad-order-row">
                        <div>
                          <strong>{order.orderNumber}</strong>
                          <small>
                            {formatDateTime(order.createdAt)} · {order.channel}
                          </small>
                        </div>
                        <span className="ad-order-total">{formatMoney(order.total)}</span>
                        <span className={`ad-status ad-status--${tone}`}>{order.status}</span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </AdPanel>

            <AdPanel title="Quick Actions" sub="Jump to everyday admin tasks">
              <div className="ad-quick-grid" aria-label="Quick actions">
                <Link className="ad-quick-card ad-quick-card--primary" to="/home">
                  <CutleryIcon />
                  <span>New Order</span>
                </Link>
                <Link className="ad-quick-card ad-quick-card--rose" to="/admin/menu">
                  <PlusIcon />
                  <span>Add Menu Item</span>
                </Link>
                <Link className="ad-quick-card ad-quick-card--violet" to="/admin/inventory">
                  <BagIcon />
                  <span>Update Stock</span>
                </Link>
                <Link className="ad-quick-card ad-quick-card--blush" to="/admin/reports">
                  <TrendingIcon />
                  <span>View Reports</span>
                </Link>
              </div>
            </AdPanel>
          </div>

          <AdPanel title="Needs attention" id="needs-attention" className="scroll">
            {data.attention.length === 0 ? (
              <p className="ad-blank">Stock and menu availability look healthy.</p>
            ) : (
              <ul className="ad-attention">
                {data.attention.map(({ key, title, text, to, Glyph }) => (
                  <li key={key} className="ad-attention-row">
                    <Link className="ad-attention-link" to={to}>
                      <span className="ad-attention-icon">
                        <Glyph />
                      </span>
                      <span>
                        <strong>{title}</strong>
                        <small>{text}</small>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </AdPanel>
        </>
      )}
    </div>
  );
}

export default Dashboard;
