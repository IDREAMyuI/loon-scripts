const body = $response.body;

function indexOfBytes(source, target, from = 0) {
  if (!(source instanceof Uint8Array) || !(target instanceof Uint8Array)) return -1;
  if (target.length === 0) return Math.min(from, source.length);

  outer: for (let i = Math.max(0, from); i <= source.length - target.length; i++) {
    for (let j = 0; j < target.length; j++) {
      if (source[i + j] !== target[j]) continue outer;
    }
    return i;
  }
  return -1;
}

function concatBytes(parts) {
  const length = parts.reduce((total, part) => total + part.length, 0);
  const output = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
}

function headerValue(headers, name) {
  if (!headers || typeof headers !== "object") return "";
  const wanted = name.toLowerCase();
  const key = Object.keys(headers).find((item) => item.toLowerCase() === wanted);
  return key ? String(headers[key]) : "";
}

if (!(body instanceof Uint8Array) || body.length === 0) {
  console.log("微博开屏：实时响应正文为空或非二进制");
  $done({});
} else {
  try {
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();
    const contentType = headerValue($response.headers, "content-type");
    const boundaryMatch = /boundary=(?:"([^"]+)"|([^;\s]+))/i.exec(contentType);
    const boundaryName = boundaryMatch?.[1] || boundaryMatch?.[2] || "";
    const boundary = encoder.encode(`--${boundaryName}`);
    const separator = encoder.encode("\r\n\r\n");
    const trailing = encoder.encode("--\r\n");

    if (!boundaryName || indexOfBytes(body, boundary) !== 0) {
      throw new Error("invalid multipart boundary");
    }

    const keptParts = [];
    let cursor = 0;
    let matched = 0;
    let removedAssets = 0;

    while (cursor < body.length) {
      const boundaryStart = indexOfBytes(body, boundary, cursor);
      if (boundaryStart < 0) break;
      const afterBoundary = boundaryStart + boundary.length;

      if (body[afterBoundary] === 45 && body[afterBoundary + 1] === 45) break;

      const partStart =
        body[afterBoundary] === 13 && body[afterBoundary + 1] === 10
          ? afterBoundary + 2
          : afterBoundary;
      const nextBoundary = indexOfBytes(body, boundary, partStart);
      if (nextBoundary < 0) throw new Error("unterminated multipart part");

      let partEnd = nextBoundary;
      if (body[partEnd - 2] === 13 && body[partEnd - 1] === 10) partEnd -= 2;

      const headerEnd = indexOfBytes(body, separator, partStart);
      if (headerEnd < 0 || headerEnd >= partEnd) {
        throw new Error("invalid multipart part");
      }

      const headers = decoder.decode(body.slice(partStart, headerEnd));
      const partBody = body.slice(headerEnd + separator.length, partEnd);
      const nameMatch = /name="([^"]+)"/i.exec(headers);
      const partName = nameMatch?.[1] || "";

      if (partName === "realtime") {
        const obj = JSON.parse(decoder.decode(partBody));
        if (!Array.isArray(obj?.ads)) throw new Error("unexpected realtime structure");

        matched = obj.ads.length;
        obj.ads = [];
        keptParts.push(
          concatBytes([
            boundary,
            encoder.encode("\r\n"),
            body.slice(partStart, headerEnd + separator.length),
            encoder.encode(JSON.stringify(obj)),
            encoder.encode("\r\n")
          ])
        );
      } else if (/^res_multipart_key_/i.test(partName)) {
        removedAssets += 1;
      } else {
        keptParts.push(
          concatBytes([
            boundary,
            encoder.encode("\r\n"),
            body.slice(partStart, partEnd),
            encoder.encode("\r\n")
          ])
        );
      }

      cursor = nextBoundary;
    }

    if (matched === 0 && removedAssets === 0) {
      console.log("微博开屏：实时响应未包含广告");
      $done({});
    } else {
      keptParts.push(boundary, trailing);
      console.log(
        `微博开屏：实时广告已清空（${matched}条，移除素材${removedAssets}个）`
      );
      $done({ body: concatBytes(keptParts) });
    }
  } catch (error) {
    console.log("微博开屏：实时响应解析失败");
    $done({});
  }
}
