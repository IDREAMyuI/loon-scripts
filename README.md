# loon-scripts

公开维护的 Loon 配置、插件和脚本，当前重点包括：

- ChatGPT / OpenAI 流量仅使用台湾节点；
- 日常代理使用日本节点，整体不可用时回退到香港节点；
- 通过本机 Sub-Store 管理敏感订阅并输出 Loon 原生节点；
- 通过独立插件处理掌阅 iReader 开屏广告。

## 核心约束

- ChatGPT 策略组只能引用台湾节点，不回退到日本或香港。
- 日常代理必须保持 `fallback,日本节点,香港节点` 的顺序。
- 禁止启用旧 `resource-parser`。
- 不长期配置 `disable-udp-ports=443`，避免影响 Hysteria2 或 QUIC。
- 公开仓库不得包含订阅 Token、节点 UUID/密码、证书私钥、Cookie 或 Authorization。

详细设计与安全边界参见：

- [`CODEX_CONTEXT.md`](CODEX_CONTEXT.md)
- [`docs/DECISIONS.md`](docs/DECISIONS.md)
- [`docs/SECURITY.md`](docs/SECURITY.md)

## 仓库结构

```text
config/    Loon 公开配置
plugins/   独立 Loon 插件
scripts/   插件引用的脚本
docs/      设计决策、安全边界与目录约定
```

## 可公开引用的 Raw 地址

- 主配置：`https://raw.githubusercontent.com/IDREAMyuI/loon-scripts/main/config/Loon_Public_v2.conf`
- 掌阅插件：`https://raw.githubusercontent.com/IDREAMyuI/loon-scripts/main/plugins/ireader_splash_ad.lpx`
- 掌阅脚本：`https://raw.githubusercontent.com/IDREAMyuI/loon-scripts/main/scripts/ireader_disable_screen.js`

机场原始订阅及其他敏感项仅保存在手机本机，不提交到本仓库。