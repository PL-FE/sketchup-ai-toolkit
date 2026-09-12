# Changelog

## 0.3.0-alpha.1 — 2026-09-12

- 基于 Local MCP for SketchUp 0.2.0 源码包建立可独立发布的本地项目，保留 Apache-2.0 许可证和来源说明。
- 注册 SketchUp 2020/2026，按年份隔离状态并检查双向传输身份；增加 Ruby 2.5 兼容修复与旧版 API 拒绝路径。
- 增加设计参数来源、缺失项和假设确认预检，以及面向建筑/风景园林/图片参考建模的 Skill。
- 增加 Windows/macOS 安装、备份、客户端配置生成、Skill 安装、自检与源码/RBZ 打包脚本；桥接默认自动启动。
- 增加离线和传输回归、CI、庭院示例、中文 README 与可复制 AI 安装提示词。
- 更新 sharp 与 fast-uri 的锁定依赖。真机兼容矩阵仍待验收，详见 docs/testing.md。
- 首次 GitHub CI 发现并修复 snapshot 中 Ruby 2.6 的无终点范围语法；改用 Ruby 2.5 支持的数组遍历，并将后续 Ruby 失败详情输出到 CI 注释。
- 事务失败日志改用 Ruby 2.5 支持的独占文件创建标志，并验证原始错误及回滚状态被保留。
