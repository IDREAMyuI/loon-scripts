// 仅使用人工构造数据，不读取抓包或执行网络请求。
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const root = path.join(__dirname, '..');
function execute(file, url, body, headers = {}) {
  const logs = [];
  const results = [];
  const code = fs.readFileSync(path.join(root, 'scripts', file), 'utf8');
  const context = { $request: { url }, $response: { body, headers },
    console: { log: (...args) => logs.push(args.join(' ')) },
    $done: (result) => results.push(result), Uint8Array, TextEncoder, TextDecoder };
  vm.runInNewContext(code, context, { timeout: 1000 });
  assert.equal(results.length, 1, '$done 应只调用一次');
  assert(!logs.join('\n').includes('SYNTHETIC_PRIVATE_MARKER'), '日志不应输出合成敏感标记');
  assert(!logs.join('\n').includes('https://'), '日志不应输出链接');
  return { result: results[0], logs: logs.join('\n') };
}
function unchanged(output) { assert.deepEqual(Object.keys(output.result), []); }
function changed(output) { assert.equal(typeof output.result.body, 'string'); return JSON.parse(output.result.body); }
function patterns(plugin) {
  return fs.readFileSync(path.join(root, 'plugins', plugin), 'utf8').split('\n')
    .filter((line) => line.startsWith('http-response ')).map((line) => new RegExp(line.split(' ')[1]));
}
const file = 'liangbulu_disable_ads.js';
const url = 'https://helper.2bulu.com/adConfig/get';
const splash = 'https://helper.2bulu.com/getSplash';
const run = (body, target = url) => execute(file, target, typeof body === 'string' ? body : JSON.stringify(body));
const sample = () => ({ data: {
  splashAd: { on: true, dailyMaxDisplayCount: 5, adList: [{ kind: 'synthetic-ad' }], hotStart: { on: true, other: 1 } },
  interstitialAd: { on: true, dailyMaxDisplayCount: 5, hotStart: { on: true } },
  banner: { on: true }, reward: { count: 3 }, progress: 7
}, other: 9 });
test('两步路仅关闭开屏与插屏；重复处理原样放行', () => {
  const input = sample(); const output = run(input); const data = changed(output);
  for (const key of ['splashAd', 'interstitialAd']) {
    assert.equal(data.data[key].on, false); assert.equal(data.data[key].dailyMaxDisplayCount, 0);
    assert.equal(data.data[key].hotStart.on, false);
  }
  assert.equal(data.data.splashAd.hotStart.other, 1);
  assert.deepEqual(data.data.splashAd.adList, []);
  for (const key of ['banner', 'reward', 'progress']) assert.deepEqual(data.data[key], input.data[key]);
  assert.equal(data.other, 9); assert.match(output.logs, /开屏.*已关闭/); assert.match(output.logs, /插屏.*已关闭/);
  const second = run(output.result.body); unchanged(second); assert.match(second.logs, /未发现需修改/);
});
test('两步路开屏内容计数与无广告日志', () => {
  const output = run({ infos: [{ synthetic: 1 }, { synthetic: 2 }], other: true }, splash);
  assert.deepEqual(changed(output), { infos: [], other: true }); assert.match(output.logs, /移除 2 项/);
  const empty = run({ infos: [] }, splash); unchanged(empty); assert.match(empty.logs, /未发现广告/);
});
for (const value of [null, [], 1, 'unknown', {}, { on: 'true', dailyMaxDisplayCount: 1, adList: [] }]) {
  test('两步路拒绝异常广告配置：' + JSON.stringify(value), () => {
    const input = sample(); input.data.interstitialAd = value;
    const output = run(input); unchanged(output); assert.match(output.logs, /结构不匹配/);
    assert(!output.logs.includes('已关闭'));
  });
}
test('两步路异常 hotStart 或 adList 不返回部分修改', () => {
  for (const key of ['hotStart', 'adList']) {
    const input = sample(); input.data.splashAd[key] = key === 'hotStart' ? [] : {};
    unchanged(run(input));
  }
});
for (const [name, body] of Object.entries({ empty: '', invalid: 'SYNTHETIC_PRIVATE_MARKER{', null: 'null', array: [], missing: {}, noAd: { data: {} } })) {
  test('两步路原样放行：' + name, () => { unchanged(run(body)); unchanged(run(body, splash)); });
}
test('两步路允许只有一种已知配置', () => {
  const input = sample(); delete input.data.interstitialAd;
  assert.equal(changed(run(input)).data.splashAd.on, false);
});
test('两步路匹配范围及同分支引用', () => {
  const [pattern] = patterns('liangbulu_ads.lpx');
  for (const target of [url, splash, url+'?sample=1']) assert(pattern.test(target));
  for (const target of [url+'Extra', splash+'/extra', url.replace('helper.', 'other.')]) {
    assert(!pattern.test(target)); unchanged(run(sample(), target));
  }
  const plugin = fs.readFileSync(path.join(root, 'plugins/liangbulu_ads.lpx'), 'utf8');
  assert(plugin.includes('/agent/liangbulu-safe-response/scripts/' + file)); assert(!plugin.includes('/main/scripts/'));
});
