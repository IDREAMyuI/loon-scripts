# 推荐仓库结构

```text
.
├── CODEX_CONTEXT.md
├── CODEX_START_PROMPT.txt
├── config/
│   └── Loon_Public.conf
├── plugins/
│   └── ireader_splash_ad.lpx
├── scripts/
│   └── ireader_disable_screen.js
└── docs/
    ├── DECISIONS.md
    ├── SECURITY.md
    └── REPO_STRUCTURE.md
```

后续新增插件：

```text
plugins/<app_name>.lpx
scripts/<app_name>.js
```

原则：一款 App 一个插件；同一 App 的强相关功能可合并；不同 App 分开；官方插件不复制进自制插件。
