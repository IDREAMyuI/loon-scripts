const body = $response.body;

if (!body) {
  console.log("两步路开屏：响应正文为空");
  $done({});
} else {
  try {
    const obj = JSON.parse(body);
    const url = $request.url || "";
    let changed = false;

    if (/\/adConfig\/get(?:\?|$)/.test(url)) {
      const splashAd = obj?.data?.splashAd;

      if (splashAd && typeof splashAd === "object") {
        splashAd.on = false;
        splashAd.dailyMaxDisplayCount = 0;
        splashAd.adList = [];

        if (splashAd.hotStart && typeof splashAd.hotStart === "object") {
          splashAd.hotStart.on = false;
        }

        changed = true;
      }
    } else if (/\/getSplash(?:\?|$)/.test(url) && Array.isArray(obj?.infos)) {
      obj.infos = [];
      changed = true;
    }

    console.log(`两步路开屏：${changed ? "已处理" : "未命中预期结构"}`);
    $done(changed ? { body: JSON.stringify(obj) } : {});
  } catch (error) {
    console.log("两步路开屏：响应解析失败");
    $done({});
  }
}
