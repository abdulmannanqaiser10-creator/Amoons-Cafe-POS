import LexcoreLogo from "./LexcoreLogo";
import { LEXCORE } from "../utils/branding";

/**
 * Clickable Lexcore Solutions brand lockup.
 * Opens the company site in a new tab.
 */
export default function LexcoreCredit({ className = "", compact = false }) {
  return (
    <a
      className={`lexcore-credit${compact ? " lexcore-credit--compact" : ""}${
        className ? ` ${className}` : ""
      }`}
      href={LEXCORE.url}
      target="_blank"
      rel="noopener noreferrer"
      title={`${LEXCORE.name} — ${LEXCORE.url}`}
    >
      <LexcoreLogo compact={compact} />
    </a>
  );
}
