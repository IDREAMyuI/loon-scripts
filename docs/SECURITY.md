# 安全边界

## 严禁提交

- 机场原始订阅 URL
- Sub-Store 私有输出链接中的敏感 Token
- 节点 UUID、密码、私钥
- Cookie、Authorization Header、API Token
- `ca-p12`、`ca-passphrase`
- 原始 HAR 中的登录信息、账号、设备标识

## 提交前建议搜索

`token=`、`subscribe`、`uuid=`、`password=`、`passwd=`、`authorization`、`cookie`、`ca-p12`、`ca-passphrase`、`private-key`、`pbk=`、`sid=`。

## 抓包材料处理

1. 删除 Cookie、Authorization。
2. 删除 URL 查询参数中的 Token。
3. 删除账号、手机号、邮箱、设备 ID。
4. 只保留与目标功能相关的最小请求/响应片段。
5. 原始 HAR 不进入公开仓库。
