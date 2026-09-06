/**
 * App: 微博
 * Purpose: 移除实时、预加载和缓存开屏广告，并过滤推荐信息流中的明确广告项
 * Updated: 2026-08-19
 */
const body = $response.body;
const url = $request.url || "";

const LOG = {
  realtimeEmpty: "\u5fae\u535a\u5f00\u5c4f\uff1a\u5b9e\u65f6\u54cd\u5e94\u6b63\u6587\u4e3a\u7a7a\u6216\u975e\u4e8c\u8fdb\u5236\uff0c\u5df2\u539f\u6837\u653e\u884c",
  realtimeNoAd: "\u5fae\u535a\u5f00\u5c4f\uff1a\u5b9e\u65f6\u54cd\u5e94\u672a\u5305\u542b\u5e7f\u544a",
  realtimeFailed: "\u5fae\u535a\u5f00\u5c4f\uff1a\u5b9e\u65f6\u54cd\u5e94\u89e3\u6790\u5931\u8d25\uff0c\u5df2\u539f\u6837\u653e\u884c",
  jsonEmpty: "\u5fae\u535a\u5e7f\u544a\uff1aJSON \u54cd\u5e94\u6b63\u6587\u4e3a\u7a7a\u6216\u7c7b\u578b\u4e0d\u5339\u914d\uff0c\u5df2\u539f\u6837\u653e\u884c",
  structureMismatch: "\u5fae\u535a\u5e7f\u544a\uff1a\u54cd\u5e94\u7ed3\u6784\u4e0d\u5339\u914d\uff0c\u5df2\u539f\u6837\u653e\u884c",
  jsonFailed: "\u5fae\u535a\u5e7f\u544a\uff1aJSON \u54cd\u5e94\u89e3\u6790\u5931\u8d25\uff0c\u5df2\u539f\u6837\u653e\u884c"
};

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key);
}

function isConfirmedFeedAd(item) {
  const data = item?.data;
  if (!isObject(data)) return false;

  const explicitAd = data.is_ad === 1 || data.is_ad === "1" || data.is_ad === true;
  const hasAdObject = isObject(data.ad_object);
  const hasAdActions = isObject(data.ad_actionlogs);
  const hasAdState = hasOwn(data, "ad_state");
  const hasExtendedAd = isObject(data.extend_info?.ad);

  return explicitAd || (hasAdObject && (hasAdActions || hasAdState || hasExtendedAd));
}

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

function handleRealtimeSplash() {
  if (!(body instanceof Uint8Array) || body.length === 0) {
    console.log(LOG.realtimeEmpty);
    $done({});
    return;
  }

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
      if (headerEnd < 0 || headerEnd >= partEnd) throw new Error("invalid multipart part");

      const headers = decoder.decode(body.slice(partStart, headerEnd));
      const partBody = body.slice(headerEnd + separator.length, partEnd);
      const partName = /name="([^"]+)"/i.exec(headers)?.[1] || "";

      if (partName === "realtime") {
        const obj = JSON.parse(decoder.decode(partBody));
        if (!isObject(obj)) throw new Error("unexpected realtime structure");

        if (!hasOwn(obj, "ads")) {
          if (!hasOwn(obj, "code")) throw new Error("unexpected realtime structure");
          keptParts.push(
            concatBytes([
              boundary,
              encoder.encode("\r\n"),
              body.slice(partStart, partEnd),
              encoder.encode("\r\n")
            ])
          );
        } else {
          if (!Array.isArray(obj.ads)) throw new Error("unexpected realtime ads");

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
        }
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
      console.log(LOG.realtimeNoAd);
      $done({});
    } else {
      keptParts.push(boundary, trailing);
      console.log(`\u5fae\u535a\u5f00\u5c4f\uff1a\u5b9e\u65f6\u5e7f\u544a\u5df2\u6e05\u7a7a\uff08${matched}\u6761\uff0c\u79fb\u9664\u7d20\u6750${removedAssets}\u4e2a\uff09`);
      $done({ body: concatBytes(keptParts) });
    }
  } catch (error) {
    console.log(LOG.realtimeFailed);
    $done({});
  }
}

function handleJsonResponse() {
  if (!body || typeof body !== "string") {
    console.log(LOG.jsonEmpty);
    $done({});
    return;
  }

  try {
    const obj = JSON.parse(body);

    if (/\/v2\/ad\/preload(?:\?|$)/.test(url) && Array.isArray(obj?.ads)) {
      const count = obj.ads.length;
      obj.ads = [];
      console.log(`\u5fae\u535a\u5f00\u5c4f\uff1a\u9884\u52a0\u8f7d\u5df2\u6e05\u7a7a\uff08${count}\u6761\uff09`);
      $done({ body: JSON.stringify(obj) });
    } else if (
      /\/wbapplua\/wbpullad\.lua(?:\?|$)/.test(url) &&
      Array.isArray(obj?.cached_ad?.ads)
    ) {
      const count = obj.cached_ad.ads.length;
      obj.cached_ad.ads = [];
      console.log(`\u5fae\u535a\u5f00\u5c4f\uff1a\u7f13\u5b58\u5df2\u6e05\u7a7a\uff08${count}\u6761\uff09`);
      $done({ body: JSON.stringify(obj) });
    } else if (
      /\/2\/statuses\/container_timeline_hot(?:\?|$)/.test(url) &&
      Array.isArray(obj?.items)
    ) {
      const originalCount = obj.items.length;
      obj.items = obj.items.filter((item) => !isConfirmedFeedAd(item));
      const removedCount = originalCount - obj.items.length;

      if (removedCount > 0) {
        console.log(`\u5fae\u535a\u4fe1\u606f\u6d41\uff1a\u5df2\u79fb\u9664\u5e7f\u544a\uff08${removedCount}\u6761\uff0c\u4fdd\u7559${obj.items.length}\u6761\uff09`);
        $done({ body: JSON.stringify(obj) });
      } else {
        console.log(`\u5fae\u535a\u4fe1\u606f\u6d41\uff1a\u68c0\u67e5\u5b8c\u6210\uff0c\u672a\u53d1\u73b0\u53ef\u786e\u8ba4\u5e7f\u544a\uff08\u4fdd\u7559${originalCount}\u6761\uff09`);
        $done({});
      }
    } else {
      console.log(LOG.structureMismatch);
      $done({});
    }
  } catch (error) {
    console.log(LOG.jsonFailed);
    $done({});
  }
}

if (/\/v3\/ad\/realtime(?:\?|$)/.test(url)) {
  handleRealtimeSplash();
} else {
  handleJsonResponse();
}

