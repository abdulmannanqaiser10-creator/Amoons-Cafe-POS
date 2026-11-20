import { useCallback, useMemo, useState } from "react";

import useResource from "../../components/admin/useResource";
import { adminApi } from "../../api/client";
import { formatMoney, formatNumber, toISODate } from "../../utils/format";
import { exportReportExcel, exportReportPdf } from "../../utils/exportReport";
import {
  AdHead,
  AdPanel,
  AdRefresh,
  AdState,
  AdField,
} from "../../components/admin/AdminUi";
import {
  BagIcon,
  BanknoteIcon,
  ClipboardIcon,
  DownloadIcon,
  TrendingIcon,
} from "../../components/Icons";

const DAY_MS = 86400000;

function itemsSoldTotal(data) {
  return (data?.byCategory || []).reduce(
    (sum, row) => sum + (Number(row.quantity) || 0),
    0
  );
}

function SalesAreaChart({ daily }) {
  const width = 720;
  const height = 240;
  const pad = { top: 18, right: 16, bottom: 36, left: 54 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;
  const peak = Math.max(...daily.map((row) => Number(row.sales) || 0), 1);
  const step = daily.length > 0 ? plotW / daily.length : plotW;
  const xAt = (index) => pad.left + step * (index + 0.5);
  const yAt = (value) => pad.top + plotH - (value / peak) * plotH;
  const points = daily.map((row, index) => [xAt(index), yAt(Number(row.sales) || 0)]);
  const line = points
    .map(([x, y], index) => `${index === 0 ? "M" : "L"} ${x} ${y}`)
    .join(" ");
  const area = points.length
    ? `${line} L ${points[points.length - 1][0]} ${pad.top + plotH} L ${points[0][0]} ${pad.top + plotH} Z`
    : "";
  const [hover, setHover] = useState(null);
  const active = hover != null ? daily[hover] : null;

  return (
    <div className="ad-report-chart">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Daily sales chart">
        <defs>
          <linearGradient id="reportSalesFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#c9185b" stopOpacity="0.28" />
            <stop offset="100%" stopColor="#c9185b" stopOpacity="0.03" />
          </linearGradient>
        </defs>
        {[0, 0.25, 0.5, 0.75, 1].map((fraction) => {
          const value = peak * fraction;
          const y = yAt(value);
          return (
            <g key={fraction}>
              <line className="ad-report-gridline" x1={pad.left} y1={y} x2={width - pad.right} y2={y} />
              <text className="ad-report-tick" x={pad.left - 8} y={y + 4} textAnchor="end">
                {formatMoney(value)}
              </text>
            </g>
          );
        })}
        {area ? <path d={area} fill="url(#reportSalesFill)" /> : null}
        {line ? (
          <path d={line} fill="none" stroke="#7a1238" strokeWidth="2.5" strokeLinejoin="round" />
        ) : null}
        {points.map(([x, y], index) => (
          <circle
            key={daily[index].date}
            cx={x}
            cy={y}
            r={hover === index ? 5 : 3.2}
            fill="#c9185b"
            onMouseEnter={() => setHover(index)}
          />
        ))}
        {daily.map((row, index) => (
          <rect
            key={`hit-${row.date}`}
            x={xAt(index) - step / 2}
            y={pad.top}
            width={Math.max(step, 12)}
            height={plotH}
            fill="transparent"
            onMouseEnter={() => setHover(index)}
            onMouseLeave={() => setHover(null)}
          />
        ))}
        {daily.map((row, index) =>
          index % Math.ceil(daily.length / 7) === 0 || index === daily.length - 1 ? (
            <text
              key={`label-${row.date}`}
              className="ad-report-tick"
              x={xAt(index)}
              y={height - 12}
              textAnchor="middle"
            >
              {row.date.slice(5)}
            </text>
          ) : null
        )}
      </svg>
      {active ? (
        <div className="ad-report-tooltip" role="status">
          <strong>{active.date}</strong>
          <span>
            {active.orders} orders · {formatMoney(active.sales)}
          </span>
        </div>
      ) : (
        <p className="ad-report-chart-hint">Hover the chart to inspect daily sales.</p>
      )}
    </div>
  );
}

function BarListChart({ rows, valueKey, labelKey, tone = "burgundy" }) {
  const max = Math.max(...rows.map((row) => Number(row[valueKey]) || 0), 1);

  if (!rows.length) {
    return <p className="ad-blank">No data in this window.</p>;
  }

  return (
    <ul className={`ad-barlist ad-barlist--${tone}`}>
      {rows.map((row) => {
        const value = Number(row[valueKey]) || 0;
        const width = `${Math.max(6, (value / max) * 100)}%`;
        return (
          <li key={row[labelKey]} className="ad-barlist-row">
            <div className="ad-barlist-meta">
              <strong>{row[labelKey]}</strong>
              <span>
                {row.quantity != null ? `${row.quantity} sold · ` : ""}
                {row.orders != null ? `${row.orders} orders · ` : ""}
                {formatMoney(value)}
              </span>
            </div>
            <div className="ad-barlist-track" aria-hidden="true">
              <span className="ad-barlist-fill" style={{ width }} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function Reports() {
  const [from, setFrom] = useState(toISODate(new Date(Date.now() - 29 * DAY_MS)));
  const [to, setTo] = useState(toISODate());
  const [exporting, setExporting] = useState("");

  const load = useCallback(async () => {
    return await adminApi.reports({ dateFrom: from, dateTo: to });
  }, [from, to]);

  const { data, status, error, reload } = useResource(load);

  const itemsSold = useMemo(() => itemsSoldTotal(data), [data]);

  const handleExcel = async () => {
    if (!data) return;
    setExporting("excel");
    try {
      exportReportExcel(data);
    } finally {
      setExporting("");
    }
  };

  const handlePdf = async () => {
    if (!data) return;
    setExporting("pdf");
    try {
      exportReportPdf(data);
    } finally {
      setExporting("");
    }
  };

  if (status === "loading" || (status === "error" && !data)) {
    return (
      <div className="ad-page">
        <AdHead
          title="Reports & Analytics"
          sub=""
          actions={<AdRefresh onClick={reload} busy={status === "loading" || status === "refreshing"} />}
        />
        <AdState status={status === "error" ? "error" : "loading"} error={error} onRetry={reload} />
      </div>
    );
  }

  return (
    <div className="ad-page ad-reports">
      <AdHead
        title="Reports & Analytics"
        sub={`${data.range.from} → ${data.range.to} · live order data`}
        actions={
          <>
            <button
              type="button"
              className="om-btn om-btn--ghost"
              onClick={handleExcel}
              disabled={Boolean(exporting)}
            >
              <DownloadIcon className="om-btn-icon" />
              {exporting === "excel" ? "Exporting…" : "Export Excel"}
            </button>
            <button
              type="button"
              className="om-btn om-btn--primary"
              onClick={handlePdf}
              disabled={Boolean(exporting)}
            >
              <DownloadIcon className="om-btn-icon" />
              {exporting === "pdf" ? "Exporting…" : "Export PDF"}
            </button>
            <AdRefresh onClick={reload} busy={status === "loading" || status === "refreshing"} />
          </>
        }
      />

      <AdPanel className="filters">
        <div className="ad-filter-row">
          <AdField label="From" htmlFor="r-from">
            <input
              id="r-from"
              className="om-input om-date"
              type="date"
              value={from}
              max={to}
              onChange={(event) => setFrom(event.target.value)}
            />
          </AdField>
          <AdField label="To" htmlFor="r-to">
            <input
              id="r-to"
              className="om-input om-date"
              type="date"
              value={to}
              min={from}
              onChange={(event) => setTo(event.target.value)}
            />
          </AdField>
          <div className="ad-filter-actions">
            <button
              type="button"
              className="om-btn om-btn--ghost"
              onClick={() => {
                setFrom(toISODate(new Date(Date.now() - 6 * DAY_MS)));
                setTo(toISODate());
              }}
            >
              Last 7 days
            </button>
            <button
              type="button"
              className="om-btn om-btn--ghost"
              onClick={() => {
                setFrom(toISODate(new Date(Date.now() - 29 * DAY_MS)));
                setTo(toISODate());
              }}
            >
              Last 30 days
            </button>
          </div>
        </div>
      </AdPanel>

      <section className="ad-report-kpis" aria-label="Key business metrics">
        <article className="ad-report-kpi ad-report-kpi--primary">
          <span className="ad-report-kpi-icon">
            <ClipboardIcon />
          </span>
          <div>
            <span className="ad-report-kpi-label">Total Orders</span>
            <strong className="ad-report-kpi-value">{formatNumber(data.summary.orders)}</strong>
            <span className="ad-report-kpi-hint">
              Avg {formatMoney(data.summary.averageOrder)} / order
            </span>
          </div>
        </article>
        <article className="ad-report-kpi">
          <span className="ad-report-kpi-icon">
            <BanknoteIcon />
          </span>
          <div>
            <span className="ad-report-kpi-label">Total Revenue</span>
            <strong className="ad-report-kpi-value">{formatMoney(data.summary.sales)}</strong>
            <span className="ad-report-kpi-hint">
              Collected {formatMoney(data.summary.collected)}
            </span>
          </div>
        </article>
        <article className="ad-report-kpi">
          <span className="ad-report-kpi-icon">
            <BagIcon />
          </span>
          <div>
            <span className="ad-report-kpi-label">Items Sold</span>
            <strong className="ad-report-kpi-value">{formatNumber(itemsSold)}</strong>
            <span className="ad-report-kpi-hint">Across all categories</span>
          </div>
        </article>
        <article className="ad-report-kpi">
          <span className="ad-report-kpi-icon">
            <TrendingIcon />
          </span>
          <div>
            <span className="ad-report-kpi-label">Outstanding</span>
            <strong className="ad-report-kpi-value">{formatMoney(data.summary.outstanding)}</strong>
            <span className="ad-report-kpi-hint">Tax {formatMoney(data.summary.tax)}</span>
          </div>
        </article>
      </section>

      <div className="ad-report-grid">
        <AdPanel title="Sales Trend" sub="Daily revenue from live orders">
          {data.daily.length === 0 ? (
            <p className="ad-blank">No sales in this window.</p>
          ) : (
            <SalesAreaChart daily={data.daily} />
          )}
        </AdPanel>

        <AdPanel title="Top-Selling Items" sub="Ranked by revenue">
          <BarListChart
            rows={(data.topProducts || []).slice(0, 8).map((row) => ({
              ...row,
              label: row.name,
              value: row.revenue,
            }))}
            labelKey="label"
            valueKey="value"
          />
        </AdPanel>
      </div>

      <div className="ad-report-grid ad-report-grid--3">
        <AdPanel title="Best-Selling Categories" sub="Quantity and revenue">
          <BarListChart
            rows={(data.byCategory || []).slice(0, 8).map((row) => ({
              ...row,
              label: row.name,
              value: row.revenue,
            }))}
            labelKey="label"
            valueKey="value"
            tone="rose"
          />
        </AdPanel>

        <AdPanel title="Sales by Channel" sub="Where orders came from">
          <BarListChart
            rows={(data.byChannel || []).map((row) => ({
              ...row,
              label: row.key,
              value: row.sales,
              orders: row.orders,
            }))}
            labelKey="label"
            valueKey="value"
            tone="wine"
          />
        </AdPanel>

        <AdPanel title="Payment Mix" sub="How customers paid">
          <BarListChart
            rows={(data.byPaymentMethod || []).map((row) => ({
              ...row,
              label: row.key,
              value: row.sales,
              orders: row.orders,
            }))}
            labelKey="label"
            valueKey="value"
            tone="sky"
          />
        </AdPanel>
      </div>

      <div className="ad-split">
        <AdPanel title="Staff Performance" sub="Orders attributed to cashiers">
          {(data.byStaff || []).length === 0 ? (
            <p className="ad-blank">No staff sales in this window.</p>
          ) : (
            <div className="ad-table-wrap">
              <table className="ad-table">
                <thead>
                  <tr>
                    <th>Staff</th>
                    <th>Orders</th>
                    <th>Sales</th>
                  </tr>
                </thead>
                <tbody>
                  {data.byStaff.map((row) => (
                    <tr key={row.name}>
                      <td>{row.name}</td>
                      <td className="ad-num">{row.orders}</td>
                      <td className="ad-num">{formatMoney(row.sales)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </AdPanel>

        <AdPanel title="Operations Snapshot" sub="Cancellations, reversals, and shifts">
          <dl className="ad-report-stats">
            <div>
              <dt>Cancelled orders</dt>
              <dd>
                {formatNumber(data.summary.cancelled)} · {formatMoney(data.summary.cancelledValue)}
              </dd>
            </div>
            <div>
              <dt>Reversed orders</dt>
              <dd>
                {formatNumber(data.summary.reversed)} · {formatMoney(data.summary.reversedValue)}
              </dd>
            </div>
            <div>
              <dt>Reversal records</dt>
              <dd>
                {formatNumber(data.reversals?.count || 0)} · {formatMoney(data.reversals?.value)}
              </dd>
            </div>
            <div>
              <dt>Shifts / cash pulls</dt>
              <dd>
                {formatNumber(data.shifts?.shifts || 0)} shifts · {formatMoney(data.shifts?.pulls)} pulled
              </dd>
            </div>
            <div>
              <dt>Shift variance</dt>
              <dd>
                {formatMoney(data.shifts?.variance)} across {formatNumber(data.shifts?.variances || 0)} shifts
              </dd>
            </div>
          </dl>
        </AdPanel>
      </div>

      <AdPanel title="Daily Breakdown" sub={`${data.daily.length} day(s) in range`} className="scroll">
        {data.daily.length === 0 ? (
          <p className="ad-blank">Nothing to show for these dates.</p>
        ) : (
          <div className="ad-table-wrap">
            <table className="ad-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Orders</th>
                  <th>Sales</th>
                </tr>
              </thead>
              <tbody>
                {data.daily.map((row) => (
                  <tr key={row.date}>
                    <td>{row.date}</td>
                    <td className="ad-num">{row.orders}</td>
                    <td className="ad-num">{formatMoney(row.sales)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </AdPanel>

      <p className="ad-footnote">
        <TrendingIcon className="om-btn-icon" />
        All figures are calculated from live order, inventory, shift, and reversal records.
        Export Excel for worksheets or Export PDF for a printable document.
      </p>
    </div>
  );
}

export default Reports;
