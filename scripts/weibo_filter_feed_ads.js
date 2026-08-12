const body = $response.body;

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

if (!body) {
  console.log("微博信息流：响应正文为空，已原样放行");
  $done({});
} else {
  try {
    const obj = JSON.parse(body);

    if (!Array.isArray(obj?.items)) {
      console.log("微博信息流：响应结构不匹配，已原样放行");
      $done({});
    } else {
      const originalCount = obj.items.length;
      obj.items = obj.items.filter((item) => !isConfirmedFeedAd(item));
      const removedCount = originalCount - obj.items.length;

      if (removedCount > 0) {
        console.log(
          `微博信息流：已移除广告（${removedCount}条，保留${obj.items.length}条）`
        );
        $done({ body: JSON.stringify(obj) });
      } else {
        console.log(
          `微博信息流：检查完成，未发现可确认广告（保留${originalCount}条）`
        );
        $done({});
      }
    }
  } catch (error) {
    console.log("微博信息流：响应解析失败，已原样放行");
    $done({});
  }
}
