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
