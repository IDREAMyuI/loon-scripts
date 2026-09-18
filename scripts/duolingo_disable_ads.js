// Updated: 2026-09-18
// 临时诊断：不解析、不记录正文，不修改响应。
(function () {
  var prefix = "多邻国诊断[d1]：";
  console.log(prefix + "开始");
  function probe(label, read) {
    try {
      var value = read();
      console.log(prefix + label + (typeof value === "undefined" ? "缺失" : "读取成功"));
    } catch (_) {
      console.log(prefix + label + "读取异常");
    }
  }
  probe("请求体", function () { return $request.body; });
  probe("响应体", function () { return $response.body; });
  console.log(prefix + "准备原样放行");
  $done({});
})();
