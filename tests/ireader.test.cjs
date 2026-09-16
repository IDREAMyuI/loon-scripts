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
const file = 'ireader_disable_screen.js';
const url = 'https://saad.ms.zhangyue.net/ad/cfg';
const run = (body, target = url) => execute(file, target, typeof body === 'string' ? body : JSON.stringify(body));
const sample = () => ({ body: { rules: [
  { slotId: 'SCREEN', rule: [{ kind: 'synthetic-ad' }], slotCfg: { isShowAd: true, commonPreloadCfg: { unrelated: 7 } } },
  { slotId: 'REWARD', rule: [1], slotCfg: { rewardShow: true } },
  { slotId: 'FEED', rule: [2] }
], progress: 10 }, unrelated: true });
test('掌阅：仅修改 SCREEN，保留其他业务与未知字段', () => {
  const input = sample(); const out = run(input); const data = changed(out);
  assert.deepEqual(data.body.rules.slice(1), input.body.rules.slice(1));
  assert.equal(data.body.progress, 10); assert.equal(data.unrelated, true);
  assert.deepEqual(data.body.rules[0].rule, []);
  assert.equal(data.body.rules[0].slotCfg.isShowAd, false);
  assert.equal(data.body.rules[0].slotCfg.commonPreloadCfg.unrelated, 7);
  assert.match(out.logs, /已关闭或清空.*1 项.*2 项/);
  unchanged(run(out.result.body));
});
for (const [name, body] of Object.entries({ empty: '', invalid: 'SYNTHETIC_PRIVATE_MARKER{',
  null: 'null', array: [], missing: {}, noScreen: { body: { rules: [{ slotId: 'FEED', rule: [1] }] } },
  emptyRules: { body: { rules: [] } }, alreadyEmpty: { body: { rules: [{ slotId: 'SCREEN', rule: [] }] } } })) {
  test('掌阅原样放行：' + name, () => unchanged(run(body)));
}
for (const value of [null, [], 1, 'unknown']) {
  test('掌阅拒绝异常 slotCfg：' + JSON.stringify(value), () => {
    const input = sample(); input.body.rules.push({ slotId: 'SCREEN', rule: [], slotCfg: value });
    const out = run(input); unchanged(out); assert.match(out.logs, /结构不匹配/);
  });
}
test('掌阅未知 rule 或预加载结构：整个响应放行', () => {
  for (const key of ['rule', 'preload']) {
    const input = sample();
    if (key === 'rule') input.body.rules[0].rule = {};
    else input.body.rules[0].slotCfg.commonPreloadCfg = [];
    unchanged(run(input));
  }
});
test('掌阅匹配范围与同分支脚本引用', () => {
  const [pattern] = patterns('ireader_splash_ad.lpx');
  for (const target of [url, url + '?sample=1']) assert(pattern.test(target));
  for (const target of [url+'Extra', url+'/extra', url.replace('https:', 'http:'), url.replace('saad.', 'other.')]) {
    assert(!pattern.test(target)); unchanged(run(sample(), target));
  }
  const plugin = fs.readFileSync(path.join(root, 'plugins/ireader_splash_ad.lpx'), 'utf8');
  assert(plugin.includes('/agent/ireader-safe-response/scripts/' + file));
  assert(!plugin.includes('/main/scripts/'));
});
