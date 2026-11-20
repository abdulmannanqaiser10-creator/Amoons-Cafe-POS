import { useCallback, useMemo, useState } from "react";

import useResource from "../../components/admin/useResource";
import { adminApi } from "../../api/client";
import {
  AdHead,
  AdPanel,
  AdRefresh,
  AdState,
  AdFormModal,
  AdToast,
  useNotice,
} from "../../components/admin/AdminUi";
import { formatMoney } from "../../utils/format";
import { WalletIcon, UserIcon } from "../../components/Icons";

const formatDate = (value) => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

function Customers() {
  const [query, setQuery] = useState("");
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [redeeming, setRedeeming] = useState(false);
  const { notice, notify } = useNotice();

  const load = useCallback(async () => {
    const result = await adminApi.customers.list();
    return {
      customers: result.customers || [],
      totals: result.totals || {
        customers: 0,
        withOrders: 0,
        outstandingPoints: 0,
      },
      rewardTiers: result.rewardTiers || [],
    };
  }, []);

  const { data, status, error, reload } = useResource(load);
  const customers = data?.customers ?? [];
  const totals = data?.totals ?? {
    customers: 0,
    withOrders: 0,
    outstandingPoints: 0,
  };
  const rewardTiers = data?.rewardTiers ?? [];

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return customers;
    return customers.filter((customer) =>
      [customer.name, customer.phone, customer.email, customer.lastAddress]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(needle))
    );
  }, [customers, query]);

  const openDetail = async (customer) => {
    setDetailLoading(true);
    setDetail({ customer, orders: [], rewardHistory: [], rewardTiers });
    try {
      const result = await adminApi.customers.detail(customer.id);
      setDetail(result);
    } catch (problem) {
      notify(
        "error",
        problem?.response?.data?.message || "Could not load customer."
      );
      setDetail(null);
    } finally {
      setDetailLoading(false);
    }
  };

  const closeDetail = () => setDetail(null);

  const redeem = async (points) => {
    if (!detail?.customer?.id) return;
    setRedeeming(true);
    try {
      const result = await adminApi.customers.redeem(detail.customer.id, {
        points,
      });
      notify("success", result.message || "Reward redeemed");
      const refreshed = await adminApi.customers.detail(detail.customer.id);
      setDetail(refreshed);
      reload();
    } catch (problem) {
      notify(
        "error",
        problem?.response?.data?.message || "Could not redeem reward."
      );
    } finally {
      setRedeeming(false);
    }
  };

  if (status !== "ready") {
    return (
      <div className="ad-page">
        <AdHead
          title="Customer Management"
          sub="Website and POS orders sync here with loyalty points and spend."
          actions={<AdRefresh onClick={reload} busy={status === "loading"} />}
        />
        <AdState status={status} error={error} onRetry={reload} />
      </div>
    );
  }

  return (
    <div className="ad-page">
      <AdToast notice={notice} />
      <AdHead
        title="Customer Management"
        sub="Website and POS orders sync here with loyalty points, spend, and reward history."
        actions={<AdRefresh onClick={reload} />}
      />

      <section className="om-cards" aria-label="Customer summary">
        <article className="om-card om-card--burgundy">
          <span className="om-card-icon">
            <UserIcon />
          </span>
          <div className="om-card-body">
            <span className="om-card-label">Customers</span>
            <strong className="om-card-value">{totals.customers}</strong>
          </div>
        </article>
        <article className="om-card om-card--blue">
          <span className="om-card-icon">
            <UserIcon />
          </span>
          <div className="om-card-body">
            <span className="om-card-label">With orders</span>
            <strong className="om-card-value">{totals.withOrders}</strong>
          </div>
        </article>
        <article className="om-card om-card--green">
          <span className="om-card-icon">
            <WalletIcon />
          </span>
          <div className="om-card-body">
            <span className="om-card-label">Loyalty points</span>
            <strong className="om-card-value">{totals.outstandingPoints}</strong>
          </div>
        </article>
      </section>

      <AdPanel
        title="Customer directory"
        sub="Search by name, phone, email, or address"
        actions={
          <input
            className="om-input"
            style={{ minWidth: 220 }}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search customers…"
            aria-label="Search customers"
          />
        }
      >
        {customers.length === 0 ? (
          <p className="ad-blank">
            No customers yet — they appear automatically when website or POS
            orders include a phone number.
          </p>
        ) : filtered.length === 0 ? (
          <p className="ad-blank">No customers match that search.</p>
        ) : (
          <div className="ad-table-wrap">
            <table className="ad-table">
              <thead>
                <tr>
                  <th>Customer</th>
                  <th>Phone</th>
                  <th>Email</th>
                  <th>Address</th>
                  <th>Orders</th>
                  <th>Spent</th>
                  <th>Points</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((customer) => (
                  <tr key={customer.id}>
                    <td>
                      <strong>{customer.name}</strong>
                    </td>
                    <td>{customer.phone}</td>
                    <td>{customer.email || "—"}</td>
                    <td>{customer.lastAddress || "—"}</td>
                    <td className="ad-num">{customer.orderCount}</td>
                    <td>{formatMoney(customer.totalSpent)}</td>
                    <td>
                      <span className="ad-badge ad-badge--green">
                        {customer.points} pts
                      </span>
                    </td>
                    <td>
                      <button
                        type="button"
                        className="om-mini"
                        onClick={() => openDetail(customer)}
                      >
                        View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </AdPanel>

      {detail ? (
        <AdFormModal
          title={detail.customer?.name || "Customer"}
          subtitle={`${detail.customer?.phone || ""} · ${
            detail.customer?.points ?? 0
          } points`}
          onClose={closeDetail}
          onSubmit={closeDetail}
          saving={false}
          submitLabel="Done"
          cancelLabel="Close"
          size="lg"
        >
          {detailLoading ? (
            <p className="ad-blank">Loading customer…</p>
          ) : (
            <div className="ad-customer-detail">
              <div className="ad-customer-grid">
                <p>
                  <span>Phone</span>
                  <strong>{detail.customer.phone}</strong>
                </p>
                <p>
                  <span>Email</span>
                  <strong>{detail.customer.email || "—"}</strong>
                </p>
                <p>
                  <span>Address</span>
                  <strong>{detail.customer.lastAddress || "—"}</strong>
                </p>
                <p>
                  <span>Loyalty points</span>
                  <strong>{detail.customer.points}</strong>
                </p>
                <p>
                  <span>Orders</span>
                  <strong>{detail.customer.orderCount}</strong>
                </p>
                <p>
                  <span>Total spending</span>
                  <strong>{formatMoney(detail.customer.totalSpent)}</strong>
                </p>
              </div>

              <h3 className="ad-customer-section">Reward options</h3>
              <div className="ad-reward-tiers">
                {(detail.rewardTiers || rewardTiers).map((tier) => (
                  <button
                    key={tier.points}
                    type="button"
                    className="ad-reward-tier"
                    disabled={
                      redeeming || detail.customer.points < tier.points
                    }
                    onClick={() => redeem(tier.points)}
                  >
                    <WalletIcon />
                    <strong>{tier.points} pts</strong>
                    <span>{tier.label}</span>
                  </button>
                ))}
              </div>

              <h3 className="ad-customer-section">Order history</h3>
              <ul className="ad-history-list">
                {(detail.orders || []).map((order) => (
                  <li key={order.id}>
                    <span>
                      {order.orderNumber} · {order.status} ·{" "}
                      {formatDate(order.createdAt)}
                    </span>
                    <strong>{formatMoney(order.total)}</strong>
                  </li>
                ))}
                {!detail.orders?.length ? <li>No orders yet.</li> : null}
              </ul>

              <h3 className="ad-customer-section">Reward history</h3>
              <ul className="ad-history-list">
                {(detail.rewardHistory || []).map((entry) => (
                  <li key={entry.id}>
                    <span>
                      {entry.reason} · {entry.note || "—"} ·{" "}
                      {formatDate(entry.createdAt)}
                    </span>
                    <strong>
                      {entry.points > 0 ? "+" : ""}
                      {entry.points}
                    </strong>
                  </li>
                ))}
                {!detail.rewardHistory?.length ? (
                  <li>No reward activity yet.</li>
                ) : null}
              </ul>
            </div>
          )}
        </AdFormModal>
      ) : null}
    </div>
  );
}

export default Customers;
