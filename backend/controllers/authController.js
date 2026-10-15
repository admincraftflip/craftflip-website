export function getCurrentUser(req, res) {
  res.json({ success: true, data: { user: req.user.toProfile() } })
}
