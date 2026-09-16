/**
 * App: 微博
 * Purpose: 移除实时、预加载和缓存开屏广告，并过滤推荐信息流中的明确广告项
 * Updated: 2026-09-16
 */
const body = $response.body;
const url = $request.url || "";

const LOG = {
  realtimeEmpty: "微博开屏：实时响应正文为空或非二进制，已原样放行",
  realtimeNoAd: "微博开屏：实时响应未包含广告",
  realtimeFailed: "微博开屏：实时响应解析失败，已原样放行"
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
    const decoder = new TextDecoder("utf-8", { fatal: true });
    const contentType = headerValue($response.headers, "content-type");
    const match = /boundary=(?:"([^"]+)"|([^;\s]+))/i.exec(contentType);
    const name = match?.[1] || match?.[2] || "";
    const failStructure = () => { throw new Error("structure"); };
    if (!/^multipart\//i.test(contentType) || !name || /[\r\n]/.test(name)) failStructure();
    const boundary = encoder.encode(`--${name}`);
    const marker = encoder.encode(`\r\n--${name}`);
    const separator = encoder.encode("\r\n\r\n");
    if (indexOfBytes(body, boundary) !== 0) failStructure();
    const parts = [];
    let cursor = 0;
    let closed = false;
    while (cursor < body.length) {
      const after = cursor + boundary.length;
      if (body[after] === 45 && body[after + 1] === 45) {
        const end = after + 2;
        if (end !== body.length && !(end + 2 === body.length && body[end] === 13 && body[end + 1] === 10)) failStructure();
        closed = true;
        break;
      }
      if (body[after] !== 13 || body[after + 1] !== 10) failStructure();
      const start = after + 2;
      let next = indexOfBytes(body, marker, start);
      // 二进制素材中的相似字节不是合法边界。
      while (next >= 0) {
        const suffix = next + marker.length;
        if ((body[suffix] === 13 && body[suffix + 1] === 10) ||
            (body[suffix] === 45 && body[suffix + 1] === 45)) break;
        next = indexOfBytes(body, marker, next + 1);
      }
      if (next < 0) failStructure();
      const headerEnd = indexOfBytes(body, separator, start);
      if (headerEnd < 0 || headerEnd >= next) failStructure();
      const headers = decoder.decode(body.slice(start, headerEnd));
      const disposition = headers.split("\r\n").find((line) => /^content-disposition:/i.test(line)) || "";
      const partName = /(?:^|;)\s*name="([^"]+)"/i.exec(disposition)?.[1] || "";
      if (!partName || parts.some((part) => part.name === partName)) failStructure();
      parts.push({ name: partName, raw: body.slice(cursor, next + 2),
        head: body.slice(cursor, headerEnd + separator.length),
        value: body.slice(headerEnd + separator.length, next) });
      cursor = next + 2;
    }
    if (!closed) failStructure();
    const realtime = parts.filter((part) => part.name === "realtime");
    if (realtime.length !== 1) failStructure();
    const target = realtime[0];
    const obj = JSON.parse(decoder.decode(target.value));
    if (!isObject(obj)) failStructure();
    if (!hasOwn(obj, "ads")) {
      if (!hasOwn(obj, "code")) failStructure();
      console.log(LOG.realtimeNoAd);
      $done({});
      return;
    }
    if (!Array.isArray(obj.ads) || !obj.ads.every(isObject)) failStructure();
    const count = obj.ads.length;
    if (!count) {
      console.log(LOG.realtimeNoAd);
      $done({});
      return;
    }
    // 只使用广告对象内完整字符串与 part 名称的精确对应，不推断未知字段或拼接标识。
    const references = (value, result = new Set()) => {
      if (typeof value === "string" && /^res_multipart_key_/.test(value)) result.add(value);
      else if (Array.isArray(value)) value.forEach((item) => references(item, result));
      else if (isObject(value)) Object.values(value).forEach((item) => references(item, result));
      return result;
    };
    const adRefs = references(obj.ads);
    const otherFields = Object.fromEntries(Object.entries(obj).filter(([key]) => key !== "ads"));
    const protectedRefs = references(otherFields);
    // 其他非素材 part 可能共享素材；无法解释其结构时保留所有素材。
    let unknownOtherPart = false;
    for (const part of parts) {
      if (part !== target && !/^res_multipart_key_/i.test(part.name)) {
        try { references(JSON.parse(decoder.decode(part.value)), protectedRefs); }
        catch (_) { unknownOtherPart = true; }
      }
    }
    obj.ads = [];
    let removed = 0;
    const kept = [];
    for (const part of parts) {
      if (part === target) {
        kept.push(concatBytes([part.head, encoder.encode(JSON.stringify(obj)), encoder.encode("\r\n")]));
      } else if (!unknownOtherPart && adRefs.has(part.name) && !protectedRefs.has(part.name)) {
        removed++;
      } else {
        kept.push(part.raw);
      }
    }
    kept.push(body.slice(cursor));
    const output = concatBytes(kept);
    const retained = parts.filter((part) => /^res_multipart_key_/i.test(part.name)).length - removed;
    console.log(`微博实时开屏：已移除广告 ${count} 条，移除明确关联素材 ${removed} 个，保留素材 ${retained} 个`);
    $done({ body: output });
  } catch (error) {
    console.log(error?.message === "structure" ? "微博实时开屏：响应结构不匹配，已原样放行" : LOG.realtimeFailed);
    $done({});
  }
}

function handleJsonResponse() {
  const label = /\/v2\/ad\/preload(?:\?|$)/.test(url) ? "微博预加载开屏：" :
    /\/wbapplua\/wbpullad\.lua(?:\?|$)/.test(url) ? "微博缓存开屏响应：" : "微博信息流：";
  if (!body || typeof body !== "string") {
    console.log(label + "正文为空或类型不匹配，已原样放行");
    $done({});
    return;
  }

  try {
    const obj = JSON.parse(body);

    if (/\/v2\/ad\/preload(?:\?|$)/.test(url) && Array.isArray(obj?.ads)) {
      const count = obj.ads.length;
      if (count === 0) {
        console.log("微博预加载开屏：未发现广告，已原样放行");
        $done({});
      } else {
        obj.ads = [];
        console.log(`微博预加载开屏：已移除 ${count} 条，保留 0 条`);
        $done({ body: JSON.stringify(obj) });
      }
    } else if (
      /\/wbapplua\/wbpullad\.lua(?:\?|$)/.test(url) &&
      Array.isArray(obj?.cached_ad?.ads)
    ) {
      const count = obj.cached_ad.ads.length;
      if (count === 0) {
        console.log("微博缓存开屏响应：未发现广告，已原样放行");
        $done({});
      } else {
        obj.cached_ad.ads = [];
        console.log(`微博缓存开屏响应：已移除 ${count} 条，保留 0 条；仅修改网络响应`);
        $done({ body: JSON.stringify(obj) });
      }
    } else if (
      /\/2\/statuses\/container_timeline_hot(?:\?|$)/.test(url) &&
      Array.isArray(obj?.items)
    ) {
      const originalCount = obj.items.length;
      obj.items = obj.items.filter((item) => !isConfirmedFeedAd(item));
      const removedCount = originalCount - obj.items.length;

      if (removedCount > 0) {
        console.log(`微博信息流：已移除广告（${removedCount}条，保留${obj.items.length}条）`);
        $done({ body: JSON.stringify(obj) });
      } else {
        console.log(`微博信息流：检查完成，未发现可确认广告（保留${originalCount}条）`);
        $done({});
      }
    } else {
      console.log(label + "响应结构不匹配，已原样放行");
      $done({});
    }
  } catch (error) {
    console.log(label + "解析失败，已原样放行");
    $done({});
  }
}

const target = /^https:\/\/(?:bootpreload\.uve\.weibo\.com\/v2\/ad\/preload|wbapp\.uve\.weibo\.com\/wbapplua\/wbpullad\.lua|bootrealtime\.uve\.weibo\.com\/v3\/ad\/realtime|api\.weibo\.cn\/2\/statuses\/container_timeline_hot)(?:\?|$)/;
if (!target.test(url)) {
  console.log("微博广告：接口不匹配，已原样放行");
  $done({});
} else if (/\/v3\/ad\/realtime(?:\?|$)/.test(url)) {
  handleRealtimeSplash();
} else {
  handleJsonResponse();
}
