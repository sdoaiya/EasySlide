import { expect, test, type Page } from '@playwright/test'
import { writeFileSync } from 'node:fs'
import JSZip from 'jszip'

const projectId = 'native-workspace-e2e'
const dashiProjectId = 'dashi-workspace-e2e'
const huashuProjectId = 'huashu-workspace-e2e'

const visualSystems = ['editorial', 'signal', 'route', 'contrast', 'spotlight', 'caution'] as const

const huashuSlides = [
  { layout: 'core01_statement', props: { kicker: '核心判断与关键依据', title: '从一次性交付转向持续经营能力建设', summary: '真正拉开差距的不是功能数量，而是需求识别、交付质量与复购增长能否形成稳定闭环。', points: ['明确最值得投入的核心场景', '用可验证结果替代宽泛承诺', '沉淀可重复使用的交付资产', '让客户成功成为增长起点'] } },
  { layout: 'core01_evidence', props: { title: '增长正在从试点走向规模化', summary: '四组相互印证的数据说明，市场关注点已经从是否可用转向是否能稳定创造业务价值。', metrics: ['试点转正式项目比例提升至 68%', '平均交付周期缩短至 21 天', '重点客户续约率达到 84%', '标准资产复用率超过 72%'] } },
  { layout: 'core01_narrative', props: { kicker: '推进路线与阶段目标', title: '用三个阶段完成能力升级', summary: '先跑通高价值场景，再建立标准交付体系，最后通过数据反馈持续优化。', steps: ['验证场景价值与用户意愿', '固化流程、模板和质量标准', '规模复制并持续复盘迭代', '形成跨团队的统一经营节奏'] } },
  { layout: 'core01_risk', props: { title: '规模化之前必须处理四类风险', summary: '如果只追求页面数量而忽略内容、资产和交付治理，增长越快，返工成本越高。', risks: ['需求边界持续漂移导致交付失控', '视觉资产缺少规则造成品牌割裂', '数据口径不统一影响决策可信度', '成功经验未沉淀导致重复劳动'] } },
  { layout: 'core01_decision', props: { kicker: '决策建议与选择依据', title: '优先建设可复用的交付底座', recommendation: '建议采用标准能力为主、重点场景增强的路线，在控制复杂度的同时保留差异化表达空间。', options: ['统一内容与视觉契约', '建立高频布局和资产库', '保留关键页面定制能力', '按质量数据持续优化'] } },
  { layout: 'core01_image_story', props: { kicker: '场景观察与用户证据', title: '真实工作流决定产品价值', summary: '用户不是为了生成一份演示文稿而来，而是要更快完成从思考、表达、协作到交付的完整过程。', caption: '团队围绕同一份方案完成评审与迭代', image: 'assets/native-theme-previews/theme01.jpg' } },
  { layout: 'core01_quote', props: { kicker: '客户原话与真实反馈', quote: '我需要的不是更多模板，而是一套能让我把复杂问题讲清楚、还能继续修改的工作方式。', attribution: '某企业解决方案负责人', summary: '可编辑、可复用和结果稳定，比单次生成速度更决定长期使用意愿。' } },
  { layout: 'core01_actions', props: { title: '未来四周的落地动作', summary: '每项行动都对应明确负责人、交付物和验收结果，避免升级停留在概念层面。', actions: ['完成高频场景与布局映射', '建立页面级质量检查机制', '打通素材生成与人工替换', '统一编辑、预览和导出结果', '用真实项目完成回归验收'] } },
  { layout: 'core01_matrix', props: { title: '按价值与成熟度配置资源', xLabel: '能力成熟度由低到高', yLabel: '业务价值由低到高', items: ['重点突破：高价值待验证', '规模复制：高价值高成熟', '谨慎投入：低价值待验证', '标准维护：低价值高成熟'] } },
  { layout: 'core01_timeline', props: { title: '十二周能力升级路线图', milestones: ['第 1-2 周：完成基线评估', '第 3-4 周：补齐高频布局', '第 5-6 周：接入智能素材', '第 7-8 周：建立自动质检', '第 9-10 周：统一多格式导出', '第 11-12 周：真实项目验收'] } },
  { layout: 'core01_architecture', props: { kicker: '能力架构与协同关系', title: '四层能力共同支撑稳定交付', summary: '上层体验保持简单，底层通过设计、内容、资产和质量规则保证结果一致。', layers: ['交互与编辑体验层', '叙事与页面设计层', '素材与媒体生成层', '质量检查与导出层'] } },
  { layout: 'core01_profile', props: { kicker: '关键角色与能力画像', name: '解决方案负责人', role: '连接客户目标、内容策略与交付质量', summary: '既理解业务问题，也能把复杂信息转译为清晰结构，并推动跨团队完成高质量交付。', highlights: ['业务洞察', '叙事设计', '交付治理', '客户成功'], image: 'assets/native-theme-previews/theme09.jpg' } },
  { layout: 'core01_funnel', props: { kicker: '客户转化与价值递进', title: '从需求触达到长期复购', summary: '每一层都需要明确价值证明，不能依赖一次演示直接跨越信任建立过程。', stages: ['需求触达与问题识别', '方案验证与价值共识', '项目交付与结果确认', '能力扩展与组织复用', '长期续约与客户推荐'] } },
].map((slide, index) => ({
  id: `huashu-page-${index + 1}`,
  page_id: `huashu-page-${index + 1}`,
  order_index: index,
  status: 'NATIVE_GENERATED',
  outline_content: { title: String(slide.props.title || slide.props.name || slide.props.quote || `第 ${index + 1} 页`), points: [] },
  native_layout: slide.layout,
  native_props: {
    ...slide.props,
    __design_intent: {
      design_engine: 'huashu_native',
      page_plan: { visual_system: visualSystems[index % visualSystems.length] },
      quality_report: { status: 'pass', score: 100, issues: [] },
    },
  },
}))

async function mockNativeProject(page: Page) {
  await page.addInitScript(() => localStorage.setItem('hasSeenHelpModal', 'true'))
  await page.route(url => new URL(url).pathname.startsWith('/api/'), async (route) => {
    const pathname = new URL(route.request().url()).pathname
    if (pathname === '/api/access-code/check') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: { enabled: false } }) })
    }
    if (pathname === '/api/settings') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: { output_language: 'zh' } }) })
    }
    if (pathname === '/api/output-language') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: { language: 'zh' } }) })
    }
    if (pathname === `/api/projects/${projectId}`) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            id: projectId,
            project_id: projectId,
            idea_prompt: '原生工作区视觉验收',
            render_mode: 'native',
            status: 'NATIVE_DECK_GENERATED',
            pages: [
              { id: 'page-1', page_id: 'page-1', order_index: 0, status: 'NATIVE_GENERATED', outline_content: { title: '原生页面验收', points: [] }, native_layout: 'core01_cover', native_props: { kicker: 'EasySlide', title: '原生页面验收', subtitle: '逐元素可编辑导出' } },
              { id: 'page-2', page_id: 'page-2', order_index: 1, status: 'NATIVE_GENERATED', outline_content: { title: '第二页', points: [] }, native_layout: 'core01_end', native_props: { title: '第二页', subtitle: '保持结构化编辑' } },
            ],
          },
        }),
      })
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: {} }) })
  })
}

async function mockDashiProject(page: Page) {
  await page.addInitScript(() => localStorage.setItem('hasSeenHelpModal', 'true'))
  await page.route(url => new URL(url).pathname.startsWith('/api/'), async (route) => {
    const pathname = new URL(route.request().url()).pathname
    if (pathname === '/api/access-code/check') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: { enabled: false } }) })
    if (pathname === '/api/settings') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: { output_language: 'zh' } }) })
    if (pathname === '/api/output-language') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: { language: 'zh' } }) })
    if (pathname === `/api/projects/${dashiProjectId}`) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            id: dashiProjectId,
            project_id: dashiProjectId,
            idea_prompt: 'DashiAI 主题验收',
            render_mode: 'native',
            native_theme: 'theme01',
            status: 'NATIVE_DECK_GENERATED',
            pages: [
              {
                id: 'page-roadmap', page_id: 'page-roadmap', order_index: 0, status: 'NATIVE_GENERATED',
                outline_content: { title: '产品升级路线图', points: [] }, native_layout: 'theme01_page040',
                native_props: {
                  title: '产品升级路线图',
                  phases: [
                    { period: 'Q1', step: '01', heading: '能力验证', points: ['主题运行时', '逐元素编辑'], verdict: '可用' },
                    { period: 'Q2', step: '02', heading: '质量提升', points: ['布局去重', '导出校验'], verdict: '稳定' },
                    { period: 'Q3', step: '03', heading: '规模推广', points: ['全主题覆盖', '资产复用'], verdict: '交付' },
                  ],
                },
              },
              {
                id: 'page-code', page_id: 'page-code', order_index: 1, status: 'NATIVE_GENERATED',
                outline_content: { title: '技术路线导览', points: [] }, native_layout: 'theme03_page006',
                native_props: { titlePre: '技术', titleAccent: '路线导览', showDecor: true, decorSrc: 'assets/3d/08.png' },
              },
              {
                id: 'page-unicorn', page_id: 'page-unicorn', order_index: 2, status: 'NATIVE_GENERATED',
                outline_content: { title: '动态背景验收', points: [] }, native_layout: 'theme01_page030',
                native_props: { title: '动态背景验收', backgroundMode: 'unicorn', unicornScene: 'tech' },
              },
            ],
          },
        }),
      })
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: {} }) })
  })
}

async function mockHuashuProject(page: Page, onExportComplete?: (request: import('@playwright/test').Request) => void) {
  await page.addInitScript(() => localStorage.setItem('hasSeenHelpModal', 'true'))
  await page.route(url => new URL(url).pathname.startsWith('/api/'), async (route) => {
    const pathname = new URL(route.request().url()).pathname
    if (pathname === '/api/access-code/check') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: { enabled: false } }) })
    if (pathname === '/api/settings') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: { output_language: 'zh' } }) })
    if (pathname === '/api/output-language') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: { language: 'zh' } }) })
    if (pathname === `/api/projects/${huashuProjectId}/export/native-pptx` && route.request().method() === 'POST') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: { task_id: 'huashu-export-task', status: 'PENDING' } }) })
    }
    if (pathname === `/api/projects/${huashuProjectId}/export/native-pptx/huashu-export-task/progress`) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: { task_id: 'huashu-export-task', status: 'PROCESSING' } }) })
    }
    if (pathname === `/api/projects/${huashuProjectId}/export/native-pptx/huashu-export-task/complete`) {
      onExportComplete?.(route.request())
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: { task_id: 'huashu-export-task', status: 'COMPLETED', progress: { download_url: '/files/huashu/exports/huashu.pptx', filename: 'Huashu 原生设计系统视觉验收.pptx' } } }) })
    }
    if (pathname === `/api/projects/${huashuProjectId}`) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            id: huashuProjectId,
            project_id: huashuProjectId,
            idea_prompt: 'Huashu 原生设计系统视觉验收',
            render_mode: 'native',
            status: 'NATIVE_DECK_GENERATED',
            pages: huashuSlides,
          },
        }),
      })
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: {} }) })
  })
}

function extractPptxFromMultipart(request: import('@playwright/test').Request) {
  const body = request.postDataBuffer()
  const boundary = request.headers()['content-type']?.match(/boundary=([^;]+)/i)?.[1]
  if (!body || !boundary) throw new Error('导出上传请求缺少 multipart 文件内容')
  const start = body.indexOf(Buffer.from([0x50, 0x4b, 0x03, 0x04]))
  const end = body.indexOf(Buffer.from(`\r\n--${boundary}`), start)
  if (start < 0 || end <= start) throw new Error('导出上传请求中未找到有效 PPTX 文件')
  return body.subarray(start, end)
}

for (const viewport of [
  { width: 1200, height: 760 },
  { width: 1440, height: 900 },
  { width: 1920, height: 1080 },
]) {
  test(`native workspace fits ${viewport.width}x${viewport.height}`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport)
    await mockNativeProject(page)
    await page.goto(`/project/${projectId}/preview`)

    const shell = page.locator('.workspace-shell')
    await expect(shell).toBeVisible()
    await expect(page.getByRole('main')).toContainText('原生页面验收')
    await expect(shell).toHaveAttribute('data-inspector-layout', viewport.width === 1200 ? 'drawer' : 'column')

    const inspector = page.getByRole('complementary', { name: '属性栏' })

    if (viewport.width === 1200) {
      const openInspector = page.locator('.workspace-shell > header button[aria-label="打开属性栏"]')
      await expect(openInspector).toBeVisible()
      await openInspector.click()
      await expect(inspector).toBeVisible()
    }

    await inspector.getByRole('tab', { name: '内容' }).click()
    await expect(inspector.getByRole('textbox', { name: 'title', exact: true })).toBeVisible()

    await inspector.getByRole('tab', { name: '动效' }).click()
    await inspector.getByText('页面动效').click()
    await inspector.getByRole('combobox', { name: '进入效果' }).selectOption('fade')
    await expect(page.getByRole('button', { name: '重新预览动效' })).toBeEnabled()
    await page.getByRole('button', { name: '重新预览动效' }).click()
    await expect(page.locator('main .native-enter-fade')).toHaveClass(/native-enter-fade/)
    await page.getByRole('button', { name: /第 2 页/ }).click()
    await inspector.getByRole('combobox', { name: '页面切换' }).selectOption('cover')
    await inspector.getByRole('combobox', { name: '切换速度' }).selectOption('slow')
    await inspector.getByRole('combobox', { name: '切换方向' }).selectOption('u')
    await page.getByRole('button', { name: /第 1 页/ }).click()
    await page.getByRole('button', { name: /第 2 页/ }).click()
    await expect(page.locator('main .native-page-transition-cover')).toHaveClass(/native-page-transition-cover/)

    const overflow = await page.evaluate(() => ({
      width: document.documentElement.scrollWidth - window.innerWidth,
      height: document.documentElement.scrollHeight - window.innerHeight,
    }))
    expect(overflow.width).toBeLessThanOrEqual(1)
    expect(overflow.height).toBeLessThanOrEqual(1)
    await page.screenshot({ path: testInfo.outputPath(`native-${viewport.width}x${viewport.height}.png`), fullPage: true })
  })
}

test('DashiAI runtime renders complex props and copied assets', async ({ page }) => {
  test.setTimeout(90_000)
  await page.setViewportSize({ width: 1440, height: 900 })
  await mockDashiProject(page)
  await page.goto(`/project/${dashiProjectId}/preview`)

  await expect(page.getByRole('main')).toContainText('产品升级路线图')
  const inspector = page.getByRole('complementary', { name: '属性栏' })
  await inspector.getByRole('tab', { name: '内容' }).click()
  await expect(inspector).toContainText('phases')
  const navigator = page.getByTestId('native-page-navigator')
  await navigator.getByRole('button', { name: '下一页' }).click()
  await expect(page.getByRole('main')).toContainText('技术路线导览')
  const decor = page.getByRole('main').locator('img').first()
  await expect(decor).toBeVisible()
  await expect.poll(() => decor.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(0)

  await navigator.getByRole('button', { name: '下一页' }).click()
  const unicornFrame = page.locator('main .bt-unicorn-frame[data-unicorn-ready="true"]').first()
  await expect(unicornFrame).toBeVisible({ timeout: 15000 })
  const canvas = unicornFrame.locator('canvas')
  await expect(canvas).toBeVisible()
  await expect(canvas).toHaveAttribute('width', /[1-9]\d*/)
  await expect(canvas).toHaveAttribute('height', /[1-9]\d*/)

  const overflow = await page.evaluate(() => ({
    width: document.documentElement.scrollWidth - window.innerWidth,
    height: document.documentElement.scrollHeight - window.innerHeight,
  }))
  expect(overflow.width).toBeLessThanOrEqual(1)
  expect(overflow.height).toBeLessThanOrEqual(1)
})

test('Huashu layouts keep long Chinese copy, media, and visual systems inside the slide', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1920, height: 1080 })
  await mockHuashuProject(page)
  await page.goto(`/project/${huashuProjectId}/preview`)

  await expect(page.locator('main .native-slide')).toHaveAttribute('data-native-layout-ready', 'true')
  const accents = new Set<string>()

  for (let index = 0; index < huashuSlides.length; index += 1) {
    await page.getByRole('button', { name: new RegExp(`^第 ${index + 1} 页`) }).click()
    const slide = page.locator('main .native-slide').last()
    await expect(slide).toHaveAttribute('data-layout', huashuSlides[index].native_layout)
    await expect(slide).toHaveAttribute('data-design-engine', 'huashu_native')
    await expect(slide).toHaveAttribute('data-visual-system', visualSystems[index % visualSystems.length])

    const audit = await slide.evaluate((root) => {
      const slideRect = root.getBoundingClientRect()
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
      const escapedText: string[] = []
      let node = walker.nextNode()
      while (node) {
        const text = node.textContent?.trim() || ''
        const parent = node.parentElement
        if (text && parent && getComputedStyle(parent).visibility !== 'hidden') {
          const range = document.createRange()
          range.selectNodeContents(node)
          const rect = range.getBoundingClientRect()
          if (rect.width > 0 && rect.height > 0 && (
            rect.left < slideRect.left - 1 || rect.top < slideRect.top - 1 ||
            rect.right > slideRect.right + 1 || rect.bottom > slideRect.bottom + 1
          )) escapedText.push(text)
        }
        node = walker.nextNode()
      }
      const images = Array.from(root.querySelectorAll<HTMLImageElement>('img')).map(image => ({
        source: image.getAttribute('src') || '',
        naturalWidth: image.naturalWidth,
        naturalHeight: image.naturalHeight,
      }))
      const style = getComputedStyle(root)
      return {
        escapedText,
        accent: style.getPropertyValue('--huashu-accent').trim(),
        images,
        scrollWidth: root.scrollWidth,
        scrollHeight: root.scrollHeight,
      }
    })

    expect(audit.escapedText, `${huashuSlides[index].native_layout} has text outside the slide`).toEqual([])
    expect(audit.scrollWidth).toBe(1920)
    expect(audit.scrollHeight).toBe(1080)
    expect(audit.accent).not.toBe('')
    accents.add(audit.accent)
    for (const image of audit.images) {
      expect(image.source).not.toBe('')
      expect(image.naturalWidth).toBeGreaterThan(0)
      expect(image.naturalHeight).toBeGreaterThan(0)
    }
    if (huashuSlides[index].native_layout === 'core01_actions') {
      const summaryContrast = await slide.evaluate((root) => {
        const parseRgb = (value: string) => (value.match(/[\d.]+/g) || []).slice(0, 3).map(Number)
        const luminance = (value: string) => {
          const channels = parseRgb(value).map(channel => {
            const normalized = channel / 255
            return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4
          })
          return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2]
        }
        const foreground = getComputedStyle(root.querySelector('.core01-actions-heading p') as Element).color
        const background = getComputedStyle(root.querySelector('.core01-actions') as Element).backgroundColor
        const light = Math.max(luminance(foreground), luminance(background))
        const dark = Math.min(luminance(foreground), luminance(background))
        return (light + 0.05) / (dark + 0.05)
      })
      expect(summaryContrast).toBeGreaterThanOrEqual(4.5)
    }
    await slide.screenshot({ path: testInfo.outputPath(`huashu-${String(index + 1).padStart(2, '0')}-${huashuSlides[index].native_layout}.png`) })
  }

  expect(accents.size).toBe(visualSystems.length)
  const overflow = await page.evaluate(() => ({
    width: document.documentElement.scrollWidth - window.innerWidth,
    height: document.documentElement.scrollHeight - window.innerHeight,
  }))
  expect(overflow.width).toBeLessThanOrEqual(1)
  expect(overflow.height).toBeLessThanOrEqual(1)
})

test('Huashu workspace exports a valid editable 13-slide PPTX through the task flow', async ({ page }, testInfo) => {
  test.setTimeout(180_000)
  let uploadedPptx: Buffer | undefined
  await page.setViewportSize({ width: 1920, height: 1080 })
  await mockHuashuProject(page, (request) => { uploadedPptx = extractPptxFromMultipart(request) })
  await page.goto(`/project/${huashuProjectId}/preview`)

  await expect(page.locator('main .native-slide')).toHaveAttribute('data-native-layout-ready', 'true')
  await page.getByRole('button', { name: '导出PPTX' }).click()
  await expect.poll(() => uploadedPptx?.length || 0, { timeout: 150_000 }).toBeGreaterThan(10_000)

  const outputPath = testInfo.outputPath('huashu-editable-13-slides.pptx')
  writeFileSync(outputPath, uploadedPptx!)
  const archive = await JSZip.loadAsync(uploadedPptx!)
  const slideFiles = Object.keys(archive.files).filter(name => /^ppt\/slides\/slide\d+\.xml$/.test(name))
  expect(slideFiles).toHaveLength(huashuSlides.length)
  expect(archive.file('[Content_Types].xml')).not.toBeNull()
  expect(archive.file('ppt/presentation.xml')).not.toBeNull()
  expect(archive.file('ppt/_rels/presentation.xml.rels')).not.toBeNull()

  const slideXml = await Promise.all(slideFiles.map(name => archive.file(name)!.async('string')))
  const allSlideXml = slideXml.join('\n')
  const editableText = slideXml.flatMap(xml => Array.from(xml.matchAll(/<a:t>([\s\S]*?)<\/a:t>/g), match => match[1])).join('')
  expect(editableText).toContain('从一次性交付转向持续经营能力建设')
  expect(editableText).toContain('解决方案负责人')
  expect(editableText).not.toContain('The quick brown fox jumps over the lazy dog.')
  expect(editableText.toLowerCase()).not.toContain('lorem')
  expect(allSlideXml).toContain('typeface="Noto Sans SC"')
  expect(allSlideXml).toContain('typeface="Noto Serif SC"')
  expect(slideXml.every(xml => xml.includes('<p:sld'))).toBe(true)
  await testInfo.attach('huashu-editable-pptx', { path: outputPath, contentType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' })
})
