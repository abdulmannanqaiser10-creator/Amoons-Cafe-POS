/** Shared bolt mark used by the login art, POS header, and admin rail. */
export function BrandMark() {
  return (
    <svg className="brand-mark-svg" viewBox="0 0 48 46" aria-hidden="true">
      <defs>
        <linearGradient
          id="brandMarkGradient"
          x1="6"
          y1="2"
          x2="42"
          y2="44"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0%" stopColor="#7A0C31" />
          <stop offset="58%" stopColor="#4A001D" />
          <stop offset="100%" stopColor="#330015" />
        </linearGradient>
      </defs>
      <path
        fill="url(#brandMarkGradient)"
        d="M25.946 44.938c-.664.845-2.021.375-2.021-.698V33.937a2.26 2.26 0 0 0-2.262-2.262H10.287c-.92 0-1.456-1.04-.92-1.788l7.48-10.471c1.07-1.497 0-3.578-1.842-3.578H1.237c-.92 0-1.456-1.04-.92-1.788L10.013.474c.214-.297.556-.474.92-.474h28.894c.92 0 1.456 1.04.92 1.788l-7.48 10.471c-1.07 1.498 0 3.579 1.842 3.579h11.377c.943 0 1.473 1.088.89 1.83L25.947 44.94z"
      />
    </svg>
  );
}

export default BrandMark;
