const ZIP_UTF8_FLAG = 0x0800
const ZIP_STORE_METHOD = 0

const CRC32_TABLE = Array.from({ length: 256 }, (_, index) => {
  let value = index
  for (let bit = 0; bit < 8; bit += 1) {
    value = (value & 1) === 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1
  }
  return value >>> 0
})

function crc32(bytes: Uint8Array): number {
  let value = 0xffffffff
  for (const byte of bytes) {
    value = CRC32_TABLE[(value ^ byte) & 0xff]! ^ (value >>> 8)
  }
  return (value ^ 0xffffffff) >>> 0
}

function dosTimestamp(value: string): { date: number; time: number } {
  const parsed = new Date(value)
  const instant = Number.isNaN(parsed.getTime()) ? new Date("1980-01-01T00:00:00.000Z") : parsed
  const year = Math.max(1980, Math.min(2107, instant.getUTCFullYear()))
  return {
    date: ((year - 1980) << 9) | ((instant.getUTCMonth() + 1) << 5) | instant.getUTCDate(),
    time:
      (instant.getUTCHours() << 11) |
      (instant.getUTCMinutes() << 5) |
      Math.floor(instant.getUTCSeconds() / 2),
  }
}

export function isSelfContainedPreviewHtmlV1(content: string): boolean {
  const isInlineResource = (value: string) => {
    const normalized = value.trim().toLowerCase()
    return (
      normalized.startsWith("data:") ||
      normalized.startsWith("#") ||
      normalized === "about:blank"
    )
  }
  const isInlineSrcset = (value: string): boolean => {
    let offset = 0
    let candidates = 0
    while (offset < value.length) {
      while (offset < value.length && /[\s,]/.test(value[offset]!)) offset += 1
      if (offset >= value.length) break

      const start = offset
      const dataUrl = value.slice(offset, offset + 5).toLowerCase() === "data:"
      let dataCommaSeen = false
      while (offset < value.length) {
        const character = value[offset]!
        if (/\s/.test(character)) break
        if (character === ",") {
          if (dataUrl && !dataCommaSeen) {
            dataCommaSeen = true
          } else {
            break
          }
        }
        offset += 1
      }
      if (!isInlineResource(value.slice(start, offset))) return false
      candidates += 1

      while (offset < value.length && /\s/.test(value[offset]!)) offset += 1
      if (value[offset] === ",") {
        offset += 1
        continue
      }
      while (offset < value.length && value[offset] !== ",") offset += 1
      if (value[offset] === ",") offset += 1
    }
    return candidates > 0
  }
  const resourceAttributes = [
    /<script\b[^>]*\ssrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi,
    /<link\b[^>]*\shref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi,
    /<(?:img|source|video|audio|iframe|embed|input)\b[^>]*\ssrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi,
    /<video\b[^>]*\sposter\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi,
    /<object\b[^>]*\sdata\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi,
  ]
  for (const pattern of resourceAttributes) {
    for (const match of content.matchAll(pattern)) {
      if (!isInlineResource(match[1] ?? match[2] ?? match[3] ?? "")) return false
    }
  }
  for (const match of content.matchAll(
    /\ssrcset\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi,
  )) {
    const value = match[1] ?? match[2] ?? match[3] ?? ""
    if (!isInlineSrcset(value)) return false
  }
  for (const match of content.matchAll(/url\(\s*(["']?)([^"')]+)\1\s*\)/gi)) {
    if (!isInlineResource(match[2] ?? "")) return false
  }
  for (const match of content.matchAll(/@import\s+(?:url\(\s*)?["']?([^"')\s;]+)/gi)) {
    if (!isInlineResource(match[1] ?? "")) return false
  }
  return true
}

export function createSingleHtmlZipV1(
  htmlContent: string,
  verifiedAt: string,
): Uint8Array {
  return createTextFilesZip([{ path: "index.html", content: htmlContent }], verifiedAt)
}

/** Stored UTF-8 entries: bounded, deterministic, and safe to extract on Windows or Unix. */
export function createTextFilesZip(
  files: readonly { path: string; content: string }[],
  verifiedAt: string,
): Uint8Array {
  if (!files.length || files.length > 512) throw new Error("invalid_archive_size")
  const names = new Set<string>()
  let bytes = 0
  for (const file of files) {
    const parts = file.path.split("/")
    if (file.path.length > 240 || /[\\\x00-\x20:*?"<>|]/.test(file.path) ||
      parts.some(part => !part || part === "." || part === ".." || part.endsWith(".") ||
        /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part))) throw new Error("invalid_archive_path")
    const normalized = file.path.toLowerCase()
    if (names.has(normalized)) throw new Error("invalid_archive_path")
    names.add(normalized)
    bytes += Buffer.byteLength(file.content)
    if (bytes > 8_000_000) throw new Error("invalid_archive_size")
  }
  for (const name of names) {
    const parts = name.split("/")
    for (let i = 1; i < parts.length; i++) {
      if (names.has(parts.slice(0, i).join("/"))) throw new Error("invalid_archive_path")
    }
  }
  const localParts: Uint8Array[] = [], centralParts: Uint8Array[] = []
  let centralOffset = 0, centralSize = 0
  const timestamp = dosTimestamp(verifiedAt)
  for (const file of files) {
    const fileName = new TextEncoder().encode(file.path)
    const content = new TextEncoder().encode(file.content)
    const checksum = crc32(content)

    const localHeader = Buffer.alloc(30)
    localHeader.writeUInt32LE(0x04034b50, 0)
    localHeader.writeUInt16LE(20, 4)
    localHeader.writeUInt16LE(ZIP_UTF8_FLAG, 6)
    localHeader.writeUInt16LE(ZIP_STORE_METHOD, 8)
    localHeader.writeUInt16LE(timestamp.time, 10)
    localHeader.writeUInt16LE(timestamp.date, 12)
    localHeader.writeUInt32LE(checksum, 14)
    localHeader.writeUInt32LE(content.byteLength, 18)
    localHeader.writeUInt32LE(content.byteLength, 22)
    localHeader.writeUInt16LE(fileName.byteLength, 26)
    localHeader.writeUInt16LE(0, 28)

    const centralHeader = Buffer.alloc(46)
    centralHeader.writeUInt32LE(0x02014b50, 0)
    centralHeader.writeUInt16LE(20, 4)
    centralHeader.writeUInt16LE(20, 6)
    centralHeader.writeUInt16LE(ZIP_UTF8_FLAG, 8)
    centralHeader.writeUInt16LE(ZIP_STORE_METHOD, 10)
    centralHeader.writeUInt16LE(timestamp.time, 12)
    centralHeader.writeUInt16LE(timestamp.date, 14)
    centralHeader.writeUInt32LE(checksum, 16)
    centralHeader.writeUInt32LE(content.byteLength, 20)
    centralHeader.writeUInt32LE(content.byteLength, 24)
    centralHeader.writeUInt16LE(fileName.byteLength, 28)
    centralHeader.writeUInt16LE(0, 30)
    centralHeader.writeUInt16LE(0, 32)
    centralHeader.writeUInt16LE(0, 34)
    centralHeader.writeUInt16LE(0, 36)
    centralHeader.writeUInt32LE(0, 38)
    centralHeader.writeUInt32LE(centralOffset, 42)

    localParts.push(localHeader, fileName, content)
    centralParts.push(centralHeader, fileName)
    centralOffset += localHeader.byteLength + fileName.byteLength + content.byteLength
    centralSize += centralHeader.byteLength + fileName.byteLength
  }
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(0, 4)
  end.writeUInt16LE(0, 6)
  end.writeUInt16LE(files.length, 8)
  end.writeUInt16LE(files.length, 10)
  end.writeUInt32LE(centralSize, 12)
  end.writeUInt32LE(centralOffset, 16)
  end.writeUInt16LE(0, 20)

  return Buffer.concat([...localParts, ...centralParts, end])
}

export function versionArchiveHeadersV1(
  versionNumber: number,
  sizeBytes: number,
): Headers {
  return new Headers({
    "Cache-Control": "private, no-store, max-age=0, must-revalidate",
    "Content-Disposition": `attachment; filename="siteagent-version-${versionNumber}.zip"`,
    "Content-Length": String(sizeBytes),
    "Content-Type": "application/zip",
    "Cross-Origin-Resource-Policy": "same-origin",
    Expires: "0",
    Pragma: "no-cache",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
    "X-Robots-Tag": "noindex, nofollow, noarchive",
    Vary: "Cookie",
  })
}
