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
const file = 'weibo_disable_ads.js';
const urls = {
  preload: 'https://bootpreload.uve.weibo.com/v2/ad/preload',
  cached: 'https://wbapp.uve.weibo.com/wbapplua/wbpullad.lua',
  realtime: 'https://bootrealtime.uve.weibo.com/v3/ad/realtime',
  feed: 'https://api.weibo.cn/2/statuses/container_timeline_hot'
};
const run = (body, target = urls.preload, headers = {}) => execute(file, target, typeof body === 'string' || body instanceof Uint8Array ? body : JSON.stringify(body), headers);
const header = { 'Content-Type': 'multipart/form-data; boundary="synthetic-boundary"' };
function multipart(parts, closing = true) {
  const buffers = [];
  for (const [name, value] of parts) {
    buffers.push(Buffer.from(`--synthetic-boundary\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n`));
    buffers.push(value instanceof Uint8Array ? value : Buffer.from(typeof value === 'string' ? value : JSON.stringify(value)));
    buffers.push(Buffer.from('\r\n'));
  }
  if (closing) buffers.push(Buffer.from('--synthetic-boundary--\r\n'));
  return new Uint8Array(Buffer.concat(buffers));
}
const realtime = (parts, closing = true, headers = header) => run(multipart(parts, closing), urls.realtime, headers);
test('微博预加载与缓存响应：只修改广告数组，空数组原样放行', () => {
  for (const key of ['preload', 'cached']) {
    const input = key === 'preload' ? { ads: [{ synthetic: 1 }], other: 5 } : { cached_ad: { ads: [{ synthetic: 1 }], other: 5 }, other: 7 };
    const output = run(input, urls[key]); const data = changed(output);
    assert.deepEqual(key === 'preload' ? data.ads : data.cached_ad.ads, []);
    assert.equal(data.other, input.other); if (key === 'cached') assert.equal(data.cached_ad.other, 5);
    assert.match(output.logs, /已移除 1 条/); assert(!output.logs.includes('缓存已清空'));
    const second = run(output.result.body, urls[key]); unchanged(second); assert.match(second.logs, /未发现广告/);
  }
});
test('微博信息流：明确广告删除，弱标记与嵌套广告保留', () => {
  const kept = [{ data: { text: 'synthetic' } }, { data: { ad_object: {} } },
    { data: { ad_state: 1 } }, { data: { retweeted_status: { is_ad: true } } }, null];
  const removed = [{ data: { is_ad: 1 } }, { data: { is_ad: '1' } }, { data: { is_ad: true } },
    { data: { ad_object: {}, ad_actionlogs: {} } }];
  const output = run({ items: [...kept, ...removed], other: 9 }, urls.feed);
  assert.deepEqual(changed(output), { items: kept, other: 9 }); assert.match(output.logs, /4条.*5条/);
  unchanged(run(output.result.body, urls.feed));
});
for (const key of ['preload', 'cached', 'feed']) {
  test('微博 JSON 原样放行与路径日志：' + key, () => {
    for (const body of ['', 'SYNTHETIC_PRIVATE_MARKER{', 'null', '[]', '{}']) {
      const output = run(body, urls[key]); unchanged(output);
      assert.match(output.logs, key === 'preload' ? /预加载/ : key === 'cached' ? /缓存开屏响应/ : /信息流/);
    }
  });
}
test('微博实时：精确关联素材删除；无关二进制字节完整保留', () => {
  const asset = new Uint8Array([0, 255, 1, 128, 13, 10]);
  const parts = [['res_multipart_key_ad', asset], ['realtime', { ads: [{ asset: 'res_multipart_key_ad' }], other: 7 }],
    ['res_multipart_key_keep', asset], ['other', { keep: true }]];
  const output = realtime(parts);
  assert(output.result.body instanceof Uint8Array);
  const text = Buffer.from(output.result.body).toString();
  assert(!text.includes('name="res_multipart_key_ad"'));
  assert(text.includes('name="res_multipart_key_keep"'));
  assert(text.includes('"ads":[]')); assert(text.includes('"other":7'));
  assert(Buffer.from(output.result.body).includes(Buffer.from(asset)));
  assert(text.endsWith('--synthetic-boundary--\r\n')); assert.match(output.logs, /广告 1 条.*素材 1 个.*素材 1 个/);
  unchanged(run(output.result.body, urls.realtime, header));
});
test('微博实时：仅名称前缀无法确认关联时保留素材', () => {
  const output = realtime([['realtime', { ads: [{ synthetic: true }] }], ['res_multipart_key_keep', 'asset']]);
  assert(Buffer.from(output.result.body).toString().includes('name="res_multipart_key_keep"'));
  assert.match(output.logs, /关联素材 0 个/);
});
for (const other of ['sameObject', 'otherPart', 'unknownOtherPart']) {
  test('微博实时：共享素材或未知其他 part 保护：' + other, () => {
    const data = { ads: [{ asset: 'res_multipart_key_shared' }] };
    if (other === 'sameObject') data.nonAd = 'res_multipart_key_shared';
    const parts = [['realtime', data], ['res_multipart_key_shared', 'asset']];
    if (other === 'otherPart') parts.push(['other', { asset: 'res_multipart_key_shared' }]);
    if (other === 'unknownOtherPart') parts.push(['other', 'unknown-binary-shape']);
    const output = realtime(parts); assert(Buffer.from(output.result.body).toString().includes('name="res_multipart_key_shared"'));
    assert.match(output.logs, /关联素材 0 个/);
  });
}
for (const data of [{ code: 0 }, { ads: [] }]) {
  test('微博实时无广告响应保持所有 part：' + JSON.stringify(data), () => {
    const output = realtime([['realtime', data], ['res_multipart_key_keep', 'asset']]); unchanged(output);
    assert.match(output.logs, /未包含广告/);
  });
}
for (const data of [{}, { ads: {} }, { ads: [null] }, { ads: [1] }, null, [], 'SYNTHETIC_PRIVATE_MARKER{']) {
  test('微博实时未知结构或无效 JSON：' + JSON.stringify(data), () => unchanged(realtime([['realtime', data], ['res_multipart_key_keep', 'asset']])));
}
test('微博实时无 realtime、重复 part、未闭合及错误边界全部放行', () => {
  unchanged(realtime([['res_multipart_key_keep', 'asset']]));
  unchanged(realtime([['realtime', { ads: [] }], ['realtime', { ads: [] }]]));
  unchanged(realtime([['realtime', { ads: [{}] }]], false));
  unchanged(realtime([['realtime', { ads: [{}] }]], true, { 'content-type': 'multipart/form-data; boundary=wrong' }));
  unchanged(run('SYNTHETIC_PRIVATE_MARKER', urls.realtime, header));
  unchanged(run(new Uint8Array(), urls.realtime, header));
});
test('微博实时素材中的边界相似字节与普通字节均保留', () => {
  const binary = Buffer.from('prefix--synthetic-boundary\r\n\r\n--synthetic-boundary-extra\r\nsuffix');
  const output = realtime([['realtime', { ads: [{}] }], ['res_multipart_key_keep', binary]]);
  assert(Buffer.from(output.result.body).includes(binary));
});
test('微博实时无效 UTF-8 或异常结束标记原样放行', () => {
  unchanged(realtime([['realtime', new Uint8Array([0xff, 0xfe])]]));
  const input = Buffer.concat([multipart([['realtime', { ads: [{}] }]]), Buffer.from('trailing-data')]);
  unchanged(run(new Uint8Array(input), urls.realtime, header));
});
test('微博插件匹配范围及同分支脚本引用', () => {
  const regexes = patterns('weibo_splash_ad.lpx');
  for (const url of Object.values(urls)) {
    assert(regexes.some((regex) => regex.test(url))); assert(regexes.some((regex) => regex.test(url+'?sample=1')));
    for (const wrong of [url+'Extra', url+'/extra', url.replace('https:', 'http:')]) {
      assert(!regexes.some((regex) => regex.test(wrong))); unchanged(run({ ads: [{}] }, wrong));
    }
  }
  const plugin = fs.readFileSync(path.join(root, 'plugins/weibo_splash_ad.lpx'), 'utf8');
  assert.equal(plugin.split('/agent/weibo-safe-response/scripts/' + file).length - 1, 3);
  assert(!plugin.includes('/main/scripts/'));
});
