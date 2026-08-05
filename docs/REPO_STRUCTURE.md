# 仓库结构

```text
.
├── CODEX_CONTEXT.md
├── README.md
├── config/
│   └── Loon_Public_v2.conf
├── plugins/
│   └── ireader_splash_ad.lpx
├── scripts/
│   └── ireader_disable_screen.js
└── docs/
    ├── DECISIONS.md
    ├── REPO_STRUCTURE.md
    └── SECURITY.md
```

## 目录约定

- `config/`：可公开托管的 Loon 主配置，不包含本机敏感项。
- `plugins/`：每个 App 的独立 Loon 插件。
- `scripts/`：由插件引用的脚本；Raw 地址必须包含此目录层级。
- `docs/`：设计决策、安全边界和仓库约定。

后续新增插件：

```text
plugins/<app_name>.lpx
scripts/<app_name>.js
```

原则：一款 App 一个插件；同一 App 的强相关功能可合并；不同 App 分开；官方插件不复制进自制插件。

修改文件位置时，应同步检查 README、上下文文档、主配置和插件中的 Raw 地址，确保公开地址返回成功。