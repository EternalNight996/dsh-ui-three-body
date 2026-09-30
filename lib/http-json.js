// 极小的 HTTP JSON 响应助手（host 侧）。
// 与 memory-eternal 的做法一致：手写头 + Content-Length，避免引入任何依赖。

/**
 * 写一个 JSON 响应。
 * @param {import('node:http').ServerResponse} res 响应对象。
 * @param {number} status HTTP 状态码。
 * @param {unknown} payload 响应体（会被 JSON.stringify）。
 * @returns {void}
 */
export function jsonRoute(res, status, payload) {
  const body = JSON.stringify(payload ?? null)
  if (res.headersSent) {
    try {
      res.end(body)
    } catch {
      /* 客户端已断开 */
    }
    return
  }
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Content-Length': Buffer.byteLength(body),
  })
  res.end(body)
}
