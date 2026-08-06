# loon-scripts

公开维护的 Loon 配置、远程规则、插件和脚本，当前重点包括：

- ChatGPT / OpenAI 流量仅使用台湾节点；
- 日常自动代理依次使用台湾、香港、日本节点；
- 可切换到包含全部订阅节点的手动选择组；
- 通过本机 Sub-Store 管理敏感订阅并输出 Loon 原生节点；
- 通过仓库自有的远程规则维护 OpenAI 与直连分流；
- 通过独立插件处理掌阅 iReader 开屏广告。

## 核心约束

- ChatGPT 策略组只能引用台湾节点，不回退到香港、日本或手动选择。
- 日常代理必须保持 `fallback,台湾节点,香港节点,日本节点` 的顺序。
- 顶层代理模式必须默认选择日常代理，手动选择组必须包含完整的 Sub-Store 节点订阅。
- 主配置必须保留 OpenAI 第一方核心域名的台湾兜底，防止远程规则首次下载失败时落入其他节点。
- 禁止启用旧 `resource-parser`。
- 不长期配置 `disable-udp-ports=443`，避免影响 Hysteria2 或 QUIC。
- 公开仓库不得包含订阅 Token、节点 UUID/密码、证书私钥、Cookie 或 Authorization。

详细设计与安全边界参见：

- [`AGENTS.md`](AGENTS.md)：维护约束和关键设计决策
- [`SECURITY.md`](SECURITY.md)：敏感信息与抓包材料边界

## 仓库结构

```text
config/    Loon 公开配置
rules/     Loon 远程规则
plugins/   独立 Loon 插件
scripts/   插件引用的脚本
```

目录职责保持单一：主配置只负责运行时设置和策略映射；远程规则不写策略名称；插件按 App 拆分；插件引用的脚本放在 `scripts/`。

## 抓包与隐私

抓包、HAR、日志、截图、二维码、证书和订阅文件默认视为敏感材料，只用于本地分析，不进入仓库、Issue、Pull Request 或公开讨论。制作插件时优先使用人工构造的最小测试数据；确需保留样本时，必须先按 [`SECURITY.md`](SECURITY.md) 完成脱敏。

## 可公开引用的 Raw 地址

- 主配置：`https://raw.githubusercontent.com/IDREAMyuI/loon-scripts/main/config/Loon_Public_v2.conf`
- OpenAI 规则：`https://raw.githubusercontent.com/IDREAMyuI/loon-scripts/main/rules/openai.list`
- 直连规则：`https://raw.githubusercontent.com/IDREAMyuI/loon-scripts/main/rules/direct.list`
- 掌阅插件：`https://raw.githubusercontent.com/IDREAMyuI/loon-scripts/main/plugins/ireader_splash_ad.lpx`
- 掌阅脚本：`https://raw.githubusercontent.com/IDREAMyuI/loon-scripts/main/scripts/ireader_disable_screen.js`

机场原始订阅及其他敏感项仅保存在手机本机，不提交到本仓库。发现泄露时不要在公开 Issue 中粘贴原值，应立即停止发布并按安全政策处理。
