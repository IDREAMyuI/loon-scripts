// Updated: 2026-09-15
// 课后插屏入口及自有视频推广清单；未知结构原样放行。
// 不修改会员、奖励、学习进度或广告 SDK；日志计数不代表真机播放结果。
(function () {
  var prefix = "多邻国课后[v2]：";
  var result = {};
  try {
    var target = /^https:\/\/ios-api-2\.duolingo\.cn\/2023-05-23\/messaging\/get-messages\/?(?:\?|$)/;
    var fallback = /^https:\/\/ios-api-2\.duolingo\.cn\/2026-03-09\/plus-promotions\/get-fallback-ads\/?(?:\?|$)/;
    var videos = /^https:\/\/ios-api-2\.duolingo\.cn\/2026-03-06\/plus-promotions\/get-ad-urls\/?(?:\?|$)/;
    if (fallback.test($request.url) || videos.test($request.url)) {
      var promo = JSON.parse($response.body);
      var isFallback = fallback.test($request.url);
      var label = isFallback ? "备用视频推广" : "自有视频推广";
      if (!promo || typeof promo !== "object" ||
          (isFallback ? !Array.isArray(promo.ads) :
          (!promo.ads || typeof promo.ads !== "object" || Array.isArray(promo.ads)))) {
        console.log(prefix + label + "结构不匹配，已原样放行");
      } else {
        var count = 0;
        var isPromoVideo = function (url) {
          return typeof url === "string" &&
            /^https:\/\/simg-ssl\.duolingo\.(?:com|cn)\/videos\/promo\/DuolingoInterstitial_[^/?#]+\.mp4(?:\?|$)/.test(url);
        };
        if (isFallback) {
          promo.ads = promo.ads.filter(function (ad) {
            var remove = ad && ad.variantClass === "StaticDuolingoVideoVariant" &&
              (ad.offerOrigin === "INTERSTITIAL_PLUS_VIDEO" ||
               ad.offerOrigin === "INTERSTITIAL_PLUS_VIDEO_FAMILY_PLAN") && isPromoVideo(ad.videoURL);
            if (remove) count++;
            return !remove;
          });
        } else {
          Object.keys(promo.ads).forEach(function (key) {
            if (isPromoVideo(promo.ads[key])) { delete promo.ads[key]; count++; }
          });
        }
        var remaining = isFallback ? promo.ads.length : Object.keys(promo.ads).length;
        if (count) {
          result = { body: JSON.stringify(promo) };
          console.log(prefix + label + "已移除 " + count + " 项，保留 " + remaining + " 项");
        } else {
          console.log(prefix + label + "无可识别项目，保留 " + remaining + " 项");
        }
      }
    } else if (!target.test($request.url)) {
      console.log(prefix + "接口不匹配，已原样放行");
    } else {
      var data = JSON.parse($response.body);
      if (!data || typeof data !== "object" || !Array.isArray(data.sessionEndMessageDisplayInfo)) {
        console.log(prefix + "响应结构不匹配，已原样放行");
      } else {
        var items = data.sessionEndMessageDisplayInfo;
        var kept = items.filter(function (item) {
          var id = item && item.sessionEndMessageId;
          return !(id && typeof id === "object" && !Array.isArray(id) &&
            Object.keys(id).length === 1 &&
            Object.prototype.hasOwnProperty.call(id, "interstitialAd") &&
            id.interstitialAd !== null && typeof id.interstitialAd === "object" &&
            !Array.isArray(id.interstitialAd));
        });
        var removed = items.length - kept.length;
        if (removed > 0) {
          data.sessionEndMessageDisplayInfo = kept;
          result = { body: JSON.stringify(data) };
          console.log(prefix + "已移除插屏入口 " + removed + " 项，保留其他项目 " + kept.length + " 项");
        } else {
          console.log(prefix + "未发现可识别的插屏入口，保留 " + items.length + " 项");
        }
      }
    }
  } catch (_) {
    console.log(prefix + "响应解析或处理失败，已原样放行");
  }
  $done(result);
})();
