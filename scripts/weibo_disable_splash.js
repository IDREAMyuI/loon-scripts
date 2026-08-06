const body = $response.body;

if (!body) {
  console.log("微博开屏：响应正文为空");
  $done({});
} else {
  try {
    const obj = JSON.parse(body);
    const url = $request.url || "";
    let changed = false;

    if (/\/v2\/ad\/preload(?:\?|$)/.test(url) && Array.isArray(obj?.ads)) {
      const count = obj.ads.length;
      obj.ads = [];
      changed = true;

      console.log(`微博开屏：预加载已清空（${count}条）`);
    } else if (
      /\/wbapplua\/wbpullad\.lua(?:\?|$)/.test(url) &&
      Array.isArray(obj?.cached_ad?.ads)
    ) {
      const count = obj.cached_ad.ads.length;
      obj.cached_ad.ads = [];
      changed = true;

      console.log(`微博开屏：缓存已清空（${count}条）`);
    } else {
      console.log("微博开屏：响应未命中预期结构");
    }

    $done(changed ? { body: JSON.stringify(obj) } : {});
  } catch (error) {
    console.log("微博开屏：响应解析失败");
    $done({});
  }
}
