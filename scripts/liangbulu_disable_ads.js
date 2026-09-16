/**
 * App: 两步路
 * Purpose: 关闭开屏和插屏广告
 * Updated: 2026-09-16
 */
(function () {
  const body = $response.body;

  const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
  const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
  const target = /^https:\/\/helper\.2bulu\.com\/(?:adConfig\/get|getSplash)(?:\?|$)/;

  if (!target.test($request.url || "")) {
    console.log("两步路广告：接口不匹配，已原样放行");
    $done({});
  } else if (!body || typeof body !== "string") {
    console.log("两步路广告：响应正文为空或类型不匹配，已原样放行");
    $done({});
  } else {
    try {
      const obj = JSON.parse(body);
      const url = $request.url || "";
      let changed = false;

      if (/\/adConfig\/get(?:\?|$)/.test(url)) {
        const data = obj?.data;
        const splashAd = data?.splashAd;
        const interstitialAd = data?.interstitialAd;

        const validAd = (ad, splash) => isObject(ad) && typeof ad.on === "boolean" &&
          typeof ad.dailyMaxDisplayCount === "number" && (!splash || Array.isArray(ad.adList)) &&
          (!has(ad, "hotStart") || (isObject(ad.hotStart) && typeof ad.hotStart.on === "boolean"));
        if (!isObject(obj) || !isObject(data) ||
            (!has(data, "splashAd") && !has(data, "interstitialAd")) ||
            (has(data, "splashAd") && !validAd(splashAd, true)) ||
            (has(data, "interstitialAd") && !validAd(interstitialAd, false))) {
          console.log("两步路广告：配置响应结构不匹配，已原样放行");
          $done({});
          return;
        }
        if (isObject(splashAd)) {
          const before = JSON.stringify(splashAd);
          const removed = splashAd.adList.length;
          splashAd.on = false;
          splashAd.dailyMaxDisplayCount = 0;
          splashAd.adList = [];

          if (splashAd.hotStart && typeof splashAd.hotStart === "object") {
            splashAd.hotStart.on = false;
          }

          const modified = before !== JSON.stringify(splashAd);
          changed = changed || modified;
          console.log(modified ? `两步路开屏：配置已关闭，清空列表 ${removed} 项` : "两步路开屏：未发现需修改的配置");
        }

        if (isObject(interstitialAd)) {
          const before = JSON.stringify(interstitialAd);
          interstitialAd.on = false;
          interstitialAd.dailyMaxDisplayCount = 0;

          if (
            interstitialAd.hotStart &&
            typeof interstitialAd.hotStart === "object"
          ) {
            interstitialAd.hotStart.on = false;
          }

          const modified = before !== JSON.stringify(interstitialAd);
          changed = changed || modified;
          console.log(modified ? "两步路插屏：配置已关闭" : "两步路插屏：未发现需修改的配置");
        }
      } else if (/\/getSplash(?:\?|$)/.test(url) && isObject(obj) && Array.isArray(obj.infos)) {
        const count = obj.infos.length;
        obj.infos = [];
        changed = count > 0;

        console.log(
          count > 0 ? `两步路开屏内容：已移除 ${count} 项，保留 0 项` : "两步路开屏内容：未发现广告，已原样放行"
        );
      } else {
        console.log("两步路广告：响应结构不匹配，已原样放行");
      }

      $done(changed ? { body: JSON.stringify(obj) } : {});
    } catch (error) {
      console.log("两步路广告：响应解析失败，已原样放行");
      $done({});
    }
  }

})();
