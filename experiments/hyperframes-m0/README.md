# Hyperframes M0 技术门禁原型

范围固定为三页原生样例：标题、图表、图片。该目录不接入生产导出链路。

## 离线源检查

```powershell
node verify.mjs --strict-local
```

GSAP 3.14.2 已固定在 `assets/gsap.min.js`；检查结果必须为 3 个场景、0 个远程资源。

## 开发环境门禁

```powershell
npx hyperframes doctor
npx hyperframes lint .
npx hyperframes check .
npx hyperframes inspect . --at 1.5,5.4,9.5 --json
npx hyperframes render . --output renders/m0-a.mp4 --fps 25 --quality high --workers 1
npx hyperframes render . --output renders/m0-b.mp4 --fps 25 --quality high --workers 1
node compare-renders.mjs renders/m0-a.mp4 renders/m0-b.mp4
```

比较器会对两次渲染的 `1.5s`、`5.4s`、`9.5s` 原始 RGBA 检查帧计算 SHA-256；三组均一致才通过开发环境确定性门禁。桌面生产包还需重复一次，并主动注入 Hyperframes 失败，确认回退现有 browser frame sequences。

## Electron 生产目录门禁

桌面项目固定依赖 `hyperframes@0.7.71`。用 electron-builder 生成 `win-unpacked` 后，通过打包后的 Electron Node 运行时渲染：

```powershell
node run-packaged-render.mjs C:\path\to\win-unpacked\EasySlide.exe renders\m0-packaged.mp4 --require-packaged-browser
node compare-renders.mjs renders\m0-a.mp4 renders\m0-packaged.mp4
```

构建阶段通过 `scripts/stage-hyperframes-browser.mjs` 将 Hyperframes 验证过的 Chrome 随包交付；运行日志必须显示 `Browser: env`。验证脚本除进程退出码外还强制检查输出文件和 FFprobe，防止 Hyperframes 报错却返回状态码 0。开发与生产包的三组检查帧必须完全一致。

## 未放行项

- 主动注入 Hyperframes 失败后，生产任务尚未自动切换到现有 browser frame sequences；现有后备链路聚焦测试为 3/3 通过。
- Hyperframes 0.7.71 的生产依赖审计存在 1 个 moderate、4 个 high 且暂无上游修复，不能在风险关闭前默认发布。
- 已否决在导出任务内临时启动第二套 Puppeteer 捕帧的方案：故障演练中出现无法按导航超时退出的挂起；生产回退必须复用现有前端上传的 browser frame sequences。

M0 全部门禁通过前不得进入生产导出链路。
