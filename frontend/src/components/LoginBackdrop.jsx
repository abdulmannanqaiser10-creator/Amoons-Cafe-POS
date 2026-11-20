/**
 * Decorative layer behind the PIN screen: two burgundy corner waves plus a
 * scatter of faint, outlined kitchen icons (cloche, cutlery, chef hat, spoon,
 * plate, glass). The icons are separate absolutely-positioned SVGs rather than
 * one big scene so each one can be sized with clamp() and keeps its aspect
 * ratio on any viewport — a single stretched viewBox would distort them.
 */

const ICONS = {
  cloche: (
    <>
      <path d="M14 74h72" />
      <path d="M22 66h56" />
      <path d="M24 66a26 26 0 0 1 52 0" />
      <path d="M50 40v-6" />
      <circle cx="50" cy="31" r="5" />
    </>
  ),

  cutlery: (
    <>
      {/* Fork */}
      <path d="M28 12v18" />
      <path d="M36 12v18" />
      <path d="M44 12v18" />
      <path d="M28 30c0 6 3.6 10 8 10s8-4 8-10" />
      <path d="M36 40v44" />
      {/* Knife */}
      <path d="M56 12h10c4 10 5 22 3 32-1 5-3 8-6 9h-7z" />
      <path d="M60 53v31" />
    </>
  ),

  chef: (
    <>
      <path
        d="M34 62
           C22 62 14 54 14 44
           C14 36 20 29 28 27
           C29 16 38 8 50 8
           C62 8 71 16 72 27
           C80 29 86 36 86 44
           C86 54 78 62 66 62
           Z"
      />
      <path d="M34 62h32v12a6 6 0 0 1-6 6H40a6 6 0 0 1-6-6z" />
      <path d="M45 63v17" />
      <path d="M55 63v17" />
    </>
  ),

  spoon: (
    <>
      <ellipse cx="50" cy="28" rx="13" ry="17" />
      <path d="M50 45v39" />
    </>
  ),

  plate: (
    <>
      <circle cx="50" cy="50" r="34" />
      <circle cx="50" cy="50" r="23" />
    </>
  ),

  glass: (
    <>
      <path d="M34 14h32l-4 22a12 12 0 0 1-24 0z" />
      <path d="M50 48v30" />
      <path d="M36 80h28" />
    </>
  ),
};

/** One floating icon, placed and sized from the stylesheet. */
function FoodIcon({ name, className }) {
  return (
    <span className={`login-food ${className}`} aria-hidden="true">
      <svg viewBox="0 0 100 100" fill="none" focusable="false">
        {ICONS[name]}
      </svg>
    </span>
  );
}

function CornerWave({ className, idPrefix }) {
  return (
    <svg className={className} viewBox="0 0 620 480" fill="none">
      <defs>
        <linearGradient
          id={`${idPrefix}-light`}
          x1="0"
          y1="0"
          x2="580"
          y2="440"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0%" stopColor="#791037" />
          <stop offset="55%" stopColor="#62092A" />
          <stop offset="100%" stopColor="#4A001D" />
        </linearGradient>
        <linearGradient
          id={`${idPrefix}-dark`}
          x1="0"
          y1="0"
          x2="450"
          y2="380"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0%" stopColor="#5E0726" />
          <stop offset="55%" stopColor="#4A001D" />
          <stop offset="100%" stopColor="#330014" />
        </linearGradient>
      </defs>

      {/* Soft burgundy field sweeping out of the corner */}
      <path
        d="M0 0H620C566 84 470 140 352 178 236 216 116 300 0 430Z"
        fill={`url(#${idPrefix}-light)`}
      />
      <path
        d="M620 0C566 84 470 140 352 178 236 216 116 300 0 430"
        stroke="#DCEEFF"
        strokeWidth="3"
        strokeOpacity="0.55"
      />

      {/* Deeper burgundy core */}
      <path
        d="M0 0H470C430 78 348 126 246 160 148 194 70 268 0 372Z"
        fill={`url(#${idPrefix}-dark)`}
      />
      <path
        d="M470 0C430 78 348 126 246 160 148 194 70 268 0 372"
        stroke="#DCEEFF"
        strokeWidth="1.8"
        strokeOpacity="0.45"
      />
      <path d="M0 0H620" stroke="#DCEEFF" strokeWidth="1.4" strokeOpacity="0.3" />
    </svg>
  );
}

function LoginBackdrop() {
  return (
    <div className="login-backdrop" aria-hidden="true">
      <span className="login-halo" />

      {/* Faint outlined kitchenware drifting in the margins */}
      <FoodIcon name="cloche" className="login-food--a" />
      <FoodIcon name="cutlery" className="login-food--b" />
      <FoodIcon name="chef" className="login-food--c" />
      <FoodIcon name="spoon" className="login-food--d" />
      <FoodIcon name="plate" className="login-food--e" />
      <FoodIcon name="glass" className="login-food--f" />
      <FoodIcon name="chef" className="login-food--g" />
      <FoodIcon name="cloche" className="login-food--h" />
      <FoodIcon name="spoon" className="login-food--i" />
      <FoodIcon name="cutlery" className="login-food--j" />

      <CornerWave
        className="login-corner login-corner--tl"
        idPrefix="cornerTl"
      />
      <CornerWave
        className="login-corner login-corner--br"
        idPrefix="cornerBr"
      />
    </div>
  );
}

export default LoginBackdrop;
