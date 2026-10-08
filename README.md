# Prediction Alpha Agent

把预测市场的隐含概率与永续合约的定价信息放在一起比对，自动发现系统性错价，输出可执行、可验证的 AI 信号。

## 演示
- 视频：TODO
- 在线 demo：TODO
- 截图：TODO

## 它做什么
1. 实时拉取预测市场（Polymarket / Kalshi，经 Jupiter Prediction API）与永续定价数据。
2. 用可解释的规则检测「两边定价分歧」，产出信号。
3. AI 生成一张情报卡（事件、依据、建议动作、风险）。
4. 用户一键「跟随」，记录写入 Solana 上的 AlphaDesk 程序，形成可验证的 AI 战绩。

## 架构
（贴 PRD 第四节的流程图）

## 快速开始
前置：Node 20+、pnpm、Rust + Solana CLI + Anchor

1. `git clone <repo> && cd prediction-alpha-agent`
2. `cp .env.example .env`，填入 `JUP_API_KEY`、`PYTH_API_KEY`、`RPC_URL`
3. `pnpm install`
4. `pnpm ingest`   # 拉取并落库数据
5. `pnpm signals`  # 产出信号
6. `pnpm web`      # 打开仪表盘

## 数据来源
Jupiter Prediction API · Pyth Price Feeds · Jupiter Perps / Drift

## 信号逻辑
- A 跨市场定价分歧（主力）：市场隐含概率 vs 模型概率的 z-score
- B 拥挤度预警：资金费率极值 + 情绪一边倒
- C 事件驱动未反应窗口：预测市场已跳变、永续未反应

## 链上
AlphaDesk Program（devnet）：TODO 程序地址

## 路线图 / 赛后计划
TODO：说明这个项目为什么不会停在 hackathon
