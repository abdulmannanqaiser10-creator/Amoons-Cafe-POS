import { useId } from "react";

/* Shared glass silhouette used by every cold drink */
const GLASS = "M38 30 L44 96 Q45 102 60 102 Q75 102 76 96 L82 30 Z";

/* Burgundy outline colour keeps every illustration on brand */
const LINE = "#4a001d";

function IcedGlass({
  liquid,
  liquidTop = 52,
  ice = true,
  mint = false,
  overlay = null,
  children = null,
}) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const clip = `pos-glass-${uid}`;

  return (
    <>
      <defs>
        <clipPath id={clip}>
          <path d={GLASS} />
        </clipPath>
      </defs>

      {/* Drink */}
      <rect
        x="26"
        y={liquidTop}
        width="68"
        height="84"
        fill={liquid}
        clipPath={`url(#${clip})`}
      />

      {/* Ice */}
      {ice && (
        <g clipPath={`url(#${clip})`} fill="#ffffff" opacity="0.48">
          <rect
            x="41"
            y={liquidTop + 5}
            width="17"
            height="17"
            rx="5"
            transform="rotate(-14 50 62)"
          />
          <rect
            x="62"
            y={liquidTop + 21}
            width="16"
            height="16"
            rx="5"
            transform="rotate(16 70 78)"
          />
          <rect
            x="43"
            y={liquidTop + 38}
            width="15"
            height="15"
            rx="5"
            transform="rotate(8 51 94)"
          />
        </g>
      )}

      {/* Mint leaves */}
      {mint && (
        <g clipPath={`url(#${clip})`} opacity="0.92">
          <ellipse
            cx="50"
            cy="60"
            rx="8"
            ry="4.6"
            fill="#2f7d4f"
            transform="rotate(-28 50 60)"
          />
          <ellipse
            cx="67"
            cy="72"
            rx="7.4"
            ry="4.4"
            fill="#3c9260"
            transform="rotate(24 67 72)"
          />
          <ellipse
            cx="52"
            cy="84"
            rx="7"
            ry="4.2"
            fill="#2f7d4f"
            transform="rotate(-12 52 84)"
          />
        </g>
      )}

      {/* Extra in-glass decoration supplied by the caller */}
      <g clipPath={`url(#${clip})`}>{children}</g>

      {/* Glass body + rim */}
      <path
        d={GLASS}
        fill="none"
        stroke={LINE}
        strokeOpacity="0.3"
        strokeWidth="2.6"
        strokeLinejoin="round"
      />
      <ellipse
        cx="60"
        cy="30"
        rx="22"
        ry="6"
        fill="none"
        stroke={LINE}
        strokeOpacity="0.3"
        strokeWidth="2.6"
      />

      {/* Straw */}
      <path
        d="M77 17 L63 66"
        stroke={LINE}
        strokeOpacity="0.85"
        strokeWidth="5"
        strokeLinecap="round"
      />

      {overlay}
    </>
  );
}

/* Hot coffee: cup on a saucer with steam */
function HotCup() {
  return (
    <>
      <g
        fill="none"
        stroke={LINE}
        strokeOpacity="0.32"
        strokeWidth="2.4"
        strokeLinecap="round"
      >
        <path d="M47 30c4-5 0-9 4-14" />
        <path d="M60 28c4-5 0-9 4-14" />
      </g>

      {/* Saucer */}
      <ellipse cx="57" cy="92" rx="37" ry="8.5" fill="#f4f9ff" />
      <ellipse
        cx="57"
        cy="92"
        rx="37"
        ry="8.5"
        fill="none"
        stroke={LINE}
        strokeOpacity="0.24"
        strokeWidth="2.4"
      />

      {/* Handle */}
      <path
        d="M80 54c9.5 0 15 6 15 12.5S89.5 79 80 79"
        fill="none"
        stroke={LINE}
        strokeOpacity="0.28"
        strokeWidth="3.4"
      />

      {/* Cup */}
      <path
        d="M30 48 L38 74 Q40 88 55 88 Q70 88 72 74 L80 48 Z"
        fill="#ffffff"
        stroke={LINE}
        strokeOpacity="0.28"
        strokeWidth="2.6"
        strokeLinejoin="round"
      />

      {/* Coffee surface */}
      <ellipse cx="55" cy="48" rx="25" ry="7.6" fill="#5f3319" />
      <ellipse cx="55" cy="47.4" rx="17" ry="4.6" fill="#8a5a35" opacity="0.75" />
    </>
  );
}

/* Frappe: tall glass topped with whipped cream and drizzle */
function Frappe() {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const clip = `pos-frappe-${uid}`;

  return (
    <>
      <defs>
        <clipPath id={clip}>
          <path d={GLASS} />
        </clipPath>
      </defs>

      <rect x="26" y="52" width="68" height="84" fill="#6b3a1f" clipPath={`url(#${clip})`} />

      <g clipPath={`url(#${clip})`} fill="#ffffff" opacity="0.42">
        <rect x="42" y="60" width="16" height="16" rx="5" transform="rotate(-12 50 68)" />
        <rect x="61" y="80" width="15" height="15" rx="5" transform="rotate(14 68 87)" />
      </g>

      {/* Glass */}
      <path
        d={GLASS}
        fill="none"
        stroke={LINE}
        strokeOpacity="0.3"
        strokeWidth="2.6"
        strokeLinejoin="round"
      />
      <ellipse
        cx="60"
        cy="30"
        rx="22"
        ry="6"
        fill="none"
        stroke={LINE}
        strokeOpacity="0.3"
        strokeWidth="2.6"
      />

      {/* Whipped cream mound */}
      <path
        d="M34 42 C31 34 38 31 41 27 C44 21 52 23 55 18 C58 13 67 14 70 19
           C73 24 82 25 84 32 C86 38 81 44 74 44 L43 44 C38 44 35 45 34 42 Z"
        fill="#fff8ee"
        stroke={LINE}
        strokeOpacity="0.16"
        strokeWidth="2"
        strokeLinejoin="round"
      />

      {/* Chocolate drizzle */}
      <path
        d="M42 34q7 6 14 1t14 2"
        fill="none"
        stroke="#7a4423"
        strokeWidth="3"
        strokeLinecap="round"
        opacity="0.85"
      />
      <path
        d="M47 24q6 5 12 1"
        fill="none"
        stroke="#7a4423"
        strokeWidth="2.6"
        strokeLinecap="round"
        opacity="0.7"
      />

      {/* Straw */}
      <path
        d="M79 16 L66 62"
        stroke={LINE}
        strokeOpacity="0.85"
        strokeWidth="5"
        strokeLinecap="round"
      />
    </>
  );
}

/* Lemon wheel perched on the rim */
function LemonWheel() {
  return (
    <g>
      <circle cx="35" cy="31" r="10.5" fill="#f8e07a" stroke={LINE} strokeOpacity="0.26" strokeWidth="2" />
      <circle cx="35" cy="31" r="6.6" fill="#fdf3c4" />
      <g stroke="#f0cf5e" strokeWidth="1.6" strokeLinecap="round">
        <path d="M35 25v12" />
        <path d="M30 31h10" />
        <path d="M31.5 27.5l7 7" />
        <path d="M38.5 27.5l-7 7" />
      </g>
    </g>
  );
}

const FRUIT_LIQUIDS = ["#cf9233", "#8ed3a5", "#8ecdf5", "#d94f70", "#b487d6", "#e2a13c"];
const COFFEE_LIQUID = "#6b3a1f";

/**
 * Placeholder art is read off the category name rather than a fixed list of
 * seeded categories, so a section created in the panel gets its own stable
 * illustration instead of whatever the last default happened to draw.
 */
function pickArt(category) {
  const name = String(category ?? "").toLowerCase();
  const seed = [...name].reduce((sum, char) => sum + char.charCodeAt(0), 0);

  const coffee = /coffee|espresso|latte|cappuccino|mocha/.test(name);
  const iced = /ice|cold|frozen|chill/.test(name);
  const mint = /mint|mojito/.test(name);
  const tea = /tea|chai/.test(name);

  if (/frappe|shake|smoothie/.test(name)) return <Frappe />;
  if (coffee && !iced) return <HotCup />;

  const liquid = coffee
    ? COFFEE_LIQUID
    : mint
      ? "#8ed3a5"
      : tea
        ? "#cf9233"
        : FRUIT_LIQUIDS[seed % FRUIT_LIQUIDS.length];

  return (
    <IcedGlass
      liquid={liquid}
      liquidTop={46 + (seed % 5) * 3}
      mint={mint}
      overlay={tea || /lemon|citrus|juice/.test(name) ? <LemonWheel /> : null}
    />
  );
}

function ProductArt({ category }) {
  const art = pickArt(category);

  return (
    <svg
      viewBox="0 0 116 116"
      aria-hidden="true"
      focusable="false"
      xmlns="http://www.w3.org/2000/svg"
    >
      {art}
    </svg>
  );
}

export default ProductArt;
