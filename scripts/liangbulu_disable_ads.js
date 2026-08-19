/**
 * App: 两步路
 * Purpose: 关闭开屏和插屏广告
 * Updated: 2026-08-06
 */
const body = $response.body;

if (!body) {
  console.log("两步路广告：响应正文为空");
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

      if (splashAd && typeof splashAd === "object") {
        splashAd.on = false;
        splashAd.dailyMaxDisplayCount = 0;
        splashAd.adList = [];

        if (splashAd.hotStart && typeof splashAd.hotStart === "object") {
          splashAd.hotStart.on = false;
        }

        changed = true;
        console.log("两步路广告：开屏配置已关闭");
      }

      if (interstitialAd && typeof interstitialAd === "object") {
        interstitialAd.on = false;
        interstitialAd.dailyMaxDisplayCount = 0;

        if (
          interstitialAd.hotStart &&
          typeof interstitialAd.hotStart === "object"
        ) {
          interstitialAd.hotStart.on = false;
        }

        changed = true;
        console.log("两步路广告：插屏配置已关闭");
      }

      if (!changed) {
        console.log("两步路广告：配置响应未命中预期结构");
      }
    } else if (/\/getSplash(?:\?|$)/.test(url) && Array.isArray(obj?.infos)) {
      const hadContent = obj.infos.length > 0;
      obj.infos = [];
      changed = true;

      console.log(
        `两步路广告：开屏内容${hadContent ? "已清空" : "保持为空"}`
      );
    } else {
      console.log("两步路广告：响应未命中预期结构");
    }

    $done(changed ? { body: JSON.stringify(obj) } : {});
  } catch (error) {
    console.log("两步路广告：响应解析失败");
    $done({});
  }
}
