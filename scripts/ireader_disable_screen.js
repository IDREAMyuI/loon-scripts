/**
 * App: 掌阅 iReader
 * Purpose: 关闭开屏广告相关配置
 * Updated: 2026-08-05
 */
const body = $response.body;

if (!body) {
  console.log("掌阅开屏：响应正文为空");
  $done({});
} else {
  try {
    const obj = JSON.parse(body);
    const rules = obj?.body?.rules;

    let matched = 0;

    if (Array.isArray(rules)) {
      for (const item of rules) {
        if (item?.slotId !== "SCREEN") continue;

        matched += 1;
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
            appColdStart: false,
            appHotStart: false,
            rewardShow: false
          };
        }
      }
    }

    console.log(`掌阅开屏：命中 SCREEN 数量=${matched}`);

    $done({
      body: JSON.stringify(obj)
    });
  } catch (error) {
    console.log(`掌阅开屏脚本解析失败：${error}`);
    $done({});
  }
}
