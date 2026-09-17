// Updated: 2026-09-17
// 课后插屏入口及自有视频推广清单；未知结构原样放行。
// 不修改会员、奖励、学习进度或广告 SDK；日志计数不代表真机播放结果。
(function () {
  var prefix = "多邻国课后[v4-test]：";
  var result = {};
  var recoveredErrorSuffix = false;
  var label = "已有广告入口";
  var stage = "响应";
  var isObject = function (value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
  };
  var isPromoVideo = function (url) {
    return typeof url === "string" &&
      /^https:\/\/simg-ssl\.duolingo\.(?:com|cn)\/videos\/promo\/DuolingoInterstitial_[^/?#]+\.mp4(?:\?|$)/.test(url);
  };
  // 仅处理本次抓包确认的自动课后广告种类，不匹配奖励广告。
  var isSessionEndPromotion = function (item) {
    return isObject(item) &&
      (item.type === "NETWORK_INTERSTITIAL_SESSION_END" || item.type === "PLUS_SESSION_END");
  };
  var knownKeys = function (obj, keys) {
    return Object.keys(obj).every(function (key) { return keys.indexOf(key) !== -1; });
  };
  // 捕获中出现完整 JSON 后拼接 Tengine 400 错误页。只识别这一完整形态，
  // 不接受任意尾部、第二份 JSON、其他状态或被截断的正文。
  var parseResponse = function (text) {
    try {
      return JSON.parse(text);
    } catch (error) {
      if (typeof text !== "string" || $response.status !== 200) throw error;
      var marker = "HTTP/1.1 400 Bad Request\r\n";
      var offset = text.lastIndexOf(marker);
      if (offset <= 0 || text.length - offset > 2048) throw error;
      var suffix = text.slice(offset);
      var knownError = /^HTTP\/1\.1 400 Bad Request\r\nServer: Tengine\r\nDate: (?:Mon|Tue|Wed|Thu|Fri|Sat|Sun), \d{1,2} [A-Za-z]{3} \d{4} \d{2}:\d{2}:\d{2} GMT\r\nContent-Type: text\/html\r\nConnection: close\r\n\r\n<!DOCTYPE HTML PUBLIC "-\/\/IETF\/\/DTD HTML 2\.0\/\/EN">\s*<html>\s*<head>\s*<title>400 Bad Request<\/title>\s*<\/head>\s*<body>\s*<center>\s*<h1>400 Bad Request<\/h1>\s*<\/center>\s*<hr\s*\/?>\s*Powered by Tengine\s*<hr\s*\/?>\s*<center>Tengine<\/center>\s*<\/body>\s*<\/html>\s*$/i;
      if (!knownError.test(suffix)) throw error;
      var object = JSON.parse(text.slice(0, offset));
      if (!isObject(object)) throw error;
      recoveredErrorSuffix = true;
      return object;
    }
  };
  try {
    var legacy = /^https:\/\/ios-api-2\.duolingo\.cn\/2021-05-05\/plus-promotions\/decisions\/[0-9]+\/?(?:\?|$)/;
    var centralized = /^https:\/\/ios-api-2\.duolingo\.cn\/plus-promotions\/ml-predictions\/centralized-decision\/?(?:\?|$)/;
    var target = /^https:\/\/ios-api-2\.duolingo\.cn\/2023-05-23\/messaging\/get-messages\/?(?:\?|$)/;
    var fallback = /^https:\/\/ios-api-2\.duolingo\.cn\/2026-03-09\/plus-promotions\/get-fallback-ads\/?(?:\?|$)/;
    var videos = /^https:\/\/ios-api-2\.duolingo\.cn\/2026-03-06\/plus-promotions\/get-ad-urls\/?(?:\?|$)/;
    if (legacy.test($request.url) || centralized.test($request.url)) {
      var isLegacy = legacy.test($request.url);
      label = isLegacy ? "旧版课后决策" : "集中课后视频决策";
      // 请求场景与响应广告标记必须同时成立；缺少请求体时不能猜测场景。
      if ($request.method !== "POST" || $response.status !== 200) {
        console.log(prefix + label + "方法或状态不匹配，已原样放行");
      } else if (typeof $request.body !== "string" || !$request.body) {
        console.log(prefix + label + "缺少可识别请求体，已原样放行");
      } else {
        stage = "请求";
        var requestData = JSON.parse($request.body);
        var scene = isObject(requestData) ?
          (isLegacy ? requestData.appLocation :
            (isObject(requestData.clientParams) ? requestData.clientParams.plusPromotionAdType : undefined)) : undefined;
        var expectedScene = isLegacy ? "SESSION_END" : "session-end-interstitial";
        if (scene !== expectedScene) {
          console.log(prefix + label +
            (scene === "SESSION_START" || scene === "rewarded-video" ? "非自动课后场景，已原样放行" : "请求场景未匹配，已原样放行"));
        } else if ($response.body === "") {
          console.log(prefix + label + "未返回广告决策，已原样放行");
        } else if (typeof $response.body !== "string") {
          console.log(prefix + label + "响应类型不匹配，已原样放行");
        } else {
          stage = "响应";
          var decision = parseResponse($response.body);
          if (isLegacy) {
            if (!isObject(decision) || !Array.isArray(decision.promotions)) {
              console.log(prefix + label + "响应结构不匹配，已原样放行");
            } else {
              var networkCount = 0;
              var ownCount = 0;
              var promotions = decision.promotions.filter(function (item) {
                if (!isSessionEndPromotion(item)) return true;
                if (item.type === "NETWORK_INTERSTITIAL_SESSION_END") networkCount++;
                else ownCount++;
                return false;
              });
              if (networkCount + ownCount > 0) {
                decision.promotions = promotions;
                result = { body: JSON.stringify(decision) };
                console.log(prefix + label + "已移除第三方插屏决策 " + networkCount +
                  " 项、自有推广决策 " + ownCount + " 项，保留 " + promotions.length + " 项");
              } else {
                console.log(prefix + label + "未发现明确课后广告，保留 " + promotions.length + " 项");
              }
            }
          } else {
            var decisions = isObject(decision) ? decision.decisions : null;
            var enriched = isObject(decisions) ? decisions.enriched : null;
            var general = isObject(decisions) ? decisions.general : null;
            // 整个响应为空是本接口实际出现过的无决策形态。
            // 只在完整响应属于一个已确认课后视频决策时使用；混合/新增结构一律保留。
            if (!isObject(decision) || !knownKeys(decision, ["decisions", "trackingProperties"]) ||
                (Object.prototype.hasOwnProperty.call(decision, "trackingProperties") && decision.trackingProperties !== null) ||
                !isObject(decisions) || !knownKeys(decisions, ["general", "enriched"]) ||
                !isObject(general) || !knownKeys(general, ["result", "contextTrackingProperties"]) ||
                typeof general.result !== "string" || !isObject(enriched) ||
                !knownKeys(enriched, ["stringID", "variantClass", "contextTrackingProperties",
                  "adStartBackgroundColor", "videoURL", "madJsonURL", "isModular", "iconStyle",
                  "offerOrigin", "shouldHideCloseButton", "standardButtonsState", "madWrapper",
                  "madWorldCharacters", "numWorldCharacters", "madValuePropositions"]) ||
                enriched.stringID !== general.result || enriched.madJsonURL !== null) {
              console.log(prefix + label + "响应结构不匹配，已原样放行");
            } else if (enriched.variantClass === "StaticDuolingoVideoVariant" &&
                (enriched.offerOrigin === "INTERSTITIAL_PLUS_VIDEO" || enriched.offerOrigin === "INTERSTITIAL_PLUS_VIDEO_FAMILY_PLAN") &&
                isPromoVideo(enriched.videoURL)) {
              result = { body: "" };
              console.log(prefix + label + "已移除自有推广决策 1 项，返回空决策响应");
            } else {
              console.log(prefix + label + "未发现可确认的课后视频，已原样放行");
            }
          }
        }
      }
    } else if (fallback.test($request.url) || videos.test($request.url)) {
      var isFallback = fallback.test($request.url);
      label = isFallback ? "备用视频推广" : "自有视频推广";
      var promo = parseResponse($response.body);
      if (!promo || typeof promo !== "object" ||
          (isFallback ? !Array.isArray(promo.ads) :
          (!promo.ads || typeof promo.ads !== "object" || Array.isArray(promo.ads)))) {
        console.log(prefix + label + "结构不匹配，已原样放行");
      } else {
        var count = 0;
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
      label = "课后消息入口";
      var data = parseResponse($response.body);
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
    console.log(prefix + label + stage + "解析或处理失败，已原样放行");
  }
  if (recoveredErrorSuffix) {
    console.log(prefix + "识别到 JSON 后拼接的 400 错误页；" +
      (Object.prototype.hasOwnProperty.call(result, "body") ? "已按广告标记处理前段 JSON" : "未修改原响应"));
  }
  $done(result);
})();
