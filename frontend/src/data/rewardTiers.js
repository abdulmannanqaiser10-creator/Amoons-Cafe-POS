/** Mirrors backend/services/rewardTiers.js — keep in sync. */
export const REWARD_TIERS = [
  { points: 10, discountPercent: 5, label: "5% off" },
  { points: 20, discountPercent: 10, label: "10% off" },
  { points: 50, discountPercent: 20, label: "20% off" },
];

export function findRewardTier(points) {
  const cost = Math.trunc(Number(points));
  return REWARD_TIERS.find((tier) => tier.points === cost) || null;
}

export function eligibleRewardTiers(balance) {
  const points = Math.max(0, Math.trunc(Number(balance) || 0));
  return REWARD_TIERS.filter((tier) => points >= tier.points);
}
