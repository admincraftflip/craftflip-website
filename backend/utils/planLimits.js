// Limits by plan (PROJECT.md, Pricing). The plan always comes from the MongoDB user
// document, never from the client.
const MAX_PAGES_BY_PLAN = { free: 100, starter: 100, pro: 200 }
// Flipbooks published at the same time. Pro is unlimited.
const MAX_PUBLISHED_BY_PLAN = { free: 3, starter: 10, pro: Infinity }

export function maxPagesForPlan(plan) {
  return MAX_PAGES_BY_PLAN[plan] ?? MAX_PAGES_BY_PLAN.free
}

export function maxPublishedForPlan(plan) {
  return MAX_PUBLISHED_BY_PLAN[plan] ?? MAX_PUBLISHED_BY_PLAN.free
}
