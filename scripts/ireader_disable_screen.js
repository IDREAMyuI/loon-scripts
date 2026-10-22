/**
 * App: 掌阅 iReader
 * Purpose: 关闭开屏广告相关配置
 * Updated: 2026-09-16
 */
const body = $response.body;

const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const target = /^https:\/\/saad\.ms\.zhangyue\.net\/ad\/cfg(?:\?|$)/;

if (!target.test($request.url || "")) {
  console.log("掌阅开屏：接口不匹配，已原样放行");
  $done({});
} else if (!body || typeof body !== "string") {
  console.log("掌阅开屏：响应正文为空或类型不匹配，已原样放行");
  $done({});
} else {
  try {
    const obj = JSON.parse(body);
    const rules = obj?.body?.rules;

    let matched = 0;
    let changed = 0;
    const valid = isObject(obj) && isObject(obj.body) && Array.isArray(rules) &&
      rules.every((item) => !isObject(item) || item.slotId !== "SCREEN" ||
        (Array.isArray(item.rule) &&
          (!Object.prototype.hasOwnProperty.call(item, "slotCfg") ||
            (isObject(item.slotCfg) &&
              (!Object.prototype.hasOwnProperty.call(item.slotCfg, "commonPreloadCfg") ||
                isObject(item.slotCfg.commonPreloadCfg))))));

    if (valid) {
      for (const item of rules) {
        if (item?.slotId !== "SCREEN") continue;

        matched += 1;
        const before = JSON.stringify(item);
        item.rule = [];

        if (item.slotCfg && typeof item.slotCfg === "object") {
          const cfg = item.slotCfg;

          cfg.isShowAd = false;
          cfg.triggerProbability = 0;
          cfg.isAdFree = "YES";
          cfg.isNoAds = "YES";
          cfg.screenFirstShow = "NO";
          cfg.screenColdIsOpen = "NO";
          cfg.coldStart = "NO";
          cfg.hotBootOpen = "NO";
          cfg.startVideo = 0;
          cfg.preloadSwitch = "NO";
          cfg.coldStartPreload = "NO";
          cfg.rewardPreload = "NO";
          cfg.requestType = 0;
          cfg.cacheNumber = 0;
          cfg.minCacheNumber = 0;
          cfg.isOpenAdCache = "NO";
          cfg.screenColdStartReqAdsIntervalMins = 999999;
          cfg.screenHotStartReqAdsIntervalMins = 999999;
          cfg.screenColdStartReqAdsIntervalSecs = 999999;
          cfg.screenHotStartReqAdsIntervalSecs = 999999;

          cfg.commonPreloadCfg = {
            ...cfg.commonPreloadCfg,
            appColdStart: false,
            appHotStart: false,
            rewardShow: false
          };
        }
        if (before !== JSON.stringify(item)) changed++;
      }
    }

    if (!valid) {
      console.log("掌阅开屏：响应结构不匹配，已原样放行");
      $done({});
    } else if (changed === 0) {
      console.log("掌阅开屏：未发现需修改的开屏配置，已原样放行");
      $done({});
    } else {
      console.log(`掌阅开屏：已关闭或清空开屏配置 ${changed} 项，保留非开屏项目 ${rules.length - matched} 项`);
      $done({ body: JSON.stringify(obj) });
    }
  } catch (error) {
    console.log("掌阅开屏：解析失败，已原样放行");
    $done({});
  }
}
