# CODEX_CONTEXT.md

## 项目目的

维护一套公开托管在 GitHub 的 Loon 配置与插件。公开仓库中不得出现机场订阅凭证、节点密码、UUID、MITM 私钥、证书密码或其他敏感信息。

## 用户实际需求

1. 订阅节点地区只有：日本、台湾、香港。
2. ChatGPT / OpenAI 流量必须只使用台湾节点。
3. ChatGPT 不允许故障回退到日本或香港；台湾节点全部不可用时，宁可连接失败。
4. 日常境外流量优先使用日本节点。
5. 日本节点整体不可用时，回退到香港节点。
6. 为减少出口 IP 频繁变化，优先使用 fallback，而不是持续按最低延迟切换的 url-test。
7. 中国大陆和局域网流量直连。
8. 节点通过 Sub-Store 转换为 Loon 原生格式。
9. 机场原始订阅 URL 只保存在手机本机 Sub-Store 中，不写入 GitHub。
10. 掌阅开屏广告通过独立插件和 HTTP Response 脚本处理。
11. 非敏感配置在 GitHub 维护；敏感项在手机本机完成。
12. 后续可能继续分析 Loon 抓包并制作更多独立插件。

## 当前工具链与事实

- Loon 已能正常使用。
- Sub-Store 官方插件已验证可用。
- 原始订阅共约 90 个节点。
- 协议包括 Shadowsocks、VLESS Reality Vision、Hysteria2。
- Sub-Store 的 Loon 预览已确认 VLESS、Hysteria2 均存在，且 VLESS 输出包含 `flow=xtls-rprx-vision`。
- 不再使用旧的 `resource-parser`，避免对 Loon 原生输出二次解析。
- 不应长期设置 `disable-udp-ports=443`，以免影响 Hysteria2 或 QUIC。
- MITM 总开关必须开启；数据抓取只在排障时临时开启。
- 不应长期在 MITM hostname 中保留通配符 `*`。

## 掌阅插件

仓库：`https://github.com/IDREAMyuI/loon-scripts`

脚本文件：`scripts/ireader_disable_screen.js`

插件文件：`plugins/ireader_splash_ad.lpx`

插件 Raw 地址：
`https://raw.githubusercontent.com/IDREAMyuI/loon-scripts/main/plugins/ireader_splash_ad.lpx`

脚本 Raw 地址：
`https://raw.githubusercontent.com/IDREAMyuI/loon-scripts/main/scripts/ireader_disable_screen.js`

目标接口：
`https://saad.ms.zhangyue.net/ad/cfg`

脚本行为：
- 解析响应 JSON；
- 遍历 `obj.body.rules`；
- 只处理 `slotId === "SCREEN"`；
- 清空 `item.rule`；
- 将多个开屏广告开关设为关闭；
- 日志应出现：`掌阅开屏：命中 SCREEN 数量=1`。

## 维护原则

1. 一个插件文件对应一个独立插件卡片和总开关。
2. 同一 App 内始终一起启用的多个功能可以放进同一个插件。
3. 不同 App 的功能应拆分成不同插件，方便启停、排障和版本管理。
4. Sub-Store 官方插件保持独立，不复制进自制插件。
5. 所有修改优先通过新分支和 Pull Request 完成。
6. 修改配置后必须检查：
   - 是否包含敏感信息；
   - 是否破坏 ChatGPT 仅台湾的约束；
   - 是否破坏日本优先、香港备用的约束；
   - 是否重新启用了 `resource-parser`；
   - 是否影响 Hysteria2 的 UDP；
   - 是否扩大了 MITM 范围。