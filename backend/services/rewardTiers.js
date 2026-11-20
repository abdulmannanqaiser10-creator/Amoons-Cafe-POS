const REWARD_TIERS = [
  { points: 10, discountPercent: 5, label: "5% off" },
  { points: 20, discountPercent: 10, label: "10% off" },
  { points: 50, discountPercent: 20, label: "20% off" },
];

/** Fixed earn rule: one completed + paid order → 10 points. */
const REWARD_POINTS_PER_ORDER = 10;

function findRewardTier(points) {
  const cost = Math.trunc(Number(points));
  return REWARD_TIERS.find((tier) => tier.points === cost) || null;
}

function bestEligibleTier(balance) {
  const points = Math.max(0, Math.trunc(Number(balance) || 0));
  return REWARD_TIERS.filter((tier) => points >= tier.points);
}

module.exports = {
  REWARD_TIERS,
  REWARD_POINTS_PER_ORDER,
  findRewardTier,
  bestEligibleTier,
};
