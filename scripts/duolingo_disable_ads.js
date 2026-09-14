// Updated: 2026-09-14
// 多邻国课后插屏：只过滤 get-messages 中单一类型的 interstitialAd 入口。
// 不修改会员、奖励、学习进度或广告 SDK；日志计数不代表真机播放结果。
(function () {
  var prefix = "多邻国课后：";
  var result = {};
  try {
    var target = /^https:\/\/ios-api-2\.duolingo\.cn\/2023-05-23\/messaging\/get-messages\/?(?:\?|$)/;
    if (!target.test($request.url)) {
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
