# loon-scripts

> Last reviewed: 2026-08-19

公开维护的 Loon 配置、远程规则、插件和脚本。仓库只保存可以公开分发的内容；订阅凭证、节点信息、证书和抓包材料只保留在用户本机。

## 核心设计

- ChatGPT / OpenAI 流量只使用台湾节点。
- 日常自动代理按台湾、香港、日本的顺序故障切换。
- 可切换到包含完整 Sub-Store 节点的手动选择组。
- OpenAI 和直连规则由仓库中的远程规则维护，主配置保留最小安全兜底。

不可改变的维护约束参见 [`AGENTS.md`](AGENTS.md)。敏感信息和抓包材料边界参见 [`SECURITY.md`](SECURITY.md)。已经生效的历史调整参见 [`CHANGELOG.md`](CHANGELOG.md)。

## 使用

在 Loon 中使用以下 Raw 地址导入主配置：

`https://raw.githubusercontent.com/IDREAMyuI/loon-scripts/main/config/Loon_Public_v2.conf`

主配置会加载仓库中启用的远程规则和插件。插件内部脚本由插件自动引用，通常不需要单独导入脚本。

机场原始订阅及其他敏感项只保存在手机本机的 Sub-Store 中，不提交到本仓库。

## 仓库结构

```text
config/    Loon 公开配置
rules/     Loon 远程规则
plugins/   可独立导入的 Loon 插件
scripts/   插件引用的脚本
```

目录职责保持单一：主配置负责运行时设置和策略映射；远程规则不写策略名称；一个 App 使用一个插件；插件引用的脚本放在 `scripts/`。

当前插件与脚本的功能范围以各文件头部说明为准。版本演进和真机验证结果记录在 `CHANGELOG.md`，不在本文件重复维护易过时的接口和脚本清单。

## 抓包与隐私

HAR、PCAP、日志、截图、二维码、证书、订阅文件和真实响应默认视为敏感材料，只用于本地分析，不进入仓库、Issue、Pull Request 或公开讨论。制作插件时优先使用人工构造的最小测试数据；确需保留样本时，必须先按 `SECURITY.md` 完成脱敏。
