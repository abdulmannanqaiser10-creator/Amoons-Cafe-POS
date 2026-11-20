import {
  BagIcon,
  BanknoteIcon,
  BellIcon,
  BikeIcon,
  BanIcon,
  CardIcon,
  CheckCircleIcon,
  CheckIcon,
  ClockIcon,
  CutleryIcon,
  FlameIcon,
  GlobeIcon,
  AlertIcon,
  ReverseIcon,
  WalletIcon,
} from "../Icons";

const statusIcon = {
  Pending: ClockIcon,
  Preparing: FlameIcon,
  Ready: BellIcon,
  Completed: CheckCircleIcon,
  Cancelled: BanIcon,
  Reversed: ReverseIcon,
};

const channelIcon = {
  "Dine-In": CutleryIcon,
  Takeaway: BagIcon,
  Delivery: BikeIcon,
  Web: GlobeIcon,
  Foodpanda: BikeIcon,
};

const paymentStatusIcon = {
  Paid: CheckIcon,
  Unpaid: AlertIcon,
  Partial: WalletIcon,
};

const paymentMethodIcon = {
  Cash: BanknoteIcon,
  Card: CardIcon,
  Online: GlobeIcon,
  Foodpanda: BikeIcon,
};

const slug = (value) =>
  String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

export function Badge({ tone, Glyph, label, title }) {
  return (
    <span className={`om-badge om-badge--${tone}`} title={title || label}>
      {Glyph ? <Glyph className="om-badge-icon" /> : null}
      <span className="om-badge-text">{label}</span>
    </span>
  );
}

export function StatusBadge({ status }) {
  return (
    <Badge
      tone={`st-${slug(status)}`}
      label={status}
      Glyph={statusIcon[status]}
      title={`Order status: ${status}`}
    />
  );
}

export function PaymentBadge({ status }) {
  return (
    <Badge
      tone={`pay-${slug(status)}`}
      label={status}
      Glyph={paymentStatusIcon[status]}
      title={`Payment status: ${status}`}
    />
  );
}

export function ChannelBadge({ channel }) {
  return (
    <Badge
      tone={`ch-${slug(channel)}`}
      label={channel}
      Glyph={channelIcon[channel]}
      title={`Order channel: ${channel}`}
    />
  );
}

export function PaymentMethodBadge({ method }) {
  return (
    <Badge
      tone={`pm-${slug(method)}`}
      label={method}
      Glyph={paymentMethodIcon[method]}
      title={`Payment method: ${method}`}
    />
  );
}

const shiftIcon = { Open: CheckCircleIcon, Closed: ClockIcon };

export function ShiftBadge({ status }) {
  return (
    <Badge
      tone={`sh-${slug(status)}`}
      label={status === "Open" ? "Open shift" : "Closed"}
      Glyph={shiftIcon[status]}
      title={`Shift status: ${status}`}
    />
  );
}
