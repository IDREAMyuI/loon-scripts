// 人工构造样本；不读取抓包、不调用网络、不包含真实账号或广告标识。
// Run: node --test tests/duolingo.test.cjs
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'scripts/duolingo_disable_ads.js'), 'utf8');
const plugin = fs.readFileSync(path.join(root, 'plugins/duolingo_ads.lpx'), 'utf8');
const host = 'https://ios-api-2.duolingo.cn';
const legacy = host + '/2021-05-05/plus-promotions/decisions/1/';
const central = host + '/plus-promotions/ml-predictions/centralized-decision';
const messages = host + '/2023-05-23/messaging/get-messages/';
const fallback = host + '/2026-03-09/plus-promotions/get-fallback-ads/';
const videos = host + '/2026-03-06/plus-promotions/get-ad-urls/';
const promoURL = 'https://simg-ssl.duolingo.com/videos/promo/DuolingoInterstitial_synthetic.mp4';
const legacyRequest = { appLocation: 'SESSION_END', supportedPromotionTypes: ['NETWORK_INTERSTITIAL_SESSION_END', 'PLUS_SESSION_END'] };
const centralRequest = { clientParams: { plusPromotionAdType: 'session-end-interstitial' } };
function response() {
  return { decisions: { general: { result: 'synthetic', contextTrackingProperties: {} },
    enriched: { stringID: 'synthetic', variantClass: 'StaticDuolingoVideoVariant',
      offerOrigin: 'INTERSTITIAL_PLUS_VIDEO', videoURL: promoURL, madJsonURL: null } }, trackingProperties: null };
}
function invoke(url, body, requestBody, overrides = {}) {
  const logs = []; const results = [];
  const encode = (value) => typeof value === 'string' || value === undefined || value instanceof Uint8Array ? value : JSON.stringify(value);
  const req = { url, method: 'POST', body: encode(requestBody) };
  const res = { status: 200, body: encode(body), headers: {} };
  Object.assign(req, overrides.request); Object.assign(res, overrides.response);
  vm.runInNewContext(source, { $request: req, $response: res,
    console: { log: (message) => logs.push(String(message)) }, $done: (result) => results.push(result) }, { timeout: 1000 });
  assert.equal(results.length, 1);
  const log = logs.join('\n');
  assert(!log.includes('SYNTHETIC_PRIVATE_MARKER'));
  assert(!log.includes('https://'));
  assert(!log.includes('synthetic.mp4'));
  return { result: JSON.parse(JSON.stringify(results[0])), log };
}
function unchanged(out) { assert.deepEqual(out.result, {}); }
function output(out) { return JSON.parse(out.result.body); }
test('旧决策只移除已确认的两类自动课后广告，保留其他字段和项目', () => {
  const keep = [{ type: 'SESSION_START_REWARDED_VIDEO', reward: { amount: 1 } },
    { type: 'UNKNOWN_SYNTHETIC_PROMOTION' }, null, { type: 'PLUS_INTERSTITIAL_SESSION_END' }];
  const data = { promotions: [{ type: 'NETWORK_INTERSTITIAL_SESSION_END' }, { type: 'PLUS_SESSION_END' }, ...keep],
    treatedExperiments: ['synthetic'], extra: { progress: 5 } };
  const out = invoke(legacy, data, legacyRequest);
  assert.deepEqual(output(out), { ...data, promotions: keep });
  assert.match(out.log, /第三方插屏决策 1 项.*自有推广决策 1 项.*保留 4 项/);
  unchanged(invoke(legacy, out.result.body, legacyRequest));
});
test('旧决策仅第三方广告时独立命中', () => {
  const out = invoke(legacy, { promotions: [{ type: 'NETWORK_INTERSTITIAL_SESSION_END' }] }, legacyRequest);
  assert.deepEqual(output(out), { promotions: [] }); assert.match(out.log, /第三方插屏决策 1 项.*自有推广决策 0 项/);
});
test('旧决策空数组和无广告项目不重新序列化', () => {
  for (const promotions of [[], [{ type: 'SESSION_START_REWARDED_VIDEO' }], [{ unknown: true }]]) {
    unchanged(invoke(legacy, { promotions }, legacyRequest));
  }
});
test('旧决策奖励、未知、缺少场景全部放行，即使响应包含广告类型', () => {
  for (const request of [{ appLocation: 'SESSION_START' }, { appLocation: 'UNKNOWN' }, {}, null, []]) {
    unchanged(invoke(legacy, { promotions: [{ type: 'NETWORK_INTERSTITIAL_SESSION_END' }] }, request));
  }
});
test('集中课后视频仅在三项广告标记和课后请求同时成立时移除', () => {
  const out = invoke(central, response(), centralRequest);
  assert.deepEqual(out.result, { body: '' }); assert.match(out.log, /自有推广决策 1 项/);
  unchanged(invoke(central, '', centralRequest));
});
test('集中奖励请求保留完全相同的广告响应', () => {
  unchanged(invoke(central, response(), { clientParams: { plusPromotionAdType: 'rewarded-video' } }));
});
test('集中缺少/未知请求场景不处理', () => {
  for (const request of [{}, null, [], { clientParams: [] }, { clientParams: { plusPromotionAdType: 'unknown' } }]) {
    unchanged(invoke(central, response(), request));
  }
});
test('集中保留非目标类型、来源、素材及共享域名相似地址', () => {
  for (const [key, value] of [['variantClass', 'OtherVariant'], ['offerOrigin', 'REWARD'],
    ['videoURL', 'https://example.invalid/video.mp4'], ['videoURL', promoURL.replace('duolingo.com', 'duolingo.com.example.invalid')],
    ['videoURL', promoURL.replace('/promo/', '/lesson/')], ['videoURL', promoURL + '.extra']]) {
    const body = response(); body.decisions.enriched[key] = value;
    unchanged(invoke(central, body, centralRequest));
  }
});
test('集中未知附加业务字段、混合决策和非空追踪属性均保留', () => {
  const cases = [];
  let body = response(); body.reward = { amount: 1 }; cases.push(body);
  body = response(); body.decisions.reward = {}; cases.push(body);
  body = response(); body.decisions.enriched.unknownAction = {}; cases.push(body);
  body = response(); body.decisions.general.other = {}; cases.push(body);
  body = response(); body.trackingProperties = {}; cases.push(body);
  body = response(); body.decisions.enriched.stringID = 'different'; cases.push(body);
  body = response(); body.decisions.enriched.madJsonURL = 'https://example.invalid/modular'; cases.push(body);
  for (const value of cases) unchanged(invoke(central, value, centralRequest));
});
for (const [name, url, request] of [['旧决策', legacy, legacyRequest], ['集中决策', central, centralRequest]]) {
  test(name + ' 请求缺失、类型异常或解析失败不输出内容', () => {
    for (const value of [undefined, '', 'SYNTHETIC_PRIVATE_MARKER{', new Uint8Array([1,2])]) {
      unchanged(invoke(url, response(), value));
    }
  });
  test(name + ' 响应空、类型异常或 JSON 损坏时放行', () => {
    for (const value of ['', 'SYNTHETIC_PRIVATE_MARKER{', null, [], {}, new Uint8Array([1,2])]) {
      unchanged(invoke(url, value, request));
    }
  });
  test(name + ' 方法或状态不匹配时放行', () => {
    for (const method of ['GET', 'PUT', undefined]) unchanged(invoke(url, response(), request, { request: { method } }));
    for (const status of [204, 403, 500, undefined]) unchanged(invoke(url, response(), request, { response: { status } }));
  });
}
test('旧决策 promotions 必须为数组', () => {
  for (const value of [null, {}, 'unknown', 1]) unchanged(invoke(legacy, { promotions: value }, legacyRequest));
});
test('集中嵌套结构必须为普通对象', () => {
  for (const key of ['decisions', 'general', 'enriched']) {
    for (const value of [null, [], 'unknown']) {
      const body = response(); if (key === 'decisions') body[key] = value; else body.decisions[key] = value;
      unchanged(invoke(central, body, centralRequest));
    }
  }
});
test('既有消息入口回归：只移除明确 interstitialAd，保留奖励与未知混合 ID', () => {
  const keep = [{ sessionEndMessageId: { reward: {} }, progress: 1 },
    { sessionEndMessageId: { interstitialAd: {}, other: {} } }, { sessionEndMessageId: { interstitialAd: null } }];
  const out = invoke(messages, { sessionEndMessageDisplayInfo: [{ sessionEndMessageId: { interstitialAd: {} } }, ...keep], other: 1 });
  assert.deepEqual(output(out), { sessionEndMessageDisplayInfo: keep, other: 1 });
});
test('既有备用视频回归：保留未知视频及奖励来源', () => {
  const ad = { variantClass: 'StaticDuolingoVideoVariant', offerOrigin: 'INTERSTITIAL_PLUS_VIDEO', videoURL: promoURL };
  const kept = [{ ...ad, offerOrigin: 'REWARD' }, { videoURL: 'https://example.invalid/video' }];
  assert.deepEqual(output(invoke(fallback, { ads: [ad, ...kept], other: true })), { ads: kept, other: true });
});
test('既有视频映射回归：只过滤明确自有插屏素材', () => {
  const out = invoke(videos, { ads: { synthetic: promoURL, lesson: 'https://example.invalid/lesson' }, other: 1 });
  assert.deepEqual(output(out), { ads: { lesson: 'https://example.invalid/lesson' }, other: 1 });
});
test('接口匹配精确且插件/脚本范围一致', () => {
  const patterns = plugin.split('\n').filter((line) => line.startsWith('http-response ')).map((line) => new RegExp(line.split(' ')[1]));
  for (const url of [legacy, central, messages, fallback, videos]) {
    for (const good of [url, url.replace(/\/$/, ''), url + '?synthetic=1']) assert(patterns.some((pattern) => pattern.test(good)));
    for (const bad of [url.replace('https:', 'http:'), url.replace('ios-api-2.', 'other.'), url.replace(/\/$/, '')+'Extra', url.replace(/\/$/, '')+'/extra']) {
      assert(!patterns.some((pattern) => pattern.test(bad)));
      unchanged(invoke(bad, response(), centralRequest));
    }
  }
  for (const bad of [legacy.replace('/1/', '/synthetic/'), legacy.replace('2021-05-05', '2021-05-06'), host + '/plus-promotions/compute-decision/1/']) {
    assert(!patterns.some((pattern) => pattern.test(bad))); unchanged(invoke(bad, response(), legacyRequest));
  }
});
test('所有四条插件规则引用同一分支脚本，MITM 不扩大', () => {
  const refs = [...plugin.matchAll(/script-path=([^,\s]+)/g)].map((match) => match[1]);
  assert.equal(refs.length, 4);
  assert(refs.every((url) => url === 'https://raw.githubusercontent.com/IDREAMyuI/loon-scripts/agent/duolingo-session-end-decisions/scripts/duolingo_disable_ads.js'));
  assert.equal(plugin.match(/^hostname=(.*)$/m)[1], 'ios-api-2.duolingo.cn');
});

// 仅构造通用服务器错误页；日期为人工测试值，不包含抓包正文或业务标识。
const errorSuffix = 'HTTP/1.1 400 Bad Request\r\n' +
  'Server: Tengine\r\nDate: Sat, 01 Jan 2000 00:00:00 GMT\r\n' +
  'Content-Type: text/html\r\nConnection: close\r\n\r\n' +
  '<!DOCTYPE HTML PUBLIC "-//IETF//DTD HTML 2.0//EN">\r\n' +
  '<html>\r\n<head><title>400 Bad Request</title></head>\r\n<body>\r\n' +
  '<center><h1>400 Bad Request</h1></center>\r\n' +
  '<hr/>Powered by Tengine<hr><center>tengine</center>\r\n</body>\r\n</html>\r\n';
const legacyAds = { promotions: [{ type: 'NETWORK_INTERSTITIAL_SESSION_END' }, { type: 'PLUS_SESSION_END' }], other: 1 };
test('已知错误页：保留完整前段 JSON 的非广告字段并移除课后广告', () => {
  const out = invoke(legacy, JSON.stringify(legacyAds) + errorSuffix, legacyRequest);
  assert.deepEqual(output(out), { promotions: [], other: 1 });
  assert.match(out.log, /识别到 JSON 后拼接的 400 错误页.*已按广告标记处理/);
});
test('已知错误页：既有课后消息入口也能精准处理', () => {
  const body = { sessionEndMessageDisplayInfo: [{ sessionEndMessageId: { interstitialAd: {} } }, { sessionEndMessageId: { reward: {} } }], other: 1 };
  const out = invoke(messages, JSON.stringify(body) + errorSuffix);
  assert.deepEqual(output(out), { ...body, sessionEndMessageDisplayInfo: body.sessionEndMessageDisplayInfo.slice(1) });
});
test('已知错误页：集中自动课后视频可处理，奖励场景仍保持字节不变', () => {
  const body = JSON.stringify(response()) + errorSuffix;
  assert.deepEqual(invoke(central, body, centralRequest).result, { body: '' });
  unchanged(invoke(central, body, { clientParams: { plusPromotionAdType: 'rewarded-video' } }));
  unchanged(invoke(legacy, JSON.stringify(legacyAds) + errorSuffix, { appLocation: 'SESSION_START' }));
});
test('已知错误页但无广告时不做网络正文修复', () => {
  const out = invoke(legacy, JSON.stringify({ promotions: [] }) + errorSuffix, legacyRequest);
  unchanged(out); assert.match(out.log, /未修改原响应/);
  unchanged(invoke(messages, JSON.stringify({ sessionEndMessageDisplayInfo: [] }) + errorSuffix));
});
test('JSON 字符串内的花括号、转义及错误页标记不会截断合法数据', () => {
  const data = { ...legacyAds, unrelated: 'quoted } { "\\\n' + errorSuffix };
  const out = invoke(legacy, JSON.stringify(data) + errorSuffix, legacyRequest);
  assert.equal(output(out).unrelated, data.unrelated);
  assert.deepEqual(output(invoke(legacy, JSON.stringify(data), legacyRequest)).unrelated, data.unrelated);
});
for (const [name, suffix] of [
  ['other-status', errorSuffix.replaceAll('400 Bad Request', '403 Forbidden')],
  ['other-server', errorSuffix.replace('Server: Tengine', 'Server: Unknown')],
  ['other-content-type', errorSuffix.replace('Content-Type: text/html', 'Content-Type: application/json')],
  ['injected-header', errorSuffix.replace('Connection: close', 'X-Unknown: value\r\nConnection: close')],
  ['changed-page', errorSuffix.replace('Powered by Tengine', 'SYNTHETIC_PRIVATE_MARKER')],
  ['truncated-page', errorSuffix.slice(0, -20)],
  ['trailing-data', errorSuffix + 'SYNTHETIC_PRIVATE_MARKER'],
  ['second-json', '{"other":true}'],
  ['oversized', errorSuffix.replace('<body>', '<body>' + ' '.repeat(2200))],
]) {
  test('未知尾段原样放行：' + name, () => {
    const out = invoke(legacy, JSON.stringify(legacyAds) + suffix, legacyRequest);
    unchanged(out); assert.match(out.log, /解析或处理失败/);
  });
}
test('前段 JSON 截断、多份错误页及外层非 200 状态全部放行', () => {
  unchanged(invoke(legacy, JSON.stringify(legacyAds).slice(0, -1) + errorSuffix, legacyRequest));
  unchanged(invoke(legacy, JSON.stringify(legacyAds) + errorSuffix + errorSuffix, legacyRequest));
  unchanged(invoke(messages, JSON.stringify({ sessionEndMessageDisplayInfo: [{ sessionEndMessageId: { interstitialAd: {} } }] }) + errorSuffix, undefined, { response: { status: 500 } }));
  unchanged(invoke(legacy, errorSuffix, legacyRequest));
});

test('v5 读取异常不泄露错误内容且仅原样放行一次', () => {
  for (const field of ['request', 'response']) {
    const req = { url: legacy, method: 'POST', body: JSON.stringify(legacyRequest) };
    const res = { status: 200, body: '{"promotions":[]}' };
    Object.defineProperty(field === 'request' ? req : res, 'body', { get() { throw new Error('SYNTHETIC_PRIVATE_MARKER'); } });
    const logs = [], results = [];
    vm.runInNewContext(source, { $request: req, $response: res, console: { log: x => logs.push(x) }, $done: x => results.push(x) });
    assert.equal(results.length, 1); assert.equal(JSON.stringify(results[0]), '{}');
    assert.match(logs.join('\n'), /异常阶段：.*体读取前/);
    assert(!logs.join('').includes('SYNTHETIC_PRIVATE_MARKER'));
  }
});
test('v5 日志异常不影响过滤，返回异常不重试也不泄露', () => {
  for (const failLog of [false, true]) {
    let calls = 0; const logs = [];
    vm.runInNewContext(source, { $request: { url: legacy, method: 'POST', body: JSON.stringify(legacyRequest) },
      $response: { status: 200, body: '{"promotions":[{"type":"PLUS_SESSION_END"}]}' },
      console: { log: x => { if (failLog) throw new Error('SYNTHETIC_PRIVATE_MARKER'); logs.push(x); } },
      $done: x => { calls++; assert.deepEqual(JSON.parse(x.body), { promotions: [] }); throw new Error('SYNTHETIC_PRIVATE_MARKER'); } });
    assert.equal(calls, 1); assert(!logs.join('').includes('SYNTHETIC_PRIVATE_MARKER'));
    if (!failLog) assert.match(logs.join('\n'), /返回调用异常；未重试/);
  }
});
test('v5 阶段日志按读取解析返回顺序出现', () => {
  const out = invoke(legacy, { promotions: [{ type: 'PLUS_SESSION_END' }] }, legacyRequest);
  const stages = ['阶段=启动', '请求体读取前', '请求体读取后', '请求解析前', '请求解析后', '响应体读取前', '响应体读取后', '响应解析前', '响应解析后', '准备返回改写'];
  let position = -1;
  for (const stage of stages) { const next = out.log.indexOf(stage); assert(next > position); position = next; }
});

test('v6 UTF8字节数覆盖中文、表情及孤立代理项，输出紧凑且无正文', () => {
  const data = { sessionEndMessageDisplayInfo: [], text: '中文😀\ud800' };
  const req = '中😀\ud800';
  const out = invoke(messages, data, req, { response: { headers: { 'Content-Length': '12' } } });
  unchanged(out);
  assert.match(out.log, new RegExp('请求UTF8字节=' + Buffer.byteLength(req)));
  assert.match(out.log, new RegExp('响应UTF8字节=' + Buffer.byteLength(JSON.stringify(data))));
  assert.match(out.log, /声明长度=12；状态=200；正文=完整JSON/);
  assert(!out.log.includes('中文')); assert(out.log.split('\n').length <= 4);
});
test('v6 区分独立HTTP400、HTML、非法JSON和已确认拼接', () => {
  const joined = invoke(legacy, JSON.stringify(legacyAds) + errorSuffix, legacyRequest);
  assert.match(joined.log, /正文=JSON加已知HTTP400/);
  assert.deepEqual(output(joined).promotions, []);
  for (const [body, kind] of [['HTTP/1.1 400 Bad Request\r\nSYNTHETIC_PRIVATE_MARKER', 'HTTP400开头'], ['<html>SYNTHETIC_PRIVATE_MARKER</html>', 'HTML开头'], ['{broken', '其他或无效JSON']]) {
    const out = invoke(messages, body); unchanged(out); assert(out.log.includes('正文=' + kind));
  }
});
test('v6 非数字、多个声明长度和异常头不泄露也不影响过滤', () => {
  for (const headers of [{ 'content-length': 'SYNTHETIC_PRIVATE_MARKER' }, { 'Content-Length': '1', 'content-length': '2' }, { 'content-length': '12345678901234567890' }]) {
    const out = invoke(legacy, { promotions: [{ type: 'PLUS_SESSION_END' }] }, legacyRequest, { response: { headers } });
    assert.deepEqual(output(out), { promotions: [] }); assert.match(out.log, /声明长度=无效/);
  }
});
test('v6 诊断补读或头读取抛错不改变已完成过滤', () => {
  const req = { url: messages, method: 'POST' }, res = { status: 200, body: JSON.stringify({ sessionEndMessageDisplayInfo: [{ sessionEndMessageId: { interstitialAd: {} } }] }) };
  Object.defineProperty(req, 'body', { get() { throw new Error('SYNTHETIC_PRIVATE_MARKER'); } });
  Object.defineProperty(res, 'headers', { get() { throw new Error('SYNTHETIC_PRIVATE_MARKER'); } });
  const logs = [], results = [];
  vm.runInNewContext(source, { $request: req, $response: res, console: { log: s => logs.push(s) }, $done: r => results.push(r) });
  assert.equal(results.length, 1); assert.deepEqual(JSON.parse(results[0].body), { sessionEndMessageDisplayInfo: [] });
  assert.match(logs.join('\n'), /请求UTF8字节=读取异常/); assert.match(logs.join('\n'), /声明长度=读取异常/);
  assert(!logs.join('').includes('SYNTHETIC_PRIVATE_MARKER'));
});
