const encoder = new TextEncoder()

export function isSameOriginMutation(request: Request): boolean {
  const requestUrl = new URL(request.url)
  const origin = request.headers.get("origin")
  if (origin) {
    try {
      const originUrl = new URL(origin)
      const host = (request.headers.get("host") ?? request.headers.get("x-forwarded-host") ?? requestUrl.host)
        .split(",")[0]
        .trim()
      const protocol = (request.headers.get("x-forwarded-proto") ?? requestUrl.protocol)
        .split(",")[0]
        .trim()
        .replace(/:$/, "")
      if (originUrl.host !== host || originUrl.protocol !== `${protocol}:`) return false
    } catch {
      return false
    }
  }
  return request.headers.get("sec-fetch-site") !== "cross-site"
}

export async function readBoundedJsonV1(
  request: Request,
  maxBytes: number,
): Promise<unknown> {
  const contentLength = Number(request.headers.get("content-length") ?? 0)
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    throw new Error("payload_too_large")
  }
  if (!request.body) throw new Error("invalid_json")

  const reader = request.body.getReader()
  const decoder = new TextDecoder()
  let bytesRead = 0
  let body = ""
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    bytesRead += value.byteLength
    if (bytesRead > maxBytes) {
      await reader.cancel()
      throw new Error("payload_too_large")
    }
    body += decoder.decode(value, { stream: true })
  }
  body += decoder.decode()
  if (encoder.encode(body).byteLength > maxBytes) throw new Error("payload_too_large")
  try {
    return JSON.parse(body) as unknown
  } catch {
    throw new Error("invalid_json")
  }
}
