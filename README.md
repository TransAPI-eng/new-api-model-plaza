# New API 模型广场美化 · new-api Model Plaza

**给 New API / One API 中转站的模型广场（/pricing 定价页）换一套好看、好懂的界面。**
一行代码接入，只读公开接口，**不改后端、不碰数据库、不影响原站运营**。

[在线演示](https://transapi-eng.github.io/new-api-model-plaza/) · [快速接入](#快速接入站长) · [管理员编辑](#管理员可视化编辑) · 由 [Trans86.com](https://trans86.com) 开发维护

`new-api` `one-api` `newapi 定价页` `模型广场` `中转站` `API 价格对比` `Claude` `GPT` `Gemini`

### ✨ 核心亮点

1. **🔑 选好就能开通，不再「跳进后台就找不到了」**：别的模型广场只能看价格，客户选好渠道后要自己去「令牌管理」，常常忘了该选哪个分组。这里在卡片上点「开通」，**直接用这个分组一键创建 API Key**，Key 和接口地址当场复制走。
2. **💰 比官方省多少，一眼看清**：每张卡显示「比官方省 X%」和官方原价 → 实付价，按当日汇率和本站充值价精确换算。
3. **🌳 树状卡片，渠道特点一目了然**：厂商 → 渠道 → 模型分层展示，渠道说明加粗，自动识别零注入 / 满血 / 高缓存 / 企业级等特点。
4. **⚖️ 比价与对比**：一个模型在所有渠道的价格排行；勾选多个「模型@渠道」并排对比价格、成功率、延迟、吞吐。
5. **✏️ 管理员在卡片上直接编辑**：改名、加说明、备注、排序、隐藏、推荐、建精选分组，只改展示，不碰计费。

![选好分组一键开通 API Key](docs/key-flow.jpg)

### 改造前后对比

基于 New API 原版模型广场（`/pricing`）的数据，重新设计展示方式（左：原版，右：本项目；示例站点已匿名）：

![改造前后对比](docs/compare.jpg)

> 原版 `/pricing` 是一张平铺的大表：模型 × 分组 × 倍率全部挤在一起，客户看不出每个渠道的特点，也算不清到底比官方便宜多少。
> Model Plaza 把它整理成 **厂商 → 渠道 → 模型** 的树状卡片，并把「比官方省多少」精确算出来。

---

## 和原版模型广场比，好在哪

| | 原版 `/pricing` | Model Plaza |
|---|---|---|
| 信息结构 | 一张平铺大表，模型、分组、倍率混在一起 | 厂商扇形卡片 → 渠道分支 → 模型卡，层级一目了然 |
| 渠道特点 | 分组名里的几个字，客户要自己猜 | 渠道说明加粗显示；自动识别「零注入 / 满血 / 高缓存 / 可蒸馏 / 企业级 / AWS / Azure…」做成徽章 |
| 和官方比价 | 没有 | 每张卡显示 **比官方省 X%**，附官方原价 → 实付价，按当日汇率和本站充值价精确换算 |
| 动态计费 | 只显示「动态计费」四个字 | 解析 `billing_expr`，长/短上下文分档价格都列出来 |
| 跨渠道比价 | 要一个个分组翻 | 「按模型比价」：一个模型在所有渠道的价格排行 + 柱状对比 |
| 多模型对比 | 没有 | 勾选最多 6 个「模型@渠道」，并排对比价格、折扣、成功率、延迟、吞吐，每行最优自动高亮 |
| 筛选与搜索 | 关键词精确匹配 | 按渠道特点多选筛选；模糊搜索，`OPUS5.5`、`opus 5-5` 都能找到 `claude-opus-5-5`，并自动跳到对应厂商 |
| 状态数据 | 有（新版） | 保留：24 小时成功率色条、平均延迟、吞吐 |
| 选好后开通 | 要自己进后台「令牌管理」，再想起来该选哪个分组 | 卡片上点「开通」，**直接用这个分组一键创建 API Key**，显示 Key 和接口地址，一键复制 |
| 币种 | 跟随站点设置 | 一键切换「$ 额度 / ¥ 人民币」，人民币按充值价换算（不会错用市场汇率） |
| 运营调整 | 改分组名、加说明都要进后台改配置，会影响计费 | 管理员在卡片上 **可视化编辑**：改名、改说明、加备注、加标签、排序、隐藏、推荐、自建精选分组——只改展示，不碰计费 |
| 审美 | 后台表格风格 | 柔和配色、程序生成的风景卡面，自动适配暗色模式和手机 |

![模型卡](docs/cards.jpg)

---

## 功能一览

- **三层树状结构**：厂商卡片可以点、拖、键盘左右切换；渠道沿分支展开，模型卡挂在渠道下。
- **模型卡**：计费方式、输入/输出/缓存价格、比官方省多少、官方原价 → 实付价、24h 成功率色条、延迟、吞吐、一键复制模型名。
- **按模型比价**：同一个模型在各渠道的价格从低到高排列。
- **多选对比**：卡片上勾「对比」，底部托盘里点「开始对比」。
- **筛选**：最低价 + 渠道特点标签，多选取交集（例如「企业级 + 可蒸馏」）。
- **模糊搜索**：忽略大小写和 `. - _ 空格`，按匹配程度排序，当前厂商没有时自动跳到最匹配的厂商。
- **币种切换**：`$ 额度` 与站点余额扣费一致；`¥ 实付` = 额度 × 本站充值价。
- **一键开通 API Key**：展开的分组里有「用此分组开通 API Key」，每张模型卡上有「开通」。已登录的客户点一下就用这个分组创建 Key（不限额度、永不过期），弹窗显示 Key、OpenAI 兼容地址、Claude Code 地址，都能一键复制；未登录时引导登录/注册，并把分组名复制好、写明后台该选哪个分组。调用的是 New API 自带的 `/api/token` 接口，客户自己的账号、自己的操作。
- **管理员可视化编辑**（见下文）。
- **隔离**：Web Component + Shadow DOM，样式不会影响原站，原站样式也不会影响它。
- **零依赖**：单个 `plaza.js`（约 100KB 未压缩），不需要构建工具。

---

## 快速接入（站长）

### 方式一：CDN 引用（推荐，自动更新）

在 new-api **同一个域名**下放一个页面，例如 `models.html`：

```html
<model-plaza config="/plaza.config.json"></model-plaza>
<script src="https://cdn.jsdelivr.net/gh/TransAPI-eng/new-api-model-plaza@0/plaza.js"></script>
```

- `@0` 表示自动使用 0.x 的最新版本；想锁定版本就写 `@0.1.0`，想永远跟最新写 `@main`。
- 官方价文件 `official.json` 和 `plaza.js` 在同一目录，GitHub 每天自动更新一次，CDN 引用的站点**什么都不用做**就能拿到最新官方价。
  （锁定具体版本时，官方价会停在那个版本；可以加 `official="https://cdn.jsdelivr.net/gh/TransAPI-eng/new-api-model-plaza@main/official.json"` 单独跟最新。）
- 用 CDN 时 `config` 要指向你自己站点上的配置文件（见「管理员编辑」）。

### 方式二：自己托管

1. 下载本仓库的 `plaza.js` 和 `official.json`，放到服务器的 `/plaza/` 目录。
2. 复制 [`examples/models.html`](examples/models.html) 到站点根目录。
3. Nginx 示例（new-api 通常已经在 Nginx 后面）：

```nginx
location /plaza/        { alias /var/www/model-plaza/; }
location = /models.html { root  /var/www/model-plaza/examples; }
```

### 方式三：放进 new-api 现有页面

较新版本的 new-api 后台「首页内容」「关于」支持填一个链接（以 iframe 嵌入），把它设为 `https://你的站点/models.html` 即可，不需要改服务器配置。（以你的版本后台说明为准。）

> 想让直接访问 `/pricing` 的客户看到新广场，可以在 Nginx 加一条 `location = /pricing { return 302 /models.html; }`，删掉就能恢复。注意站内点击导航跳转不经过 Nginx，那部分仍是原页面，建议同时把站内菜单链接改到 `/models.html`。

### 跨域部署

页面放在别的域名（如 GitHub Pages）也能用，把接口写成完整地址即可：

```html
<model-plaza api="https://你的站点/api/pricing"
             status="https://你的站点/api/status"
             perf="https://你的站点/api/perf-metrics/summary?hours=24"></model-plaza>
```

但跨域时浏览器拿不到 new-api 的登录状态，**管理员编辑只在同域部署时可用**。

---

## 如何更新到新版本

| 接入方式 | 怎么更新 |
|---|---|
| CDN `@0` / `@main` | 自动。jsDelivr 缓存最长约 12 小时，急用可以访问 `https://purge.jsdelivr.net/gh/TransAPI-eng/new-api-model-plaza@0/plaza.js` 刷新 |
| CDN 锁定 `@0.1.0` | 把版本号改成新的，例如 `@0.2.0` |
| 自己托管 | 用新的 `plaza.js` 覆盖旧文件；`official.json` 可以用 cron 每天下载一次 |

**你的展示配置 `plaza.config.json` 是单独的文件，升级时不会被覆盖。**
在浏览器控制台输入 `ModelPlaza.version` 可以看到当前版本。

自己托管时每天更新官方价的 cron 示例：

```bash
17 9 * * * curl -fsSL https://cdn.jsdelivr.net/gh/TransAPI-eng/new-api-model-plaza@main/official.json -o /var/www/model-plaza/official.json
```

---

## 管理员可视化编辑

![编辑模式](docs/edit.jpg)

用 new-api 的**管理员账号登录后**打开模型广场，右下角会出现「编辑广场」。
是否管理员由 new-api 服务端 `/api/user/self` 确认（role ≥ 10），普通用户和访客看不到编辑入口。

在卡片上直接操作：

- **分组**：点名称、说明直接改；× 删除标签、「＋ 标签」新增；写备注（客户可见，高亮显示）；上移/下移；隐藏。
- **模型卡**：推荐（置顶 + 金色标记）、隐藏、备注、一句话介绍。
- **新增分组**：创建「精选分组」，从真实分组里挑「模型@分组」加进来，价格按来源分组实时计算；精选分组可以删除。
- **撤销**：Ctrl+Z 或顶部「撤销」；「重置为已发布」回到线上版本。
- 草稿自动保存在当前浏览器，顶部显示有几处未发布的修改。

**发布**：点「导出发布文件」得到 `plaza.config.json`，放到 `plaza.js` 同目录（或 `config` 属性指向的位置），客户刷新即生效。
如果你有自己的保存接口，加 `save="/你的接口"`，按钮会变成「发布」，以 `PUT` 方式提交 JSON（接口需要自己校验管理员身份）。

> **为什么不能直接往真实分组里加模型？** 分组里有哪些模型由 new-api 的渠道配置决定，改它会影响计费和路由。Model Plaza 只改展示层；需要「组合推荐」时用精选分组。

配置文件格式见 [`examples/plaza.config.example.json`](examples/plaza.config.example.json)。

---

## 价格怎么算的

| 项目 | 来源 / 公式 |
|---|---|
| 按量计费 | new-api 倍率：`输入 $/1M = model_ratio × 2 × 分组倍率`，输出再乘 `completion_ratio` |
| 动态计费 | 解析 `billing_expr`，如 `tier("standard", p * 10 + c * 50 + cr * 1)`，系数即 $/1M，再乘分组倍率 |
| 按次计费 | `model_price × 分组倍率` |
| `$ 额度` | 站点余额实际扣除的额度（和原站 USD 显示一致） |
| `¥ 人民币` | 额度 × 本站充值价（`/api/status` 的 `price`，即多少元买 1 美元额度） |
| 官方价 | [models.dev](https://models.dev) 中各厂商自家渠道的价格，每天更新 |
| 汇率 | open.er-api.com 当日 USD→CNY，每天随官方价一起更新 |
| 比官方省 | `1 − 实付人民币 ÷ (官方美元价 × 汇率)` |

- 模型名匹配官方价时只做确定的变换（去日期后缀、去 `-high/-xhigh` 等推理强度后缀），**匹配不上就不显示折扣，不编数字**。
- 如果你还通过其他方式收款（比如 Stripe 按不同价格），用 `topup` 属性指定实际充值价。

---

## 属性一览

| 属性 | 默认值 | 说明 |
|---|---|---|
| `api` | `/api/pricing` | 价格接口 |
| `status` | `/api/status` | 站点设置（币种、充值价） |
| `perf` | `/api/perf-metrics/summary?hours=24` | 成功率/延迟/吞吐，没有就不显示 |
| `official` | `plaza.js` 同目录 `official.json` | 官方价 |
| `config` | `plaza.js` 同目录 `plaza.config.json` | 展示配置 |
| `currency` | 跟随站点 | 初始币种 `USD` / `CNY` |
| `topup` | 跟随站点 `price` | 实付多少元买 1 美元额度 |
| `fx` | `official.json` 里的汇率 | 官方价换算汇率 |
| `view` | `channel` | 初始视图：`channel` 按渠道 / `model` 按模型比价 |
| `theme` | 跟随系统 | `light` / `dark` |
| `save` | 无 | 自定义发布接口（PUT JSON） |
| `auth` | `/api/user/self` | 管理员身份校验接口 |
| `no-key` | 无 | 关闭「开通 API Key」按钮 |
| `token-page` | 自动（v1 新版 `/console/token`，旧版 `/token`） | 令牌管理页地址 |
| `token-api` | `/api/token/` | 创建令牌的接口 |
| `login-page` / `register-page` | `/login` / `/register` | 未登录时引导去的页面 |
| `no-credit` | 无 | 去掉页脚的「开源模型广场 · by Trans86」署名（欢迎保留 ❤️） |

---

## 安全说明

- 只调用 new-api 的**公开接口**；价格接口不携带登录凭据。
- 编辑入口只对服务端确认的管理员显示。即使有人强行打开编辑界面，改动也只存在他自己的浏览器里，无法发布。
- 组件运行时不访问任何第三方服务（官方价和汇率由 GitHub Action 预先生成）。示例页 `examples/models.html` 引用了 Google Fonts 的思源宋体，不需要可以删掉那一行，会回退到系统宋体。

## 兼容性

- new-api（含新版 React 前端）、one-api 及其分支；没有 `vendors` 字段的旧版本会按模型名自动归类厂商。
- 现代浏览器（Chrome / Edge / Safari / Firefox 近两年版本），手机端适配。

## 本地预览

```bash
python -m http.server 5178
```

打开 http://localhost:5178 ，演示数据是匿名化的示例站点。

## 开发

- `plaza.js`：组件本体
- `tools/build_official.py`：生成 `official.json`
- `.github/workflows/official.yml`：每天自动更新官方价

欢迎提 Issue 和 PR，尤其是官方价匹配规则和渠道特点关键词。

## 关于作者 · Trans86.com

本项目由 **[Trans86.com](https://trans86.com)** 开发并维护，模型广场的扇形卡片设计就来自 Trans86 的首页：

| 首页 | 模型定价 | 简易教程 |
|---|---|---|
| [![Trans86 首页](docs/trans86-home.jpg)](https://trans86.com) | [![Trans86 定价](docs/trans86-pricing.jpg)](https://trans86.com/#pricing) | [![Trans86 教程](docs/trans86-tutorial.jpg)](https://trans86.com/#tutorial) |

> 💡 如果大家有需求，**Trans86 站点本身（包括上图这套首页设计）也可以开源**，欢迎在 [Issues](https://github.com/TransAPI-eng/new-api-model-plaza/issues) 里留言告诉我们。

**Trans86** 是一个第三方 AI API 中转平台，一个地址统一接入 **Claude / GPT / Gemini** 等模型：

- **按量计费，无月费**：用多少付多少，控制台随时查看余额、Token 用量和费用明细。
- **三步上手**：注册账号 → 创建 API Key → 把站点地址和 Key 填进你常用的工具（Claude Code、Cherry Studio 等）。
- 首页有各模型的价格卡片和客户端配置教程。

👉 **[trans86.com](https://trans86.com)**

### 联系我们

接入问题、合作、定制、想要 Trans86 站点开源，都可以找我们，通常几分钟内回复：

| 方式 | 账号 |
|---|---|
| 微信 | `66476118` 或 `TransAIAPI` |
| QQ | `66476118` |
| 邮箱 | [ljceng@icloud.com](mailto:ljceng@icloud.com) |
| GitHub | [提 Issue](https://github.com/TransAPI-eng/new-api-model-plaza/issues) |

> Trans86 是独立的第三方服务，与 Anthropic、OpenAI、Google 无隶属关系；文中模型名称为其各自所有者的商标。

## 免责声明

本项目是社区开发的前端插件，与 [new-api](https://github.com/QuantumNous/new-api)、[one-api](https://github.com/songquanpeng/one-api) 官方项目无隶属关系，只调用它们的公开接口。价格换算结果仅供参考，以各站点实际扣费为准。

## License

[MIT](LICENSE)
