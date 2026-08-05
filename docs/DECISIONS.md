# 关键设计决策

## D1：ChatGPT 只使用台湾节点

ChatGPT 策略组只能包含台湾节点，不得加入日本、香港或通用代理组。台湾节点全部不可用时，允许 ChatGPT 连接失败。

## D2：日常流量日本优先，香港备用

日常代理应为外层 `fallback`，顺序固定为日本组在前、香港组在后。

## D3：使用 fallback 而不是 url-test

原因是用户重视出口 IP 稳定性，不希望因为几十毫秒延迟差异频繁切换。

## D4：Sub-Store 只做本机敏感订阅管理

公开仓库不保存机场原始订阅、节点凭证或私有 Token。

## D5：禁止旧 resource-parser

Sub-Store 已输出 Loon 原生格式，二次解析可能导致 VLESS Reality 参数丢失或重复转换。

## D6：MITM 与证书

公开仓库不得提交 `ca-p12`、`ca-passphrase`、证书私钥、Cookie、Authorization 或抓包中的账号凭证。

## D7：插件拆分

掌阅插件独立维护；Sub-Store 官方插件独立维护；未来不同 App 的插件分别维护。
