export function ok(res, data = null, status = 200) {
  return res.status(status).json({ ok: true, data });
}
