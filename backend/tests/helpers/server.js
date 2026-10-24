// Ports at or above 1024 that fetch refuses to connect to ("bad port", Fetch standard). The OS can hand
// one out for port 0 where its dynamic range starts low (Windows can be set to start at 1024), which made
// every HTTP test in a file fail at random.
export const FETCH_BLOCKED_PORTS = new Set([1719, 1720, 1723, 2049, 3659, 4045, 4190, 5060, 5061, 6000, 6566, 6665, 6666, 6667, 6668, 6669, 6679, 6697, 10080])

function listenOnce(app) {
  return new Promise((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => resolve(server))
  })
}

// Starts an Express app on a random local port for HTTP-level tests.
export async function startServer(app, listen = listenOnce) {
  let server = await listen(app)
  while (FETCH_BLOCKED_PORTS.has(server.address().port)) {
    server.close()
    server = await listen(app)
  }
  const { port } = server.address()
  return { url: `http://127.0.0.1:${port}`, close: () => server.close() }
}
