# Ant Design 入门：企业级 React UI 组件库

**Ant Design（antd）是蚂蚁集团开源的企业级 UI 设计语言和 React 组件库，用「设计规范 + 开箱即用组件」帮团队快速搭建一致、可访问的中后台界面。**

## 它是什么

Ant Design 不只是一套 CSS，而是三层叠加：

1. **设计语言** — 色彩、间距、字体、交互模式的企业级规范
2. **React 组件** — Button、Form、Table、Modal 等 60+ 高阶组件
3. **Design Token** — 可主题化的设计变量（颜色、圆角、阴影等）

当前主流版本是 **v5**，底层用 **CSS-in-JS**（`@ant-design/cssinjs`）替代了 v4 的 Less 变量体系，主题定制更灵活，也支持按需加载样式。

## 核心设计理念

antd 强调四个设计价值观（本讲解页的侧边栏、卡片、步骤条都在体现这些原则）：

| 原则 | 含义 | 组件体现 |
|------|------|----------|
| **自然** | 交互符合用户直觉 | 表单校验即时反馈、Modal 焦点管理 |
| **确定性** | 界面行为可预期 | 统一的 Button 类型语义（primary/default/danger） |
| **意义感** | 每个元素有清晰目的 | Typography 层级、Empty 空状态 |
| **生长性** | 系统可扩展 | ConfigProvider 全局配置、Design Token |

## 最小上手

```bash
npm install antd
# 图标库（按需）
npm install @ant-design/icons
```

```tsx
import { Button, ConfigProvider } from 'antd';
import zhCN from 'antd/locale/zh_CN';

export default function App() {
  return (
    <ConfigProvider locale={zhCN}>
      <Button type="primary">提交</Button>
    </ConfigProvider>
  );
}
```

三个必知概念：

- **`ConfigProvider`** — 包裹根组件，注入 locale、theme、componentSize 等全局配置
- **组件 props 即 API** — 如 `<Button type="primary" loading />`，类型由 TypeScript 定义
- **受控 vs 非受控** — Form、Input、Select 等表单类组件遵循 React 受控模式

## 组件分层（怎么选）

| 场景 | 常用组件 | 备注 |
|------|----------|------|
| 页面骨架 | Layout, Menu, Breadcrumb | 本页即 Layout + Sider 范例 |
| 数据录入 | Form, Input, Select, DatePicker | Form 内置校验与布局 |
| 数据展示 | Table, Descriptions, Tag, Statistic | Table 支持 sort/filter/pagination |
| 反馈 | Modal, message, notification, Spin | 命令式 API（message.success） |
| 导航 | Tabs, Steps, Anchor | 长页内导航 |

**Form + Table** 是中后台的「双子星」：Form 负责录入与校验，Table 负责列表与批量操作。

## 主题定制（v5 重点）

v5 通过 `ConfigProvider` 的 `theme` 属性覆盖 Design Token：

```tsx
<ConfigProvider theme={{
  token: { colorPrimary: '#722ed1', borderRadius: 8 },
  components: { Button: { controlHeight: 36 } }
}}>
  {children}
</ConfigProvider>
```

- **`token`** — 全局设计变量（主色、字号、圆角…）
- **`components`** — 单个组件级别的 token 覆盖
- 可用 `@ant-design/colors` 生成色板，或用 Ant Design 官方 Theme Editor 可视化调试

## 生态

- **Ant Design Pro** — 中后台脚手架（路由、权限、布局模板）
- **ProComponents** — 基于 antd 封装的 ProTable、ProForm 等「配置化」高级组件
- **Ant Design Mobile / Mini Program** — 移动端与小程序版本（API 风格相似但独立维护）
- **@ant-design/charts** — 图表库，与 antd 视觉一致

## 与同类库对比

| | Ant Design | Material UI | shadcn/ui |
|---|-----------|-------------|-----------|
| 风格 | 企业后台、信息密度高 | Material 风、偏消费端 | 无样式约束、Tailwind |
| 组件完整度 | 极高（含复杂 Table/Form） | 高 | 需自行组合 |
| 定制方式 | Design Token | sx / theme | 复制源码到项目 |
| 典型场景 | 中后台、B 端 SaaS | 通用 Web App | 高度定制的设计系统 |

## 易错点

1. **忘记包 ConfigProvider** — 中文 locale、主题、静态方法 context 都依赖它
2. **Form 嵌套 Form** — 默认不支持，需用 `Form.List` 或拆分子 Form
3. **Table rowKey** — 必须提供唯一 key，否则 selection 和展开会出 bug
4. **message/notification 样式丢失** — 静态方法需在 ConfigProvider 子树内，或使用 `App.useApp()` hook（v5 推荐）
5. **v4 → v5 迁移** — Less 变量改为 Token；部分 API 重命名，用官方 codemod 辅助

## 要点回顾

- antd = 设计语言 + React 组件 + Design Token，专精**企业级中后台**
- v5 用 CSS-in-JS + ConfigProvider theme 做主题，不再依赖 Less
- 掌握 Layout / Form / Table / Modal 四个组件族即可覆盖 80% 页面
- 复杂项目可叠加 ProComponents；移动端用 antd-mobile
- **本讲解页本身即 antd 实战**：Layout 导航、Card 分节、Form 演示、Table 数据、Steps 流程——所见即所学
