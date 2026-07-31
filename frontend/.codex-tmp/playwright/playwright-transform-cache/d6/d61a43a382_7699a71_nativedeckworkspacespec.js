import { expect, test } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import JSZip from 'jszip';
const projectId = 'native-workspace-e2e';
const dashiProjectId = 'dashi-workspace-e2e';
const huashuProjectId = 'huashu-workspace-e2e';
const visualSystems = ['editorial', 'signal', 'route', 'contrast', 'spotlight', 'caution'];
const huashuSlides = [{
  layout: 'core01_statement',
  props: {
    kicker: '核心判断与关键依据',
    title: '从一次性交付转向持续经营能力建设',
    summary: '真正拉开差距的不是功能数量，而是需求识别、交付质量与复购增长能否形成稳定闭环。',
    points: ['明确最值得投入的核心场景', '用可验证结果替代宽泛承诺', '沉淀可重复使用的交付资产', '让客户成功成为增长起点']
  }
}, {
  layout: 'core01_evidence',
  props: {
    title: '增长正在从试点走向规模化',
    summary: '四组相互印证的数据说明，市场关注点已经从是否可用转向是否能稳定创造业务价值。',
    metrics: ['试点转正式项目比例提升至 68%', '平均交付周期缩短至 21 天', '重点客户续约率达到 84%', '标准资产复用率超过 72%']
  }
}, {
  layout: 'core01_narrative',
  props: {
    kicker: '推进路线与阶段目标',
    title: '用三个阶段完成能力升级',
    summary: '先跑通高价值场景，再建立标准交付体系，最后通过数据反馈持续优化。',
    steps: ['验证场景价值与用户意愿', '固化流程、模板和质量标准', '规模复制并持续复盘迭代', '形成跨团队的统一经营节奏']
  }
}, {
  layout: 'core01_risk',
  props: {
    title: '规模化之前必须处理四类风险',
    summary: '如果只追求页面数量而忽略内容、资产和交付治理，增长越快，返工成本越高。',
    risks: ['需求边界持续漂移导致交付失控', '视觉资产缺少规则造成品牌割裂', '数据口径不统一影响决策可信度', '成功经验未沉淀导致重复劳动']
  }
}, {
  layout: 'core01_decision',
  props: {
    kicker: '决策建议与选择依据',
    title: '优先建设可复用的交付底座',
    recommendation: '建议采用标准能力为主、重点场景增强的路线，在控制复杂度的同时保留差异化表达空间。',
    options: ['统一内容与视觉契约', '建立高频布局和资产库', '保留关键页面定制能力', '按质量数据持续优化']
  }
}, {
  layout: 'core01_image_story',
  props: {
    kicker: '场景观察与用户证据',
    title: '真实工作流决定产品价值',
    summary: '用户不是为了生成一份演示文稿而来，而是要更快完成从思考、表达、协作到交付的完整过程。',
    caption: '团队围绕同一份方案完成评审与迭代',
    image: 'assets/native-theme-previews/theme01.jpg'
  }
}, {
  layout: 'core01_quote',
  props: {
    kicker: '客户原话与真实反馈',
    quote: '我需要的不是更多模板，而是一套能让我把复杂问题讲清楚、还能继续修改的工作方式。',
    attribution: '某企业解决方案负责人',
    summary: '可编辑、可复用和结果稳定，比单次生成速度更决定长期使用意愿。'
  }
}, {
  layout: 'core01_actions',
  props: {
    title: '未来四周的落地动作',
    summary: '每项行动都对应明确负责人、交付物和验收结果，避免升级停留在概念层面。',
    actions: ['完成高频场景与布局映射', '建立页面级质量检查机制', '打通素材生成与人工替换', '统一编辑、预览和导出结果', '用真实项目完成回归验收']
  }
}, {
  layout: 'core01_matrix',
  props: {
    title: '按价值与成熟度配置资源',
    xLabel: '能力成熟度由低到高',
    yLabel: '业务价值由低到高',
    items: ['重点突破：高价值待验证', '规模复制：高价值高成熟', '谨慎投入：低价值待验证', '标准维护：低价值高成熟']
  }
}, {
  layout: 'core01_timeline',
  props: {
    title: '十二周能力升级路线图',
    milestones: ['第 1-2 周：完成基线评估', '第 3-4 周：补齐高频布局', '第 5-6 周：接入智能素材', '第 7-8 周：建立自动质检', '第 9-10 周：统一多格式导出', '第 11-12 周：真实项目验收']
  }
}, {
  layout: 'core01_architecture',
  props: {
    kicker: '能力架构与协同关系',
    title: '四层能力共同支撑稳定交付',
    summary: '上层体验保持简单，底层通过设计、内容、资产和质量规则保证结果一致。',
    layers: ['交互与编辑体验层', '叙事与页面设计层', '素材与媒体生成层', '质量检查与导出层']
  }
}, {
  layout: 'core01_profile',
  props: {
    kicker: '关键角色与能力画像',
    name: '解决方案负责人',
    role: '连接客户目标、内容策略与交付质量',
    summary: '既理解业务问题，也能把复杂信息转译为清晰结构，并推动跨团队完成高质量交付。',
    highlights: ['业务洞察', '叙事设计', '交付治理', '客户成功'],
    image: 'assets/native-theme-previews/theme09.jpg'
  }
}, {
  layout: 'core01_funnel',
  props: {
    kicker: '客户转化与价值递进',
    title: '从需求触达到长期复购',
    summary: '每一层都需要明确价值证明，不能依赖一次演示直接跨越信任建立过程。',
    stages: ['需求触达与问题识别', '方案验证与价值共识', '项目交付与结果确认', '能力扩展与组织复用', '长期续约与客户推荐']
  }
}].map((slide, index) => ({
  id: `huashu-page-${index + 1}`,
  page_id: `huashu-page-${index + 1}`,
  order_index: index,
  status: 'NATIVE_GENERATED',
  outline_content: {
    title: String(slide.props.title || slide.props.name || slide.props.quote || `第 ${index + 1} 页`),
    points: []
  },
  native_layout: slide.layout,
  native_props: {
    ...slide.props,
    __design_intent: {
      design_engine: 'huashu_native',
      page_plan: {
        visual_system: visualSystems[index % visualSystems.length]
      },
      quality_report: {
        status: 'pass',
        score: 100,
        issues: []
      }
    }
  }
}));
async function mockNativeProject(page, onBrowserFrames) {
  await page.addInitScript(() => localStorage.setItem('hasSeenHelpModal', 'true'));
  await page.route(url => new URL(url).pathname.startsWith('/api/'), async route => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname === '/api/access-code/check') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            enabled: false
          }
        })
      });
    }
    if (pathname === '/api/settings') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            output_language: 'zh'
          }
        })
      });
    }
    if (pathname === '/api/output-language') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            language: 'zh'
          }
        })
      });
    }
    if (pathname === `/api/content-projects/${projectId}`) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            project_id: projectId,
            last_workspace: 'ppt',
            pending_sync_count: 0,
            spine: {
              id: 'spine-native-workspace',
              project_id: projectId,
              revision: 1,
              status: 'confirmed',
              content_hash: 'native-workspace-hash',
              document: {
                topic: {
                  value: '原生工作区视觉验收'
                },
                sections: []
              }
            },
            workspaces: [{
              id: 'ppt-native-workspace',
              project_id: projectId,
              kind: 'ppt',
              state: 'draft',
              revision: 1,
              source_kind: 'spine',
              settings: {}
            }, {
              id: 'video-native-workspace',
              project_id: projectId,
              kind: 'video',
              state: 'draft',
              revision: 1,
              source_kind: 'ppt',
              settings: {}
            }, {
              id: 'podcast-native-workspace',
              project_id: projectId,
              kind: 'podcast',
              state: 'uninitialized',
              revision: 0,
              source_kind: 'manual',
              settings: {}
            }]
          }
        })
      });
    }
    if (pathname === `/api/projects/${projectId}/narrations`) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            pages: ['page-1', 'page-2'].map((pageId, index) => ({
              page_id: pageId,
              order_index: index,
              current_version_id: `narration-${index + 1}`,
              revision: 1,
              word_count: 10,
              estimated_seconds: 3,
              candidate_count: 0
            })),
            total_pages: 2,
            confirmed_pages: 2,
            missing_pages: 0,
            candidate_pages: 0
          }
        })
      });
    }
    if (pathname === `/api/projects/${projectId}/export/video/preflight`) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            can_export: true,
            errors: [],
            warnings: []
          }
        })
      });
    }
    if (pathname === `/api/content-projects/${projectId}/workspaces/video/browser-frames`) {
      onBrowserFrames === null || onBrowserFrames === void 0 || onBrowserFrames(route.request());
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            attached: true
          }
        })
      });
    }
    if (pathname === `/api/projects/${projectId}/export/native-video`) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            task_id: 'native-video-task'
          }
        })
      });
    }
    if (pathname === `/api/projects/${projectId}/tasks/native-video-task`) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            id: 'native-video-task',
            status: 'COMPLETED',
            progress: {
              total: 2,
              completed: 2,
              percent: 100
            }
          }
        })
      });
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
            pages: [{
              id: 'page-1',
              page_id: 'page-1',
              order_index: 0,
              status: 'NATIVE_GENERATED',
              outline_content: {
                title: '原生页面验收',
                points: []
              },
              native_layout: 'core01_cover',
              native_props: {
                kicker: 'EasySlide',
                title: '原生页面验收',
                subtitle: '逐元素可编辑导出',
                __animation: {
                  elementEnter: 'fade'
                }
              }
            }, {
              id: 'page-2',
              page_id: 'page-2',
              order_index: 1,
              status: 'NATIVE_GENERATED',
              outline_content: {
                title: '第二页',
                points: []
              },
              native_layout: 'core01_end',
              native_props: {
                title: '第二页',
                subtitle: '保持结构化编辑'
              }
            }]
          }
        })
      });
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        data: {}
      })
    });
  });
}
function inspectBrowserFrameMultipart(request) {
  var _request$headers$cont;
  const body = request.postDataBuffer();
  const boundary = (_request$headers$cont = request.headers()['content-type']) === null || _request$headers$cont === void 0 || (_request$headers$cont = _request$headers$cont.match(/boundary=([^;]+)/i)) === null || _request$headers$cont === void 0 ? void 0 : _request$headers$cont[1];
  if (!body || !boundary) throw new Error('Browser Frames 请求缺少 multipart 内容');
  const text = body.toString('latin1');
  const readField = name => {
    const match = new RegExp(`name="${name}"\\r\\n\\r\\n([^\\r\\n]+)`).exec(text);
    if (!match) throw new Error(`Browser Frames 请求缺少 ${name}`);
    return JSON.parse(match[1]);
  };
  const marker = 'name="frames"';
  const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const frameCount = text.split(marker).length - 1;
  const pngs = [];
  let cursor = 0;
  while (pngs.length < frameCount) {
    const pngStart = body.indexOf(pngSignature, cursor);
    const pngEnd = body.indexOf(Buffer.from(`\r\n--${boundary}`), pngStart);
    if (pngStart < 0 || pngEnd <= pngStart) throw new Error('Browser Frames 请求中没有有效 PNG');
    pngs.push(body.subarray(pngStart, pngEnd));
    cursor = pngEnd;
  }
  return {
    pageIds: readField('page_ids'),
    frameCounts: readField('frame_counts'),
    frameCount,
    pngs
  };
}
async function mockDashiProject(page) {
  await page.addInitScript(() => localStorage.setItem('hasSeenHelpModal', 'true'));
  await page.route(url => new URL(url).pathname.startsWith('/api/'), async route => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname === '/api/access-code/check') return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        data: {
          enabled: false
        }
      })
    });
    if (pathname === '/api/settings') return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        data: {
          output_language: 'zh'
        }
      })
    });
    if (pathname === '/api/output-language') return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        data: {
          language: 'zh'
        }
      })
    });
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
            pages: [{
              id: 'page-roadmap',
              page_id: 'page-roadmap',
              order_index: 0,
              status: 'NATIVE_GENERATED',
              outline_content: {
                title: '产品升级路线图',
                points: []
              },
              native_layout: 'theme01_page040',
              native_props: {
                title: '产品升级路线图',
                phases: [{
                  period: 'Q1',
                  step: '01',
                  heading: '能力验证',
                  points: ['主题运行时', '逐元素编辑'],
                  verdict: '可用'
                }, {
                  period: 'Q2',
                  step: '02',
                  heading: '质量提升',
                  points: ['布局去重', '导出校验'],
                  verdict: '稳定'
                }, {
                  period: 'Q3',
                  step: '03',
                  heading: '规模推广',
                  points: ['全主题覆盖', '资产复用'],
                  verdict: '交付'
                }]
              }
            }, {
              id: 'page-code',
              page_id: 'page-code',
              order_index: 1,
              status: 'NATIVE_GENERATED',
              outline_content: {
                title: '技术路线导览',
                points: []
              },
              native_layout: 'theme03_page006',
              native_props: {
                titlePre: '技术',
                titleAccent: '路线导览',
                showDecor: true,
                decorSrc: 'assets/3d/08.png'
              }
            }, {
              id: 'page-unicorn',
              page_id: 'page-unicorn',
              order_index: 2,
              status: 'NATIVE_GENERATED',
              outline_content: {
                title: '动态背景验收',
                points: []
              },
              native_layout: 'theme01_page030',
              native_props: {
                title: '动态背景验收',
                backgroundMode: 'unicorn',
                unicornScene: 'tech'
              }
            }]
          }
        })
      });
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        data: {}
      })
    });
  });
}
async function mockHuashuProject(page, onExportComplete) {
  await page.addInitScript(() => localStorage.setItem('hasSeenHelpModal', 'true'));
  await page.route(url => new URL(url).pathname.startsWith('/api/'), async route => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname === '/api/access-code/check') return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        data: {
          enabled: false
        }
      })
    });
    if (pathname === '/api/settings') return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        data: {
          output_language: 'zh'
        }
      })
    });
    if (pathname === '/api/output-language') return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        data: {
          language: 'zh'
        }
      })
    });
    if (pathname === `/api/projects/${huashuProjectId}/export/native-pptx` && route.request().method() === 'POST') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            task_id: 'huashu-export-task',
            status: 'PENDING'
          }
        })
      });
    }
    if (pathname === `/api/projects/${huashuProjectId}/export/native-pptx/huashu-export-task/progress`) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            task_id: 'huashu-export-task',
            status: 'PROCESSING'
          }
        })
      });
    }
    if (pathname === `/api/projects/${huashuProjectId}/export/native-pptx/huashu-export-task/complete`) {
      onExportComplete === null || onExportComplete === void 0 || onExportComplete(route.request());
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            task_id: 'huashu-export-task',
            status: 'COMPLETED',
            progress: {
              download_url: '/files/huashu/exports/huashu.pptx',
              filename: 'Huashu 原生设计系统视觉验收.pptx'
            }
          }
        })
      });
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
            pages: huashuSlides
          }
        })
      });
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        data: {}
      })
    });
  });
}
function extractPptxFromMultipart(request) {
  var _request$headers$cont2;
  const body = request.postDataBuffer();
  const boundary = (_request$headers$cont2 = request.headers()['content-type']) === null || _request$headers$cont2 === void 0 || (_request$headers$cont2 = _request$headers$cont2.match(/boundary=([^;]+)/i)) === null || _request$headers$cont2 === void 0 ? void 0 : _request$headers$cont2[1];
  if (!body || !boundary) throw new Error('导出上传请求缺少 multipart 文件内容');
  const start = body.indexOf(Buffer.from([0x50, 0x4b, 0x03, 0x04]));
  const end = body.indexOf(Buffer.from(`\r\n--${boundary}`), start);
  if (start < 0 || end <= start) throw new Error('导出上传请求中未找到有效 PPTX 文件');
  return body.subarray(start, end);
}
for (const viewport of [{
  width: 1200,
  height: 760
}, {
  width: 1440,
  height: 900
}, {
  width: 1920,
  height: 1080
}]) {
  test(`native workspace fits ${viewport.width}x${viewport.height}`, async ({
    page
  }, testInfo) => {
    await page.setViewportSize(viewport);
    await mockNativeProject(page);
    await page.goto(`/project/${projectId}/preview`);
    const shell = page.locator('.workspace-shell');
    await expect(shell).toBeVisible();
    await expect(page.getByRole('main')).toContainText('原生页面验收');
    await expect(shell).toHaveAttribute('data-inspector-layout', viewport.width === 1200 ? 'drawer' : 'column');
    const inspector = page.getByRole('complementary', {
      name: '属性栏'
    });
    if (viewport.width === 1200) {
      const openInspector = page.locator('.workspace-shell > header button[aria-label="打开属性栏"]');
      await expect(openInspector).toBeVisible();
      await openInspector.click();
      await expect(inspector).toBeVisible();
    }
    await inspector.getByRole('tab', {
      name: '内容'
    }).click();
    await expect(inspector.getByRole('textbox', {
      name: 'title',
      exact: true
    })).toBeVisible();
    await inspector.getByRole('tab', {
      name: '设计'
    }).click();
    await inspector.getByText('页面动效').click();
    await inspector.getByRole('combobox', {
      name: '进入效果'
    }).selectOption('fade');
    await expect(page.getByRole('button', {
      name: '重新预览动效'
    })).toBeEnabled();
    await page.getByRole('button', {
      name: '重新预览动效'
    }).click();
    await expect(page.locator('main .native-enter-fade')).toHaveClass(/native-enter-fade/);
    await page.getByRole('button', {
      name: /第 2 页/
    }).click();
    await inspector.getByRole('combobox', {
      name: '页面切换'
    }).selectOption('cover');
    await inspector.getByRole('combobox', {
      name: '切换速度'
    }).selectOption('slow');
    await inspector.getByRole('combobox', {
      name: '切换方向'
    }).selectOption('u');
    await page.getByRole('button', {
      name: /第 1 页/
    }).click();
    await page.getByRole('button', {
      name: /第 2 页/
    }).click();
    await expect(page.locator('main .native-page-transition-cover')).toHaveClass(/native-page-transition-cover/);
    const overflow = await page.evaluate(() => ({
      width: document.documentElement.scrollWidth - window.innerWidth,
      height: document.documentElement.scrollHeight - window.innerHeight
    }));
    expect(overflow.width).toBeLessThanOrEqual(1);
    expect(overflow.height).toBeLessThanOrEqual(1);
    await page.screenshot({
      path: testInfo.outputPath(`native-${viewport.width}x${viewport.height}.png`),
      fullPage: true
    });
  });
}
test('DashiAI runtime renders complex props and copied assets', async ({
  page
}) => {
  test.setTimeout(90000);
  await page.setViewportSize({
    width: 1440,
    height: 900
  });
  await mockDashiProject(page);
  await page.goto(`/project/${dashiProjectId}/preview`);
  await expect(page.getByRole('main')).toContainText('产品升级路线图');
  const inspector = page.getByRole('complementary', {
    name: '属性栏'
  });
  await inspector.getByRole('tab', {
    name: '内容'
  }).click();
  await expect(inspector).toContainText('phases');
  const navigator = page.getByTestId('native-page-navigator');
  await navigator.getByRole('button', {
    name: '下一页'
  }).click();
  await expect(page.getByRole('main')).toContainText('技术路线导览');
  const decor = page.getByRole('main').locator('img').first();
  await expect(decor).toBeVisible();
  await expect.poll(() => decor.evaluate(image => image.naturalWidth)).toBeGreaterThan(0);
  await navigator.getByRole('button', {
    name: '下一页'
  }).click();
  const unicornFrame = page.locator('main .bt-unicorn-frame[data-unicorn-ready="true"]').first();
  await expect(unicornFrame).toBeVisible({
    timeout: 15000
  });
  const canvas = unicornFrame.locator('canvas');
  await expect(canvas).toBeVisible();
  await expect(canvas).toHaveAttribute('width', /[1-9]\d*/);
  await expect(canvas).toHaveAttribute('height', /[1-9]\d*/);
  const overflow = await page.evaluate(() => ({
    width: document.documentElement.scrollWidth - window.innerWidth,
    height: document.documentElement.scrollHeight - window.innerHeight
  }));
  expect(overflow.width).toBeLessThanOrEqual(1);
  expect(overflow.height).toBeLessThanOrEqual(1);
});
test('native DOM hands progressive PNG frames to the video workspace', async ({
  page
}, testInfo) => {
  test.setTimeout(120000);
  let captured;
  await page.setViewportSize({
    width: 1440,
    height: 900
  });
  await mockNativeProject(page, request => {
    captured = inspectBrowserFrameMultipart(request);
  });
  await page.goto(`/project/${projectId}/preview`);
  await expect(page.locator('main .native-slide')).toHaveAttribute('data-native-layout-ready', 'true');
  await page.getByLabel('导出格式').selectOption('讲解视频');
  await page.getByRole('button', {
    name: '导出讲解视频'
  }).click();
  await expect(page.getByRole('dialog', {
    name: '讲解视频设置'
  })).toBeVisible();
  await page.getByRole('button', {
    name: '开始导出视频'
  }).click();
  await expect.poll(() => {
    var _captured;
    return ((_captured = captured) === null || _captured === void 0 ? void 0 : _captured.frameCount) || 0;
  }, {
    timeout: 90000
  }).toBeGreaterThan(1);
  expect(captured.pageIds).toEqual(['page-1', 'page-2']);
  expect(captured.frameCounts[0]).toBeGreaterThan(1);
  expect(captured.frameCounts[1]).toBe(1);
  expect(captured.frameCount).toBe(captured.frameCounts.reduce((total, count) => total + count, 0));
  const firstPng = captured.pngs[0];
  const finalPng = captured.pngs[captured.frameCounts[0] - 1];
  expect(firstPng.length).toBeGreaterThan(1000);
  expect(finalPng.equals(firstPng)).toBe(false);
  const firstFramePath = testInfo.outputPath('browser-frame-page-1-stage-1.png');
  const finalFramePath = testInfo.outputPath('browser-frame-page-1-final-stage.png');
  writeFileSync(firstFramePath, firstPng);
  writeFileSync(finalFramePath, finalPng);
  await testInfo.attach('browser-frame-page-1-stage-1', {
    path: firstFramePath,
    contentType: 'image/png'
  });
  await testInfo.attach('browser-frame-page-1-final-stage', {
    path: finalFramePath,
    contentType: 'image/png'
  });
});
test('Huashu layouts keep long Chinese copy, media, and visual systems inside the slide', async ({
  page
}, testInfo) => {
  await page.setViewportSize({
    width: 1920,
    height: 1080
  });
  await mockHuashuProject(page);
  await page.goto(`/project/${huashuProjectId}/preview`);
  await expect(page.locator('main .native-slide')).toHaveAttribute('data-native-layout-ready', 'true');
  const accents = new Set();
  for (let index = 0; index < huashuSlides.length; index += 1) {
    await page.getByRole('button', {
      name: new RegExp(`^第 ${index + 1} 页`)
    }).click();
    const slide = page.locator('main .native-slide').last();
    await expect(slide).toHaveAttribute('data-layout', huashuSlides[index].native_layout);
    await expect(slide).toHaveAttribute('data-design-engine', 'huashu_native');
    await expect(slide).toHaveAttribute('data-visual-system', visualSystems[index % visualSystems.length]);
    const audit = await slide.evaluate(root => {
      const slideRect = root.getBoundingClientRect();
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      const escapedText = [];
      let node = walker.nextNode();
      while (node) {
        var _node$textContent;
        const text = ((_node$textContent = node.textContent) === null || _node$textContent === void 0 ? void 0 : _node$textContent.trim()) || '';
        const parent = node.parentElement;
        if (text && parent && getComputedStyle(parent).visibility !== 'hidden') {
          const range = document.createRange();
          range.selectNodeContents(node);
          const rect = range.getBoundingClientRect();
          if (rect.width > 0 && rect.height > 0 && (rect.left < slideRect.left - 1 || rect.top < slideRect.top - 1 || rect.right > slideRect.right + 1 || rect.bottom > slideRect.bottom + 1)) escapedText.push(text);
        }
        node = walker.nextNode();
      }
      const images = Array.from(root.querySelectorAll('img')).map(image => ({
        source: image.getAttribute('src') || '',
        naturalWidth: image.naturalWidth,
        naturalHeight: image.naturalHeight
      }));
      const style = getComputedStyle(root);
      return {
        escapedText,
        accent: style.getPropertyValue('--huashu-accent').trim(),
        images,
        scrollWidth: root.scrollWidth,
        scrollHeight: root.scrollHeight
      };
    });
    expect(audit.escapedText, `${huashuSlides[index].native_layout} has text outside the slide`).toEqual([]);
    expect(audit.scrollWidth).toBe(1920);
    expect(audit.scrollHeight).toBe(1080);
    expect(audit.accent).not.toBe('');
    accents.add(audit.accent);
    for (const image of audit.images) {
      expect(image.source).not.toBe('');
      expect(image.naturalWidth).toBeGreaterThan(0);
      expect(image.naturalHeight).toBeGreaterThan(0);
    }
    if (huashuSlides[index].native_layout === 'core01_actions') {
      const summaryContrast = await slide.evaluate(root => {
        const parseRgb = value => (value.match(/[\d.]+/g) || []).slice(0, 3).map(Number);
        const luminance = value => {
          const channels = parseRgb(value).map(channel => {
            const normalized = channel / 255;
            return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
          });
          return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
        };
        const foreground = getComputedStyle(root.querySelector('.core01-actions-heading p')).color;
        const background = getComputedStyle(root.querySelector('.core01-actions')).backgroundColor;
        const light = Math.max(luminance(foreground), luminance(background));
        const dark = Math.min(luminance(foreground), luminance(background));
        return (light + 0.05) / (dark + 0.05);
      });
      expect(summaryContrast).toBeGreaterThanOrEqual(4.5);
    }
    await slide.screenshot({
      path: testInfo.outputPath(`huashu-${String(index + 1).padStart(2, '0')}-${huashuSlides[index].native_layout}.png`)
    });
  }
  expect(accents.size).toBe(visualSystems.length);
  const overflow = await page.evaluate(() => ({
    width: document.documentElement.scrollWidth - window.innerWidth,
    height: document.documentElement.scrollHeight - window.innerHeight
  }));
  expect(overflow.width).toBeLessThanOrEqual(1);
  expect(overflow.height).toBeLessThanOrEqual(1);
});
test('Huashu workspace exports a valid editable 13-slide PPTX through the task flow', async ({
  page
}, testInfo) => {
  test.setTimeout(180000);
  let uploadedPptx;
  await page.setViewportSize({
    width: 1920,
    height: 1080
  });
  await mockHuashuProject(page, request => {
    uploadedPptx = extractPptxFromMultipart(request);
  });
  await page.goto(`/project/${huashuProjectId}/preview`);
  await expect(page.locator('main .native-slide')).toHaveAttribute('data-native-layout-ready', 'true');
  await page.getByRole('button', {
    name: '导出PPTX'
  }).click();
  await expect.poll(() => {
    var _uploadedPptx;
    return ((_uploadedPptx = uploadedPptx) === null || _uploadedPptx === void 0 ? void 0 : _uploadedPptx.length) || 0;
  }, {
    timeout: 150000
  }).toBeGreaterThan(10000);
  const outputPath = testInfo.outputPath('huashu-editable-13-slides.pptx');
  writeFileSync(outputPath, uploadedPptx);
  const archive = await JSZip.loadAsync(uploadedPptx);
  const slideFiles = Object.keys(archive.files).filter(name => /^ppt\/slides\/slide\d+\.xml$/.test(name));
  expect(slideFiles).toHaveLength(huashuSlides.length);
  expect(archive.file('[Content_Types].xml')).not.toBeNull();
  expect(archive.file('ppt/presentation.xml')).not.toBeNull();
  expect(archive.file('ppt/_rels/presentation.xml.rels')).not.toBeNull();
  const slideXml = await Promise.all(slideFiles.map(name => archive.file(name).async('string')));
  const allSlideXml = slideXml.join('\n');
  const editableText = slideXml.flatMap(xml => Array.from(xml.matchAll(/<a:t>([\s\S]*?)<\/a:t>/g), match => match[1])).join('');
  expect(editableText).toContain('从一次性交付转向持续经营能力建设');
  expect(editableText).toContain('解决方案负责人');
  expect(editableText).not.toContain('The quick brown fox jumps over the lazy dog.');
  expect(editableText.toLowerCase()).not.toContain('lorem');
  expect(allSlideXml).toContain('typeface="Noto Sans SC"');
  expect(allSlideXml).toContain('typeface="Noto Serif SC"');
  expect(slideXml.every(xml => xml.includes('<p:sld'))).toBe(true);
  await testInfo.attach('huashu-editable-pptx', {
    path: outputPath,
    contentType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
  });
});
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJleHBlY3QiLCJ0ZXN0Iiwid3JpdGVGaWxlU3luYyIsIkpTWmlwIiwicHJvamVjdElkIiwiZGFzaGlQcm9qZWN0SWQiLCJodWFzaHVQcm9qZWN0SWQiLCJ2aXN1YWxTeXN0ZW1zIiwiaHVhc2h1U2xpZGVzIiwibGF5b3V0IiwicHJvcHMiLCJraWNrZXIiLCJ0aXRsZSIsInN1bW1hcnkiLCJwb2ludHMiLCJtZXRyaWNzIiwic3RlcHMiLCJyaXNrcyIsInJlY29tbWVuZGF0aW9uIiwib3B0aW9ucyIsImNhcHRpb24iLCJpbWFnZSIsInF1b3RlIiwiYXR0cmlidXRpb24iLCJhY3Rpb25zIiwieExhYmVsIiwieUxhYmVsIiwiaXRlbXMiLCJtaWxlc3RvbmVzIiwibGF5ZXJzIiwibmFtZSIsInJvbGUiLCJoaWdobGlnaHRzIiwic3RhZ2VzIiwibWFwIiwic2xpZGUiLCJpbmRleCIsImlkIiwicGFnZV9pZCIsIm9yZGVyX2luZGV4Iiwic3RhdHVzIiwib3V0bGluZV9jb250ZW50IiwiU3RyaW5nIiwibmF0aXZlX2xheW91dCIsIm5hdGl2ZV9wcm9wcyIsIl9fZGVzaWduX2ludGVudCIsImRlc2lnbl9lbmdpbmUiLCJwYWdlX3BsYW4iLCJ2aXN1YWxfc3lzdGVtIiwibGVuZ3RoIiwicXVhbGl0eV9yZXBvcnQiLCJzY29yZSIsImlzc3VlcyIsIm1vY2tOYXRpdmVQcm9qZWN0IiwicGFnZSIsIm9uQnJvd3NlckZyYW1lcyIsImFkZEluaXRTY3JpcHQiLCJsb2NhbFN0b3JhZ2UiLCJzZXRJdGVtIiwicm91dGUiLCJ1cmwiLCJVUkwiLCJwYXRobmFtZSIsInN0YXJ0c1dpdGgiLCJyZXF1ZXN0IiwiZnVsZmlsbCIsImNvbnRlbnRUeXBlIiwiYm9keSIsIkpTT04iLCJzdHJpbmdpZnkiLCJzdWNjZXNzIiwiZGF0YSIsImVuYWJsZWQiLCJvdXRwdXRfbGFuZ3VhZ2UiLCJsYW5ndWFnZSIsInByb2plY3RfaWQiLCJsYXN0X3dvcmtzcGFjZSIsInBlbmRpbmdfc3luY19jb3VudCIsInNwaW5lIiwicmV2aXNpb24iLCJjb250ZW50X2hhc2giLCJkb2N1bWVudCIsInRvcGljIiwidmFsdWUiLCJzZWN0aW9ucyIsIndvcmtzcGFjZXMiLCJraW5kIiwic3RhdGUiLCJzb3VyY2Vfa2luZCIsInNldHRpbmdzIiwicGFnZXMiLCJwYWdlSWQiLCJjdXJyZW50X3ZlcnNpb25faWQiLCJ3b3JkX2NvdW50IiwiZXN0aW1hdGVkX3NlY29uZHMiLCJjYW5kaWRhdGVfY291bnQiLCJ0b3RhbF9wYWdlcyIsImNvbmZpcm1lZF9wYWdlcyIsIm1pc3NpbmdfcGFnZXMiLCJjYW5kaWRhdGVfcGFnZXMiLCJjYW5fZXhwb3J0IiwiZXJyb3JzIiwid2FybmluZ3MiLCJhdHRhY2hlZCIsInRhc2tfaWQiLCJwcm9ncmVzcyIsInRvdGFsIiwiY29tcGxldGVkIiwicGVyY2VudCIsImlkZWFfcHJvbXB0IiwicmVuZGVyX21vZGUiLCJzdWJ0aXRsZSIsIl9fYW5pbWF0aW9uIiwiZWxlbWVudEVudGVyIiwiaW5zcGVjdEJyb3dzZXJGcmFtZU11bHRpcGFydCIsIl9yZXF1ZXN0JGhlYWRlcnMkY29udCIsInBvc3REYXRhQnVmZmVyIiwiYm91bmRhcnkiLCJoZWFkZXJzIiwibWF0Y2giLCJFcnJvciIsInRleHQiLCJ0b1N0cmluZyIsInJlYWRGaWVsZCIsIlJlZ0V4cCIsImV4ZWMiLCJwYXJzZSIsIm1hcmtlciIsInBuZ1NpZ25hdHVyZSIsIkJ1ZmZlciIsImZyb20iLCJmcmFtZUNvdW50Iiwic3BsaXQiLCJwbmdzIiwiY3Vyc29yIiwicG5nU3RhcnQiLCJpbmRleE9mIiwicG5nRW5kIiwicHVzaCIsInN1YmFycmF5IiwicGFnZUlkcyIsImZyYW1lQ291bnRzIiwibW9ja0Rhc2hpUHJvamVjdCIsIm5hdGl2ZV90aGVtZSIsInBoYXNlcyIsInBlcmlvZCIsInN0ZXAiLCJoZWFkaW5nIiwidmVyZGljdCIsInRpdGxlUHJlIiwidGl0bGVBY2NlbnQiLCJzaG93RGVjb3IiLCJkZWNvclNyYyIsImJhY2tncm91bmRNb2RlIiwidW5pY29yblNjZW5lIiwibW9ja0h1YXNodVByb2plY3QiLCJvbkV4cG9ydENvbXBsZXRlIiwibWV0aG9kIiwiZG93bmxvYWRfdXJsIiwiZmlsZW5hbWUiLCJleHRyYWN0UHB0eEZyb21NdWx0aXBhcnQiLCJfcmVxdWVzdCRoZWFkZXJzJGNvbnQyIiwic3RhcnQiLCJlbmQiLCJ2aWV3cG9ydCIsIndpZHRoIiwiaGVpZ2h0IiwidGVzdEluZm8iLCJzZXRWaWV3cG9ydFNpemUiLCJnb3RvIiwic2hlbGwiLCJsb2NhdG9yIiwidG9CZVZpc2libGUiLCJnZXRCeVJvbGUiLCJ0b0NvbnRhaW5UZXh0IiwidG9IYXZlQXR0cmlidXRlIiwiaW5zcGVjdG9yIiwib3Blbkluc3BlY3RvciIsImNsaWNrIiwiZXhhY3QiLCJnZXRCeVRleHQiLCJzZWxlY3RPcHRpb24iLCJ0b0JlRW5hYmxlZCIsInRvSGF2ZUNsYXNzIiwib3ZlcmZsb3ciLCJldmFsdWF0ZSIsImRvY3VtZW50RWxlbWVudCIsInNjcm9sbFdpZHRoIiwid2luZG93IiwiaW5uZXJXaWR0aCIsInNjcm9sbEhlaWdodCIsImlubmVySGVpZ2h0IiwidG9CZUxlc3NUaGFuT3JFcXVhbCIsInNjcmVlbnNob3QiLCJwYXRoIiwib3V0cHV0UGF0aCIsImZ1bGxQYWdlIiwic2V0VGltZW91dCIsIm5hdmlnYXRvciIsImdldEJ5VGVzdElkIiwiZGVjb3IiLCJmaXJzdCIsInBvbGwiLCJuYXR1cmFsV2lkdGgiLCJ0b0JlR3JlYXRlclRoYW4iLCJ1bmljb3JuRnJhbWUiLCJ0aW1lb3V0IiwiY2FudmFzIiwiY2FwdHVyZWQiLCJnZXRCeUxhYmVsIiwiX2NhcHR1cmVkIiwidG9FcXVhbCIsInRvQmUiLCJyZWR1Y2UiLCJjb3VudCIsImZpcnN0UG5nIiwiZmluYWxQbmciLCJlcXVhbHMiLCJmaXJzdEZyYW1lUGF0aCIsImZpbmFsRnJhbWVQYXRoIiwiYXR0YWNoIiwiYWNjZW50cyIsIlNldCIsImxhc3QiLCJhdWRpdCIsInJvb3QiLCJzbGlkZVJlY3QiLCJnZXRCb3VuZGluZ0NsaWVudFJlY3QiLCJ3YWxrZXIiLCJjcmVhdGVUcmVlV2Fsa2VyIiwiTm9kZUZpbHRlciIsIlNIT1dfVEVYVCIsImVzY2FwZWRUZXh0Iiwibm9kZSIsIm5leHROb2RlIiwiX25vZGUkdGV4dENvbnRlbnQiLCJ0ZXh0Q29udGVudCIsInRyaW0iLCJwYXJlbnQiLCJwYXJlbnRFbGVtZW50IiwiZ2V0Q29tcHV0ZWRTdHlsZSIsInZpc2liaWxpdHkiLCJyYW5nZSIsImNyZWF0ZVJhbmdlIiwic2VsZWN0Tm9kZUNvbnRlbnRzIiwicmVjdCIsImxlZnQiLCJ0b3AiLCJyaWdodCIsImJvdHRvbSIsImltYWdlcyIsIkFycmF5IiwicXVlcnlTZWxlY3RvckFsbCIsInNvdXJjZSIsImdldEF0dHJpYnV0ZSIsIm5hdHVyYWxIZWlnaHQiLCJzdHlsZSIsImFjY2VudCIsImdldFByb3BlcnR5VmFsdWUiLCJub3QiLCJhZGQiLCJzdW1tYXJ5Q29udHJhc3QiLCJwYXJzZVJnYiIsInNsaWNlIiwiTnVtYmVyIiwibHVtaW5hbmNlIiwiY2hhbm5lbHMiLCJjaGFubmVsIiwibm9ybWFsaXplZCIsImZvcmVncm91bmQiLCJxdWVyeVNlbGVjdG9yIiwiY29sb3IiLCJiYWNrZ3JvdW5kIiwiYmFja2dyb3VuZENvbG9yIiwibGlnaHQiLCJNYXRoIiwibWF4IiwiZGFyayIsIm1pbiIsInRvQmVHcmVhdGVyVGhhbk9yRXF1YWwiLCJwYWRTdGFydCIsInNpemUiLCJ1cGxvYWRlZFBwdHgiLCJfdXBsb2FkZWRQcHR4IiwiYXJjaGl2ZSIsImxvYWRBc3luYyIsInNsaWRlRmlsZXMiLCJPYmplY3QiLCJrZXlzIiwiZmlsZXMiLCJmaWx0ZXIiLCJ0b0hhdmVMZW5ndGgiLCJmaWxlIiwidG9CZU51bGwiLCJzbGlkZVhtbCIsIlByb21pc2UiLCJhbGwiLCJhc3luYyIsImFsbFNsaWRlWG1sIiwiam9pbiIsImVkaXRhYmxlVGV4dCIsImZsYXRNYXAiLCJ4bWwiLCJtYXRjaEFsbCIsInRvQ29udGFpbiIsInRvTG93ZXJDYXNlIiwiZXZlcnkiLCJpbmNsdWRlcyJdLCJzb3VyY2VzIjpbIm5hdGl2ZS1kZWNrLXdvcmtzcGFjZS5zcGVjLnRzIl0sInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IGV4cGVjdCwgdGVzdCwgdHlwZSBQYWdlIH0gZnJvbSAnQHBsYXl3cmlnaHQvdGVzdCdcbmltcG9ydCB7IHdyaXRlRmlsZVN5bmMgfSBmcm9tICdub2RlOmZzJ1xuaW1wb3J0IEpTWmlwIGZyb20gJ2pzemlwJ1xuXG5jb25zdCBwcm9qZWN0SWQgPSAnbmF0aXZlLXdvcmtzcGFjZS1lMmUnXG5jb25zdCBkYXNoaVByb2plY3RJZCA9ICdkYXNoaS13b3Jrc3BhY2UtZTJlJ1xuY29uc3QgaHVhc2h1UHJvamVjdElkID0gJ2h1YXNodS13b3Jrc3BhY2UtZTJlJ1xuXG5jb25zdCB2aXN1YWxTeXN0ZW1zID0gWydlZGl0b3JpYWwnLCAnc2lnbmFsJywgJ3JvdXRlJywgJ2NvbnRyYXN0JywgJ3Nwb3RsaWdodCcsICdjYXV0aW9uJ10gYXMgY29uc3RcblxuY29uc3QgaHVhc2h1U2xpZGVzID0gW1xuICB7IGxheW91dDogJ2NvcmUwMV9zdGF0ZW1lbnQnLCBwcm9wczogeyBraWNrZXI6ICfmoLjlv4PliKTmlq3kuI7lhbPplK7kvp3mja4nLCB0aXRsZTogJ+S7juS4gOasoeaAp+S6pOS7mOi9rOWQkeaMgee7ree7j+iQpeiDveWKm+W7uuiuvicsIHN1bW1hcnk6ICfnnJ/mraPmi4nlvIDlt67ot53nmoTkuI3mmK/lip/og73mlbDph4/vvIzogIzmmK/pnIDmsYLor4bliKvjgIHkuqTku5jotKjph4/kuI7lpI3otK3lop7plb/og73lkKblvaLmiJDnqLPlrprpl63njq/jgIInLCBwb2ludHM6IFsn5piO56Gu5pyA5YC85b6X5oqV5YWl55qE5qC45b+D5Zy65pmvJywgJ+eUqOWPr+mqjOivgee7k+aenOabv+S7o+Wuveazm+aJv+ivuicsICfmsonmt4Dlj6/ph43lpI3kvb/nlKjnmoTkuqTku5jotYTkuqcnLCAn6K6p5a6i5oi35oiQ5Yqf5oiQ5Li65aKe6ZW/6LW354K5J10gfSB9LFxuICB7IGxheW91dDogJ2NvcmUwMV9ldmlkZW5jZScsIHByb3BzOiB7IHRpdGxlOiAn5aKe6ZW/5q2j5Zyo5LuO6K+V54K56LWw5ZCR6KeE5qih5YyWJywgc3VtbWFyeTogJ+Wbm+e7hOebuOS6kuWNsOivgeeahOaVsOaNruivtOaYju+8jOW4guWcuuWFs+azqOeCueW3sue7j+S7juaYr+WQpuWPr+eUqOi9rOWQkeaYr+WQpuiDveeos+WumuWIm+mAoOS4muWKoeS7t+WAvOOAgicsIG1ldHJpY3M6IFsn6K+V54K56L2s5q2j5byP6aG555uu5q+U5L6L5o+Q5Y2H6IezIDY4JScsICflubPlnYfkuqTku5jlkajmnJ/nvKnnn63oh7MgMjEg5aSpJywgJ+mHjeeCueWuouaIt+e7ree6pueOh+i+vuWIsCA4NCUnLCAn5qCH5YeG6LWE5Lqn5aSN55So546H6LaF6L+HIDcyJSddIH0gfSxcbiAgeyBsYXlvdXQ6ICdjb3JlMDFfbmFycmF0aXZlJywgcHJvcHM6IHsga2lja2VyOiAn5o6o6L+b6Lev57q/5LiO6Zi25q6155uu5qCHJywgdGl0bGU6ICfnlKjkuInkuKrpmLbmrrXlrozmiJDog73lipvljYfnuqcnLCBzdW1tYXJ5OiAn5YWI6LeR6YCa6auY5Lu35YC85Zy65pmv77yM5YaN5bu656uL5qCH5YeG5Lqk5LuY5L2T57O777yM5pyA5ZCO6YCa6L+H5pWw5o2u5Y+N6aaI5oyB57ut5LyY5YyW44CCJywgc3RlcHM6IFsn6aqM6K+B5Zy65pmv5Lu35YC85LiO55So5oi35oSP5oS/JywgJ+WbuuWMlua1geeoi+OAgeaooeadv+WSjOi0qOmHj+agh+WHhicsICfop4TmqKHlpI3liLblubbmjIHnu63lpI3nm5jov63ku6MnLCAn5b2i5oiQ6Leo5Zui6Zif55qE57uf5LiA57uP6JCl6IqC5aWPJ10gfSB9LFxuICB7IGxheW91dDogJ2NvcmUwMV9yaXNrJywgcHJvcHM6IHsgdGl0bGU6ICfop4TmqKHljJbkuYvliY3lv4XpobvlpITnkIblm5vnsbvpo47pmaknLCBzdW1tYXJ5OiAn5aaC5p6c5Y+q6L+95rGC6aG16Z2i5pWw6YeP6ICM5b+955Wl5YaF5a6544CB6LWE5Lqn5ZKM5Lqk5LuY5rK755CG77yM5aKe6ZW/6LaK5b+r77yM6L+U5bel5oiQ5pys6LaK6auY44CCJywgcmlza3M6IFsn6ZyA5rGC6L6555WM5oyB57ut5ryC56e75a+86Ie05Lqk5LuY5aSx5o6nJywgJ+inhuiniei1hOS6p+e8uuWwkeinhOWImemAoOaIkOWTgeeJjOWJsuijgicsICfmlbDmja7lj6PlvoTkuI3nu5/kuIDlvbHlk43lhrPnrZblj6/kv6HluqYnLCAn5oiQ5Yqf57uP6aqM5pyq5rKJ5reA5a+86Ie06YeN5aSN5Yqz5YqoJ10gfSB9LFxuICB7IGxheW91dDogJ2NvcmUwMV9kZWNpc2lvbicsIHByb3BzOiB7IGtpY2tlcjogJ+WGs+etluW7uuiuruS4jumAieaLqeS+neaNricsIHRpdGxlOiAn5LyY5YWI5bu66K6+5Y+v5aSN55So55qE5Lqk5LuY5bqV5bqnJywgcmVjb21tZW5kYXRpb246ICflu7rorq7ph4fnlKjmoIflh4bog73lipvkuLrkuLvjgIHph43ngrnlnLrmma/lop7lvLrnmoTot6/nur/vvIzlnKjmjqfliLblpI3mnYLluqbnmoTlkIzml7bkv53nlZnlt67lvILljJbooajovr7nqbrpl7TjgIInLCBvcHRpb25zOiBbJ+e7n+S4gOWGheWuueS4juinhuinieWlkee6picsICflu7rnq4vpq5jpopHluIPlsYDlkozotYTkuqflupMnLCAn5L+d55WZ5YWz6ZSu6aG16Z2i5a6a5Yi26IO95YqbJywgJ+aMiei0qOmHj+aVsOaNruaMgee7reS8mOWMliddIH0gfSxcbiAgeyBsYXlvdXQ6ICdjb3JlMDFfaW1hZ2Vfc3RvcnknLCBwcm9wczogeyBraWNrZXI6ICflnLrmma/op4Llr5/kuI7nlKjmiLfor4Hmja4nLCB0aXRsZTogJ+ecn+WunuW3peS9nOa1geWGs+WumuS6p+WTgeS7t+WAvCcsIHN1bW1hcnk6ICfnlKjmiLfkuI3mmK/kuLrkuobnlJ/miJDkuIDku73mvJTnpLrmlofnqL/ogIzmnaXvvIzogIzmmK/opoHmm7Tlv6vlrozmiJDku47mgJ3ogIPjgIHooajovr7jgIHljY/kvZzliLDkuqTku5jnmoTlrozmlbTov4fnqIvjgIInLCBjYXB0aW9uOiAn5Zui6Zif5Zu057uV5ZCM5LiA5Lu95pa55qGI5a6M5oiQ6K+E5a6h5LiO6L+t5LujJywgaW1hZ2U6ICdhc3NldHMvbmF0aXZlLXRoZW1lLXByZXZpZXdzL3RoZW1lMDEuanBnJyB9IH0sXG4gIHsgbGF5b3V0OiAnY29yZTAxX3F1b3RlJywgcHJvcHM6IHsga2lja2VyOiAn5a6i5oi35Y6f6K+d5LiO55yf5a6e5Y+N6aaIJywgcXVvdGU6ICfmiJHpnIDopoHnmoTkuI3mmK/mm7TlpJrmqKHmnb/vvIzogIzmmK/kuIDlpZfog73orqnmiJHmiorlpI3mnYLpl67popjorrLmuIXmpZrjgIHov5jog73nu6fnu63kv67mlLnnmoTlt6XkvZzmlrnlvI/jgIInLCBhdHRyaWJ1dGlvbjogJ+afkOS8geS4muino+WGs+aWueahiOi0n+i0o+S6uicsIHN1bW1hcnk6ICflj6/nvJbovpHjgIHlj6/lpI3nlKjlkoznu5PmnpznqLPlrprvvIzmr5TljZXmrKHnlJ/miJDpgJ/luqbmm7TlhrPlrprplb/mnJ/kvb/nlKjmhI/mhL/jgIInIH0gfSxcbiAgeyBsYXlvdXQ6ICdjb3JlMDFfYWN0aW9ucycsIHByb3BzOiB7IHRpdGxlOiAn5pyq5p2l5Zub5ZGo55qE6JC95Zyw5Yqo5L2cJywgc3VtbWFyeTogJ+avj+mhueihjOWKqOmDveWvueW6lOaYjuehrui0n+i0o+S6uuOAgeS6pOS7mOeJqeWSjOmqjOaUtue7k+aenO+8jOmBv+WFjeWNh+e6p+WBnOeVmeWcqOamguW/teWxgumdouOAgicsIGFjdGlvbnM6IFsn5a6M5oiQ6auY6aKR5Zy65pmv5LiO5biD5bGA5pig5bCEJywgJ+W7uueri+mhtemdoue6p+i0qOmHj+ajgOafpeacuuWIticsICfmiZPpgJrntKDmnZDnlJ/miJDkuI7kurrlt6Xmm7/mjaInLCAn57uf5LiA57yW6L6R44CB6aKE6KeI5ZKM5a+85Ye657uT5p6cJywgJ+eUqOecn+WunumhueebruWujOaIkOWbnuW9kumqjOaUtiddIH0gfSxcbiAgeyBsYXlvdXQ6ICdjb3JlMDFfbWF0cml4JywgcHJvcHM6IHsgdGl0bGU6ICfmjInku7flgLzkuI7miJDnhp/luqbphY3nva7otYTmupAnLCB4TGFiZWw6ICfog73lipvmiJDnhp/luqbnlLHkvY7liLDpq5gnLCB5TGFiZWw6ICfkuJrliqHku7flgLznlLHkvY7liLDpq5gnLCBpdGVtczogWyfph43ngrnnqoHnoLTvvJrpq5jku7flgLzlvoXpqozor4EnLCAn6KeE5qih5aSN5Yi277ya6auY5Lu35YC86auY5oiQ54afJywgJ+iwqOaFjuaKleWFpe+8muS9juS7t+WAvOW+hemqjOivgScsICfmoIflh4bnu7TmiqTvvJrkvY7ku7flgLzpq5jmiJDnhp8nXSB9IH0sXG4gIHsgbGF5b3V0OiAnY29yZTAxX3RpbWVsaW5lJywgcHJvcHM6IHsgdGl0bGU6ICfljYHkuozlkajog73lipvljYfnuqfot6/nur/lm74nLCBtaWxlc3RvbmVzOiBbJ+esrCAxLTIg5ZGo77ya5a6M5oiQ5Z+657q/6K+E5LywJywgJ+esrCAzLTQg5ZGo77ya6KGl6b2Q6auY6aKR5biD5bGAJywgJ+esrCA1LTYg5ZGo77ya5o6l5YWl5pm66IO957Sg5p2QJywgJ+esrCA3LTgg5ZGo77ya5bu656uL6Ieq5Yqo6LSo5qOAJywgJ+esrCA5LTEwIOWRqO+8mue7n+S4gOWkmuagvOW8j+WvvOWHuicsICfnrKwgMTEtMTIg5ZGo77ya55yf5a6e6aG555uu6aqM5pS2J10gfSB9LFxuICB7IGxheW91dDogJ2NvcmUwMV9hcmNoaXRlY3R1cmUnLCBwcm9wczogeyBraWNrZXI6ICfog73lipvmnrbmnoTkuI7ljY/lkIzlhbPns7snLCB0aXRsZTogJ+Wbm+WxguiDveWKm+WFseWQjOaUr+aSkeeos+WumuS6pOS7mCcsIHN1bW1hcnk6ICfkuIrlsYLkvZPpqozkv53mjIHnroDljZXvvIzlupXlsYLpgJrov4forr7orqHjgIHlhoXlrrnjgIHotYTkuqflkozotKjph4/op4TliJnkv53or4Hnu5PmnpzkuIDoh7TjgIInLCBsYXllcnM6IFsn5Lqk5LqS5LiO57yW6L6R5L2T6aqM5bGCJywgJ+WPmeS6i+S4jumhtemdouiuvuiuoeWxgicsICfntKDmnZDkuI7lqpLkvZPnlJ/miJDlsYInLCAn6LSo6YeP5qOA5p+l5LiO5a+85Ye65bGCJ10gfSB9LFxuICB7IGxheW91dDogJ2NvcmUwMV9wcm9maWxlJywgcHJvcHM6IHsga2lja2VyOiAn5YWz6ZSu6KeS6Imy5LiO6IO95Yqb55S75YOPJywgbmFtZTogJ+ino+WGs+aWueahiOi0n+i0o+S6uicsIHJvbGU6ICfov57mjqXlrqLmiLfnm67moIfjgIHlhoXlrrnnrZbnlaXkuI7kuqTku5jotKjph48nLCBzdW1tYXJ5OiAn5pei55CG6Kej5Lia5Yqh6Zeu6aKY77yM5Lmf6IO95oqK5aSN5p2C5L+h5oGv6L2s6K+R5Li65riF5pmw57uT5p6E77yM5bm25o6o5Yqo6Leo5Zui6Zif5a6M5oiQ6auY6LSo6YeP5Lqk5LuY44CCJywgaGlnaGxpZ2h0czogWyfkuJrliqHmtJ7lr58nLCAn5Y+Z5LqL6K6+6K6hJywgJ+S6pOS7mOayu+eQhicsICflrqLmiLfmiJDlip8nXSwgaW1hZ2U6ICdhc3NldHMvbmF0aXZlLXRoZW1lLXByZXZpZXdzL3RoZW1lMDkuanBnJyB9IH0sXG4gIHsgbGF5b3V0OiAnY29yZTAxX2Z1bm5lbCcsIHByb3BzOiB7IGtpY2tlcjogJ+WuouaIt+i9rOWMluS4juS7t+WAvOmAkui/mycsIHRpdGxlOiAn5LuO6ZyA5rGC6Kem6L6+5Yiw6ZW/5pyf5aSN6LStJywgc3VtbWFyeTogJ+avj+S4gOWxgumDvemcgOimgeaYjuehruS7t+WAvOivgeaYju+8jOS4jeiDveS+nei1luS4gOasoea8lOekuuebtOaOpei3qOi2iuS/oeS7u+W7uueri+i/h+eoi+OAgicsIHN0YWdlczogWyfpnIDmsYLop6bovr7kuI7pl67popjor4bliKsnLCAn5pa55qGI6aqM6K+B5LiO5Lu35YC85YWx6K+GJywgJ+mhueebruS6pOS7mOS4jue7k+aenOehruiupCcsICfog73lipvmianlsZXkuI7nu4Tnu4flpI3nlKgnLCAn6ZW/5pyf57ut57qm5LiO5a6i5oi35o6o6I2QJ10gfSB9LFxuXS5tYXAoKHNsaWRlLCBpbmRleCkgPT4gKHtcbiAgaWQ6IGBodWFzaHUtcGFnZS0ke2luZGV4ICsgMX1gLFxuICBwYWdlX2lkOiBgaHVhc2h1LXBhZ2UtJHtpbmRleCArIDF9YCxcbiAgb3JkZXJfaW5kZXg6IGluZGV4LFxuICBzdGF0dXM6ICdOQVRJVkVfR0VORVJBVEVEJyxcbiAgb3V0bGluZV9jb250ZW50OiB7IHRpdGxlOiBTdHJpbmcoc2xpZGUucHJvcHMudGl0bGUgfHwgc2xpZGUucHJvcHMubmFtZSB8fCBzbGlkZS5wcm9wcy5xdW90ZSB8fCBg56ysICR7aW5kZXggKyAxfSDpobVgKSwgcG9pbnRzOiBbXSB9LFxuICBuYXRpdmVfbGF5b3V0OiBzbGlkZS5sYXlvdXQsXG4gIG5hdGl2ZV9wcm9wczoge1xuICAgIC4uLnNsaWRlLnByb3BzLFxuICAgIF9fZGVzaWduX2ludGVudDoge1xuICAgICAgZGVzaWduX2VuZ2luZTogJ2h1YXNodV9uYXRpdmUnLFxuICAgICAgcGFnZV9wbGFuOiB7IHZpc3VhbF9zeXN0ZW06IHZpc3VhbFN5c3RlbXNbaW5kZXggJSB2aXN1YWxTeXN0ZW1zLmxlbmd0aF0gfSxcbiAgICAgIHF1YWxpdHlfcmVwb3J0OiB7IHN0YXR1czogJ3Bhc3MnLCBzY29yZTogMTAwLCBpc3N1ZXM6IFtdIH0sXG4gICAgfSxcbiAgfSxcbn0pKVxuXG5hc3luYyBmdW5jdGlvbiBtb2NrTmF0aXZlUHJvamVjdChcbiAgcGFnZTogUGFnZSxcbiAgb25Ccm93c2VyRnJhbWVzPzogKHJlcXVlc3Q6IGltcG9ydCgnQHBsYXl3cmlnaHQvdGVzdCcpLlJlcXVlc3QpID0+IHZvaWQsXG4pIHtcbiAgYXdhaXQgcGFnZS5hZGRJbml0U2NyaXB0KCgpID0+IGxvY2FsU3RvcmFnZS5zZXRJdGVtKCdoYXNTZWVuSGVscE1vZGFsJywgJ3RydWUnKSlcbiAgYXdhaXQgcGFnZS5yb3V0ZSh1cmwgPT4gbmV3IFVSTCh1cmwpLnBhdGhuYW1lLnN0YXJ0c1dpdGgoJy9hcGkvJyksIGFzeW5jIChyb3V0ZSkgPT4ge1xuICAgIGNvbnN0IHBhdGhuYW1lID0gbmV3IFVSTChyb3V0ZS5yZXF1ZXN0KCkudXJsKCkpLnBhdGhuYW1lXG4gICAgaWYgKHBhdGhuYW1lID09PSAnL2FwaS9hY2Nlc3MtY29kZS9jaGVjaycpIHtcbiAgICAgIHJldHVybiByb3V0ZS5mdWxmaWxsKHsgc3RhdHVzOiAyMDAsIGNvbnRlbnRUeXBlOiAnYXBwbGljYXRpb24vanNvbicsIGJvZHk6IEpTT04uc3RyaW5naWZ5KHsgc3VjY2VzczogdHJ1ZSwgZGF0YTogeyBlbmFibGVkOiBmYWxzZSB9IH0pIH0pXG4gICAgfVxuICAgIGlmIChwYXRobmFtZSA9PT0gJy9hcGkvc2V0dGluZ3MnKSB7XG4gICAgICByZXR1cm4gcm91dGUuZnVsZmlsbCh7IHN0YXR1czogMjAwLCBjb250ZW50VHlwZTogJ2FwcGxpY2F0aW9uL2pzb24nLCBib2R5OiBKU09OLnN0cmluZ2lmeSh7IHN1Y2Nlc3M6IHRydWUsIGRhdGE6IHsgb3V0cHV0X2xhbmd1YWdlOiAnemgnIH0gfSkgfSlcbiAgICB9XG4gICAgaWYgKHBhdGhuYW1lID09PSAnL2FwaS9vdXRwdXQtbGFuZ3VhZ2UnKSB7XG4gICAgICByZXR1cm4gcm91dGUuZnVsZmlsbCh7IHN0YXR1czogMjAwLCBjb250ZW50VHlwZTogJ2FwcGxpY2F0aW9uL2pzb24nLCBib2R5OiBKU09OLnN0cmluZ2lmeSh7IHN1Y2Nlc3M6IHRydWUsIGRhdGE6IHsgbGFuZ3VhZ2U6ICd6aCcgfSB9KSB9KVxuICAgIH1cbiAgICBpZiAocGF0aG5hbWUgPT09IGAvYXBpL2NvbnRlbnQtcHJvamVjdHMvJHtwcm9qZWN0SWR9YCkge1xuICAgICAgcmV0dXJuIHJvdXRlLmZ1bGZpbGwoe1xuICAgICAgICBzdGF0dXM6IDIwMCxcbiAgICAgICAgY29udGVudFR5cGU6ICdhcHBsaWNhdGlvbi9qc29uJyxcbiAgICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkoe1xuICAgICAgICAgIHN1Y2Nlc3M6IHRydWUsXG4gICAgICAgICAgZGF0YToge1xuICAgICAgICAgICAgcHJvamVjdF9pZDogcHJvamVjdElkLFxuICAgICAgICAgICAgbGFzdF93b3Jrc3BhY2U6ICdwcHQnLFxuICAgICAgICAgICAgcGVuZGluZ19zeW5jX2NvdW50OiAwLFxuICAgICAgICAgICAgc3BpbmU6IHtcbiAgICAgICAgICAgICAgaWQ6ICdzcGluZS1uYXRpdmUtd29ya3NwYWNlJyxcbiAgICAgICAgICAgICAgcHJvamVjdF9pZDogcHJvamVjdElkLFxuICAgICAgICAgICAgICByZXZpc2lvbjogMSxcbiAgICAgICAgICAgICAgc3RhdHVzOiAnY29uZmlybWVkJyxcbiAgICAgICAgICAgICAgY29udGVudF9oYXNoOiAnbmF0aXZlLXdvcmtzcGFjZS1oYXNoJyxcbiAgICAgICAgICAgICAgZG9jdW1lbnQ6IHsgdG9waWM6IHsgdmFsdWU6ICfljp/nlJ/lt6XkvZzljLrop4bop4npqozmlLYnIH0sIHNlY3Rpb25zOiBbXSB9LFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIHdvcmtzcGFjZXM6IFtcbiAgICAgICAgICAgICAgeyBpZDogJ3BwdC1uYXRpdmUtd29ya3NwYWNlJywgcHJvamVjdF9pZDogcHJvamVjdElkLCBraW5kOiAncHB0Jywgc3RhdGU6ICdkcmFmdCcsIHJldmlzaW9uOiAxLCBzb3VyY2Vfa2luZDogJ3NwaW5lJywgc2V0dGluZ3M6IHt9IH0sXG4gICAgICAgICAgICAgIHsgaWQ6ICd2aWRlby1uYXRpdmUtd29ya3NwYWNlJywgcHJvamVjdF9pZDogcHJvamVjdElkLCBraW5kOiAndmlkZW8nLCBzdGF0ZTogJ2RyYWZ0JywgcmV2aXNpb246IDEsIHNvdXJjZV9raW5kOiAncHB0Jywgc2V0dGluZ3M6IHt9IH0sXG4gICAgICAgICAgICAgIHsgaWQ6ICdwb2RjYXN0LW5hdGl2ZS13b3Jrc3BhY2UnLCBwcm9qZWN0X2lkOiBwcm9qZWN0SWQsIGtpbmQ6ICdwb2RjYXN0Jywgc3RhdGU6ICd1bmluaXRpYWxpemVkJywgcmV2aXNpb246IDAsIHNvdXJjZV9raW5kOiAnbWFudWFsJywgc2V0dGluZ3M6IHt9IH0sXG4gICAgICAgICAgICBdLFxuICAgICAgICAgIH0sXG4gICAgICAgIH0pLFxuICAgICAgfSlcbiAgICB9XG4gICAgaWYgKHBhdGhuYW1lID09PSBgL2FwaS9wcm9qZWN0cy8ke3Byb2plY3RJZH0vbmFycmF0aW9uc2ApIHtcbiAgICAgIHJldHVybiByb3V0ZS5mdWxmaWxsKHtcbiAgICAgICAgc3RhdHVzOiAyMDAsXG4gICAgICAgIGNvbnRlbnRUeXBlOiAnYXBwbGljYXRpb24vanNvbicsXG4gICAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHtcbiAgICAgICAgICBzdWNjZXNzOiB0cnVlLFxuICAgICAgICAgIGRhdGE6IHtcbiAgICAgICAgICAgIHBhZ2VzOiBbJ3BhZ2UtMScsICdwYWdlLTInXS5tYXAoKHBhZ2VJZCwgaW5kZXgpID0+ICh7XG4gICAgICAgICAgICAgIHBhZ2VfaWQ6IHBhZ2VJZCxcbiAgICAgICAgICAgICAgb3JkZXJfaW5kZXg6IGluZGV4LFxuICAgICAgICAgICAgICBjdXJyZW50X3ZlcnNpb25faWQ6IGBuYXJyYXRpb24tJHtpbmRleCArIDF9YCxcbiAgICAgICAgICAgICAgcmV2aXNpb246IDEsXG4gICAgICAgICAgICAgIHdvcmRfY291bnQ6IDEwLFxuICAgICAgICAgICAgICBlc3RpbWF0ZWRfc2Vjb25kczogMyxcbiAgICAgICAgICAgICAgY2FuZGlkYXRlX2NvdW50OiAwLFxuICAgICAgICAgICAgfSkpLFxuICAgICAgICAgICAgdG90YWxfcGFnZXM6IDIsXG4gICAgICAgICAgICBjb25maXJtZWRfcGFnZXM6IDIsXG4gICAgICAgICAgICBtaXNzaW5nX3BhZ2VzOiAwLFxuICAgICAgICAgICAgY2FuZGlkYXRlX3BhZ2VzOiAwLFxuICAgICAgICAgIH0sXG4gICAgICAgIH0pLFxuICAgICAgfSlcbiAgICB9XG4gICAgaWYgKHBhdGhuYW1lID09PSBgL2FwaS9wcm9qZWN0cy8ke3Byb2plY3RJZH0vZXhwb3J0L3ZpZGVvL3ByZWZsaWdodGApIHtcbiAgICAgIHJldHVybiByb3V0ZS5mdWxmaWxsKHtcbiAgICAgICAgc3RhdHVzOiAyMDAsXG4gICAgICAgIGNvbnRlbnRUeXBlOiAnYXBwbGljYXRpb24vanNvbicsXG4gICAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHsgc3VjY2VzczogdHJ1ZSwgZGF0YTogeyBjYW5fZXhwb3J0OiB0cnVlLCBlcnJvcnM6IFtdLCB3YXJuaW5nczogW10gfSB9KSxcbiAgICAgIH0pXG4gICAgfVxuICAgIGlmIChwYXRobmFtZSA9PT0gYC9hcGkvY29udGVudC1wcm9qZWN0cy8ke3Byb2plY3RJZH0vd29ya3NwYWNlcy92aWRlby9icm93c2VyLWZyYW1lc2ApIHtcbiAgICAgIG9uQnJvd3NlckZyYW1lcz8uKHJvdXRlLnJlcXVlc3QoKSlcbiAgICAgIHJldHVybiByb3V0ZS5mdWxmaWxsKHtcbiAgICAgICAgc3RhdHVzOiAyMDAsXG4gICAgICAgIGNvbnRlbnRUeXBlOiAnYXBwbGljYXRpb24vanNvbicsXG4gICAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHsgc3VjY2VzczogdHJ1ZSwgZGF0YTogeyBhdHRhY2hlZDogdHJ1ZSB9IH0pLFxuICAgICAgfSlcbiAgICB9XG4gICAgaWYgKHBhdGhuYW1lID09PSBgL2FwaS9wcm9qZWN0cy8ke3Byb2plY3RJZH0vZXhwb3J0L25hdGl2ZS12aWRlb2ApIHtcbiAgICAgIHJldHVybiByb3V0ZS5mdWxmaWxsKHtcbiAgICAgICAgc3RhdHVzOiAyMDAsXG4gICAgICAgIGNvbnRlbnRUeXBlOiAnYXBwbGljYXRpb24vanNvbicsXG4gICAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHsgc3VjY2VzczogdHJ1ZSwgZGF0YTogeyB0YXNrX2lkOiAnbmF0aXZlLXZpZGVvLXRhc2snIH0gfSksXG4gICAgICB9KVxuICAgIH1cbiAgICBpZiAocGF0aG5hbWUgPT09IGAvYXBpL3Byb2plY3RzLyR7cHJvamVjdElkfS90YXNrcy9uYXRpdmUtdmlkZW8tdGFza2ApIHtcbiAgICAgIHJldHVybiByb3V0ZS5mdWxmaWxsKHtcbiAgICAgICAgc3RhdHVzOiAyMDAsXG4gICAgICAgIGNvbnRlbnRUeXBlOiAnYXBwbGljYXRpb24vanNvbicsXG4gICAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHtcbiAgICAgICAgICBzdWNjZXNzOiB0cnVlLFxuICAgICAgICAgIGRhdGE6IHtcbiAgICAgICAgICAgIGlkOiAnbmF0aXZlLXZpZGVvLXRhc2snLFxuICAgICAgICAgICAgc3RhdHVzOiAnQ09NUExFVEVEJyxcbiAgICAgICAgICAgIHByb2dyZXNzOiB7IHRvdGFsOiAyLCBjb21wbGV0ZWQ6IDIsIHBlcmNlbnQ6IDEwMCB9LFxuICAgICAgICAgIH0sXG4gICAgICAgIH0pLFxuICAgICAgfSlcbiAgICB9XG4gICAgaWYgKHBhdGhuYW1lID09PSBgL2FwaS9wcm9qZWN0cy8ke3Byb2plY3RJZH1gKSB7XG4gICAgICByZXR1cm4gcm91dGUuZnVsZmlsbCh7XG4gICAgICAgIHN0YXR1czogMjAwLFxuICAgICAgICBjb250ZW50VHlwZTogJ2FwcGxpY2F0aW9uL2pzb24nLFxuICAgICAgICBib2R5OiBKU09OLnN0cmluZ2lmeSh7XG4gICAgICAgICAgc3VjY2VzczogdHJ1ZSxcbiAgICAgICAgICBkYXRhOiB7XG4gICAgICAgICAgICBpZDogcHJvamVjdElkLFxuICAgICAgICAgICAgcHJvamVjdF9pZDogcHJvamVjdElkLFxuICAgICAgICAgICAgaWRlYV9wcm9tcHQ6ICfljp/nlJ/lt6XkvZzljLrop4bop4npqozmlLYnLFxuICAgICAgICAgICAgcmVuZGVyX21vZGU6ICduYXRpdmUnLFxuICAgICAgICAgICAgc3RhdHVzOiAnTkFUSVZFX0RFQ0tfR0VORVJBVEVEJyxcbiAgICAgICAgICAgIHBhZ2VzOiBbXG4gICAgICAgICAgICAgIHsgaWQ6ICdwYWdlLTEnLCBwYWdlX2lkOiAncGFnZS0xJywgb3JkZXJfaW5kZXg6IDAsIHN0YXR1czogJ05BVElWRV9HRU5FUkFURUQnLCBvdXRsaW5lX2NvbnRlbnQ6IHsgdGl0bGU6ICfljp/nlJ/pobXpnaLpqozmlLYnLCBwb2ludHM6IFtdIH0sIG5hdGl2ZV9sYXlvdXQ6ICdjb3JlMDFfY292ZXInLCBuYXRpdmVfcHJvcHM6IHsga2lja2VyOiAnRWFzeVNsaWRlJywgdGl0bGU6ICfljp/nlJ/pobXpnaLpqozmlLYnLCBzdWJ0aXRsZTogJ+mAkOWFg+e0oOWPr+e8lui+keWvvOWHuicsIF9fYW5pbWF0aW9uOiB7IGVsZW1lbnRFbnRlcjogJ2ZhZGUnIH0gfSB9LFxuICAgICAgICAgICAgICB7IGlkOiAncGFnZS0yJywgcGFnZV9pZDogJ3BhZ2UtMicsIG9yZGVyX2luZGV4OiAxLCBzdGF0dXM6ICdOQVRJVkVfR0VORVJBVEVEJywgb3V0bGluZV9jb250ZW50OiB7IHRpdGxlOiAn56ys5LqM6aG1JywgcG9pbnRzOiBbXSB9LCBuYXRpdmVfbGF5b3V0OiAnY29yZTAxX2VuZCcsIG5hdGl2ZV9wcm9wczogeyB0aXRsZTogJ+esrOS6jOmhtScsIHN1YnRpdGxlOiAn5L+d5oyB57uT5p6E5YyW57yW6L6RJyB9IH0sXG4gICAgICAgICAgICBdLFxuICAgICAgICAgIH0sXG4gICAgICAgIH0pLFxuICAgICAgfSlcbiAgICB9XG4gICAgcmV0dXJuIHJvdXRlLmZ1bGZpbGwoeyBzdGF0dXM6IDIwMCwgY29udGVudFR5cGU6ICdhcHBsaWNhdGlvbi9qc29uJywgYm9keTogSlNPTi5zdHJpbmdpZnkoeyBzdWNjZXNzOiB0cnVlLCBkYXRhOiB7fSB9KSB9KVxuICB9KVxufVxuXG5mdW5jdGlvbiBpbnNwZWN0QnJvd3NlckZyYW1lTXVsdGlwYXJ0KHJlcXVlc3Q6IGltcG9ydCgnQHBsYXl3cmlnaHQvdGVzdCcpLlJlcXVlc3QpIHtcbiAgY29uc3QgYm9keSA9IHJlcXVlc3QucG9zdERhdGFCdWZmZXIoKVxuICBjb25zdCBib3VuZGFyeSA9IHJlcXVlc3QuaGVhZGVycygpWydjb250ZW50LXR5cGUnXT8ubWF0Y2goL2JvdW5kYXJ5PShbXjtdKykvaSk/LlsxXVxuICBpZiAoIWJvZHkgfHwgIWJvdW5kYXJ5KSB0aHJvdyBuZXcgRXJyb3IoJ0Jyb3dzZXIgRnJhbWVzIOivt+axgue8uuWwkSBtdWx0aXBhcnQg5YaF5a65JylcbiAgY29uc3QgdGV4dCA9IGJvZHkudG9TdHJpbmcoJ2xhdGluMScpXG4gIGNvbnN0IHJlYWRGaWVsZCA9IChuYW1lOiBzdHJpbmcpID0+IHtcbiAgICBjb25zdCBtYXRjaCA9IG5ldyBSZWdFeHAoYG5hbWU9XCIke25hbWV9XCJcXFxcclxcXFxuXFxcXHJcXFxcbihbXlxcXFxyXFxcXG5dKylgKS5leGVjKHRleHQpXG4gICAgaWYgKCFtYXRjaCkgdGhyb3cgbmV3IEVycm9yKGBCcm93c2VyIEZyYW1lcyDor7fmsYLnvLrlsJEgJHtuYW1lfWApXG4gICAgcmV0dXJuIEpTT04ucGFyc2UobWF0Y2hbMV0pXG4gIH1cbiAgY29uc3QgbWFya2VyID0gJ25hbWU9XCJmcmFtZXNcIidcbiAgY29uc3QgcG5nU2lnbmF0dXJlID0gQnVmZmVyLmZyb20oWzB4ODksIDB4NTAsIDB4NGUsIDB4NDcsIDB4MGQsIDB4MGEsIDB4MWEsIDB4MGFdKVxuICBjb25zdCBmcmFtZUNvdW50ID0gdGV4dC5zcGxpdChtYXJrZXIpLmxlbmd0aCAtIDFcbiAgY29uc3QgcG5nczogQnVmZmVyW10gPSBbXVxuICBsZXQgY3Vyc29yID0gMFxuICB3aGlsZSAocG5ncy5sZW5ndGggPCBmcmFtZUNvdW50KSB7XG4gICAgY29uc3QgcG5nU3RhcnQgPSBib2R5LmluZGV4T2YocG5nU2lnbmF0dXJlLCBjdXJzb3IpXG4gICAgY29uc3QgcG5nRW5kID0gYm9keS5pbmRleE9mKEJ1ZmZlci5mcm9tKGBcXHJcXG4tLSR7Ym91bmRhcnl9YCksIHBuZ1N0YXJ0KVxuICAgIGlmIChwbmdTdGFydCA8IDAgfHwgcG5nRW5kIDw9IHBuZ1N0YXJ0KSB0aHJvdyBuZXcgRXJyb3IoJ0Jyb3dzZXIgRnJhbWVzIOivt+axguS4reayoeacieacieaViCBQTkcnKVxuICAgIHBuZ3MucHVzaChib2R5LnN1YmFycmF5KHBuZ1N0YXJ0LCBwbmdFbmQpKVxuICAgIGN1cnNvciA9IHBuZ0VuZFxuICB9XG4gIHJldHVybiB7XG4gICAgcGFnZUlkczogcmVhZEZpZWxkKCdwYWdlX2lkcycpIGFzIHN0cmluZ1tdLFxuICAgIGZyYW1lQ291bnRzOiByZWFkRmllbGQoJ2ZyYW1lX2NvdW50cycpIGFzIG51bWJlcltdLFxuICAgIGZyYW1lQ291bnQsXG4gICAgcG5ncyxcbiAgfVxufVxuXG5hc3luYyBmdW5jdGlvbiBtb2NrRGFzaGlQcm9qZWN0KHBhZ2U6IFBhZ2UpIHtcbiAgYXdhaXQgcGFnZS5hZGRJbml0U2NyaXB0KCgpID0+IGxvY2FsU3RvcmFnZS5zZXRJdGVtKCdoYXNTZWVuSGVscE1vZGFsJywgJ3RydWUnKSlcbiAgYXdhaXQgcGFnZS5yb3V0ZSh1cmwgPT4gbmV3IFVSTCh1cmwpLnBhdGhuYW1lLnN0YXJ0c1dpdGgoJy9hcGkvJyksIGFzeW5jIChyb3V0ZSkgPT4ge1xuICAgIGNvbnN0IHBhdGhuYW1lID0gbmV3IFVSTChyb3V0ZS5yZXF1ZXN0KCkudXJsKCkpLnBhdGhuYW1lXG4gICAgaWYgKHBhdGhuYW1lID09PSAnL2FwaS9hY2Nlc3MtY29kZS9jaGVjaycpIHJldHVybiByb3V0ZS5mdWxmaWxsKHsgc3RhdHVzOiAyMDAsIGNvbnRlbnRUeXBlOiAnYXBwbGljYXRpb24vanNvbicsIGJvZHk6IEpTT04uc3RyaW5naWZ5KHsgc3VjY2VzczogdHJ1ZSwgZGF0YTogeyBlbmFibGVkOiBmYWxzZSB9IH0pIH0pXG4gICAgaWYgKHBhdGhuYW1lID09PSAnL2FwaS9zZXR0aW5ncycpIHJldHVybiByb3V0ZS5mdWxmaWxsKHsgc3RhdHVzOiAyMDAsIGNvbnRlbnRUeXBlOiAnYXBwbGljYXRpb24vanNvbicsIGJvZHk6IEpTT04uc3RyaW5naWZ5KHsgc3VjY2VzczogdHJ1ZSwgZGF0YTogeyBvdXRwdXRfbGFuZ3VhZ2U6ICd6aCcgfSB9KSB9KVxuICAgIGlmIChwYXRobmFtZSA9PT0gJy9hcGkvb3V0cHV0LWxhbmd1YWdlJykgcmV0dXJuIHJvdXRlLmZ1bGZpbGwoeyBzdGF0dXM6IDIwMCwgY29udGVudFR5cGU6ICdhcHBsaWNhdGlvbi9qc29uJywgYm9keTogSlNPTi5zdHJpbmdpZnkoeyBzdWNjZXNzOiB0cnVlLCBkYXRhOiB7IGxhbmd1YWdlOiAnemgnIH0gfSkgfSlcbiAgICBpZiAocGF0aG5hbWUgPT09IGAvYXBpL3Byb2plY3RzLyR7ZGFzaGlQcm9qZWN0SWR9YCkge1xuICAgICAgcmV0dXJuIHJvdXRlLmZ1bGZpbGwoe1xuICAgICAgICBzdGF0dXM6IDIwMCxcbiAgICAgICAgY29udGVudFR5cGU6ICdhcHBsaWNhdGlvbi9qc29uJyxcbiAgICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkoe1xuICAgICAgICAgIHN1Y2Nlc3M6IHRydWUsXG4gICAgICAgICAgZGF0YToge1xuICAgICAgICAgICAgaWQ6IGRhc2hpUHJvamVjdElkLFxuICAgICAgICAgICAgcHJvamVjdF9pZDogZGFzaGlQcm9qZWN0SWQsXG4gICAgICAgICAgICBpZGVhX3Byb21wdDogJ0Rhc2hpQUkg5Li76aKY6aqM5pS2JyxcbiAgICAgICAgICAgIHJlbmRlcl9tb2RlOiAnbmF0aXZlJyxcbiAgICAgICAgICAgIG5hdGl2ZV90aGVtZTogJ3RoZW1lMDEnLFxuICAgICAgICAgICAgc3RhdHVzOiAnTkFUSVZFX0RFQ0tfR0VORVJBVEVEJyxcbiAgICAgICAgICAgIHBhZ2VzOiBbXG4gICAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICBpZDogJ3BhZ2Utcm9hZG1hcCcsIHBhZ2VfaWQ6ICdwYWdlLXJvYWRtYXAnLCBvcmRlcl9pbmRleDogMCwgc3RhdHVzOiAnTkFUSVZFX0dFTkVSQVRFRCcsXG4gICAgICAgICAgICAgICAgb3V0bGluZV9jb250ZW50OiB7IHRpdGxlOiAn5Lqn5ZOB5Y2H57qn6Lev57q/5Zu+JywgcG9pbnRzOiBbXSB9LCBuYXRpdmVfbGF5b3V0OiAndGhlbWUwMV9wYWdlMDQwJyxcbiAgICAgICAgICAgICAgICBuYXRpdmVfcHJvcHM6IHtcbiAgICAgICAgICAgICAgICAgIHRpdGxlOiAn5Lqn5ZOB5Y2H57qn6Lev57q/5Zu+JyxcbiAgICAgICAgICAgICAgICAgIHBoYXNlczogW1xuICAgICAgICAgICAgICAgICAgICB7IHBlcmlvZDogJ1ExJywgc3RlcDogJzAxJywgaGVhZGluZzogJ+iDveWKm+mqjOivgScsIHBvaW50czogWyfkuLvpopjov5DooYzml7YnLCAn6YCQ5YWD57Sg57yW6L6RJ10sIHZlcmRpY3Q6ICflj6/nlKgnIH0sXG4gICAgICAgICAgICAgICAgICAgIHsgcGVyaW9kOiAnUTInLCBzdGVwOiAnMDInLCBoZWFkaW5nOiAn6LSo6YeP5o+Q5Y2HJywgcG9pbnRzOiBbJ+W4g+WxgOWOu+mHjScsICflr7zlh7rmoKHpqownXSwgdmVyZGljdDogJ+eos+WumicgfSxcbiAgICAgICAgICAgICAgICAgICAgeyBwZXJpb2Q6ICdRMycsIHN0ZXA6ICcwMycsIGhlYWRpbmc6ICfop4TmqKHmjqjlub8nLCBwb2ludHM6IFsn5YWo5Li76aKY6KaG55uWJywgJ+i1hOS6p+WkjeeUqCddLCB2ZXJkaWN0OiAn5Lqk5LuYJyB9LFxuICAgICAgICAgICAgICAgICAgXSxcbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgaWQ6ICdwYWdlLWNvZGUnLCBwYWdlX2lkOiAncGFnZS1jb2RlJywgb3JkZXJfaW5kZXg6IDEsIHN0YXR1czogJ05BVElWRV9HRU5FUkFURUQnLFxuICAgICAgICAgICAgICAgIG91dGxpbmVfY29udGVudDogeyB0aXRsZTogJ+aKgOacr+i3r+e6v+WvvOiniCcsIHBvaW50czogW10gfSwgbmF0aXZlX2xheW91dDogJ3RoZW1lMDNfcGFnZTAwNicsXG4gICAgICAgICAgICAgICAgbmF0aXZlX3Byb3BzOiB7IHRpdGxlUHJlOiAn5oqA5pyvJywgdGl0bGVBY2NlbnQ6ICfot6/nur/lr7zop4gnLCBzaG93RGVjb3I6IHRydWUsIGRlY29yU3JjOiAnYXNzZXRzLzNkLzA4LnBuZycgfSxcbiAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgIGlkOiAncGFnZS11bmljb3JuJywgcGFnZV9pZDogJ3BhZ2UtdW5pY29ybicsIG9yZGVyX2luZGV4OiAyLCBzdGF0dXM6ICdOQVRJVkVfR0VORVJBVEVEJyxcbiAgICAgICAgICAgICAgICBvdXRsaW5lX2NvbnRlbnQ6IHsgdGl0bGU6ICfliqjmgIHog4zmma/pqozmlLYnLCBwb2ludHM6IFtdIH0sIG5hdGl2ZV9sYXlvdXQ6ICd0aGVtZTAxX3BhZ2UwMzAnLFxuICAgICAgICAgICAgICAgIG5hdGl2ZV9wcm9wczogeyB0aXRsZTogJ+WKqOaAgeiDjOaZr+mqjOaUticsIGJhY2tncm91bmRNb2RlOiAndW5pY29ybicsIHVuaWNvcm5TY2VuZTogJ3RlY2gnIH0sXG4gICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBdLFxuICAgICAgICAgIH0sXG4gICAgICAgIH0pLFxuICAgICAgfSlcbiAgICB9XG4gICAgcmV0dXJuIHJvdXRlLmZ1bGZpbGwoeyBzdGF0dXM6IDIwMCwgY29udGVudFR5cGU6ICdhcHBsaWNhdGlvbi9qc29uJywgYm9keTogSlNPTi5zdHJpbmdpZnkoeyBzdWNjZXNzOiB0cnVlLCBkYXRhOiB7fSB9KSB9KVxuICB9KVxufVxuXG5hc3luYyBmdW5jdGlvbiBtb2NrSHVhc2h1UHJvamVjdChwYWdlOiBQYWdlLCBvbkV4cG9ydENvbXBsZXRlPzogKHJlcXVlc3Q6IGltcG9ydCgnQHBsYXl3cmlnaHQvdGVzdCcpLlJlcXVlc3QpID0+IHZvaWQpIHtcbiAgYXdhaXQgcGFnZS5hZGRJbml0U2NyaXB0KCgpID0+IGxvY2FsU3RvcmFnZS5zZXRJdGVtKCdoYXNTZWVuSGVscE1vZGFsJywgJ3RydWUnKSlcbiAgYXdhaXQgcGFnZS5yb3V0ZSh1cmwgPT4gbmV3IFVSTCh1cmwpLnBhdGhuYW1lLnN0YXJ0c1dpdGgoJy9hcGkvJyksIGFzeW5jIChyb3V0ZSkgPT4ge1xuICAgIGNvbnN0IHBhdGhuYW1lID0gbmV3IFVSTChyb3V0ZS5yZXF1ZXN0KCkudXJsKCkpLnBhdGhuYW1lXG4gICAgaWYgKHBhdGhuYW1lID09PSAnL2FwaS9hY2Nlc3MtY29kZS9jaGVjaycpIHJldHVybiByb3V0ZS5mdWxmaWxsKHsgc3RhdHVzOiAyMDAsIGNvbnRlbnRUeXBlOiAnYXBwbGljYXRpb24vanNvbicsIGJvZHk6IEpTT04uc3RyaW5naWZ5KHsgc3VjY2VzczogdHJ1ZSwgZGF0YTogeyBlbmFibGVkOiBmYWxzZSB9IH0pIH0pXG4gICAgaWYgKHBhdGhuYW1lID09PSAnL2FwaS9zZXR0aW5ncycpIHJldHVybiByb3V0ZS5mdWxmaWxsKHsgc3RhdHVzOiAyMDAsIGNvbnRlbnRUeXBlOiAnYXBwbGljYXRpb24vanNvbicsIGJvZHk6IEpTT04uc3RyaW5naWZ5KHsgc3VjY2VzczogdHJ1ZSwgZGF0YTogeyBvdXRwdXRfbGFuZ3VhZ2U6ICd6aCcgfSB9KSB9KVxuICAgIGlmIChwYXRobmFtZSA9PT0gJy9hcGkvb3V0cHV0LWxhbmd1YWdlJykgcmV0dXJuIHJvdXRlLmZ1bGZpbGwoeyBzdGF0dXM6IDIwMCwgY29udGVudFR5cGU6ICdhcHBsaWNhdGlvbi9qc29uJywgYm9keTogSlNPTi5zdHJpbmdpZnkoeyBzdWNjZXNzOiB0cnVlLCBkYXRhOiB7IGxhbmd1YWdlOiAnemgnIH0gfSkgfSlcbiAgICBpZiAocGF0aG5hbWUgPT09IGAvYXBpL3Byb2plY3RzLyR7aHVhc2h1UHJvamVjdElkfS9leHBvcnQvbmF0aXZlLXBwdHhgICYmIHJvdXRlLnJlcXVlc3QoKS5tZXRob2QoKSA9PT0gJ1BPU1QnKSB7XG4gICAgICByZXR1cm4gcm91dGUuZnVsZmlsbCh7IHN0YXR1czogMjAwLCBjb250ZW50VHlwZTogJ2FwcGxpY2F0aW9uL2pzb24nLCBib2R5OiBKU09OLnN0cmluZ2lmeSh7IHN1Y2Nlc3M6IHRydWUsIGRhdGE6IHsgdGFza19pZDogJ2h1YXNodS1leHBvcnQtdGFzaycsIHN0YXR1czogJ1BFTkRJTkcnIH0gfSkgfSlcbiAgICB9XG4gICAgaWYgKHBhdGhuYW1lID09PSBgL2FwaS9wcm9qZWN0cy8ke2h1YXNodVByb2plY3RJZH0vZXhwb3J0L25hdGl2ZS1wcHR4L2h1YXNodS1leHBvcnQtdGFzay9wcm9ncmVzc2ApIHtcbiAgICAgIHJldHVybiByb3V0ZS5mdWxmaWxsKHsgc3RhdHVzOiAyMDAsIGNvbnRlbnRUeXBlOiAnYXBwbGljYXRpb24vanNvbicsIGJvZHk6IEpTT04uc3RyaW5naWZ5KHsgc3VjY2VzczogdHJ1ZSwgZGF0YTogeyB0YXNrX2lkOiAnaHVhc2h1LWV4cG9ydC10YXNrJywgc3RhdHVzOiAnUFJPQ0VTU0lORycgfSB9KSB9KVxuICAgIH1cbiAgICBpZiAocGF0aG5hbWUgPT09IGAvYXBpL3Byb2plY3RzLyR7aHVhc2h1UHJvamVjdElkfS9leHBvcnQvbmF0aXZlLXBwdHgvaHVhc2h1LWV4cG9ydC10YXNrL2NvbXBsZXRlYCkge1xuICAgICAgb25FeHBvcnRDb21wbGV0ZT8uKHJvdXRlLnJlcXVlc3QoKSlcbiAgICAgIHJldHVybiByb3V0ZS5mdWxmaWxsKHsgc3RhdHVzOiAyMDAsIGNvbnRlbnRUeXBlOiAnYXBwbGljYXRpb24vanNvbicsIGJvZHk6IEpTT04uc3RyaW5naWZ5KHsgc3VjY2VzczogdHJ1ZSwgZGF0YTogeyB0YXNrX2lkOiAnaHVhc2h1LWV4cG9ydC10YXNrJywgc3RhdHVzOiAnQ09NUExFVEVEJywgcHJvZ3Jlc3M6IHsgZG93bmxvYWRfdXJsOiAnL2ZpbGVzL2h1YXNodS9leHBvcnRzL2h1YXNodS5wcHR4JywgZmlsZW5hbWU6ICdIdWFzaHUg5Y6f55Sf6K6+6K6h57O757uf6KeG6KeJ6aqM5pS2LnBwdHgnIH0gfSB9KSB9KVxuICAgIH1cbiAgICBpZiAocGF0aG5hbWUgPT09IGAvYXBpL3Byb2plY3RzLyR7aHVhc2h1UHJvamVjdElkfWApIHtcbiAgICAgIHJldHVybiByb3V0ZS5mdWxmaWxsKHtcbiAgICAgICAgc3RhdHVzOiAyMDAsXG4gICAgICAgIGNvbnRlbnRUeXBlOiAnYXBwbGljYXRpb24vanNvbicsXG4gICAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHtcbiAgICAgICAgICBzdWNjZXNzOiB0cnVlLFxuICAgICAgICAgIGRhdGE6IHtcbiAgICAgICAgICAgIGlkOiBodWFzaHVQcm9qZWN0SWQsXG4gICAgICAgICAgICBwcm9qZWN0X2lkOiBodWFzaHVQcm9qZWN0SWQsXG4gICAgICAgICAgICBpZGVhX3Byb21wdDogJ0h1YXNodSDljp/nlJ/orr7orqHns7vnu5/op4bop4npqozmlLYnLFxuICAgICAgICAgICAgcmVuZGVyX21vZGU6ICduYXRpdmUnLFxuICAgICAgICAgICAgc3RhdHVzOiAnTkFUSVZFX0RFQ0tfR0VORVJBVEVEJyxcbiAgICAgICAgICAgIHBhZ2VzOiBodWFzaHVTbGlkZXMsXG4gICAgICAgICAgfSxcbiAgICAgICAgfSksXG4gICAgICB9KVxuICAgIH1cbiAgICByZXR1cm4gcm91dGUuZnVsZmlsbCh7IHN0YXR1czogMjAwLCBjb250ZW50VHlwZTogJ2FwcGxpY2F0aW9uL2pzb24nLCBib2R5OiBKU09OLnN0cmluZ2lmeSh7IHN1Y2Nlc3M6IHRydWUsIGRhdGE6IHt9IH0pIH0pXG4gIH0pXG59XG5cbmZ1bmN0aW9uIGV4dHJhY3RQcHR4RnJvbU11bHRpcGFydChyZXF1ZXN0OiBpbXBvcnQoJ0BwbGF5d3JpZ2h0L3Rlc3QnKS5SZXF1ZXN0KSB7XG4gIGNvbnN0IGJvZHkgPSByZXF1ZXN0LnBvc3REYXRhQnVmZmVyKClcbiAgY29uc3QgYm91bmRhcnkgPSByZXF1ZXN0LmhlYWRlcnMoKVsnY29udGVudC10eXBlJ10/Lm1hdGNoKC9ib3VuZGFyeT0oW147XSspL2kpPy5bMV1cbiAgaWYgKCFib2R5IHx8ICFib3VuZGFyeSkgdGhyb3cgbmV3IEVycm9yKCflr7zlh7rkuIrkvKDor7fmsYLnvLrlsJEgbXVsdGlwYXJ0IOaWh+S7tuWGheWuuScpXG4gIGNvbnN0IHN0YXJ0ID0gYm9keS5pbmRleE9mKEJ1ZmZlci5mcm9tKFsweDUwLCAweDRiLCAweDAzLCAweDA0XSkpXG4gIGNvbnN0IGVuZCA9IGJvZHkuaW5kZXhPZihCdWZmZXIuZnJvbShgXFxyXFxuLS0ke2JvdW5kYXJ5fWApLCBzdGFydClcbiAgaWYgKHN0YXJ0IDwgMCB8fCBlbmQgPD0gc3RhcnQpIHRocm93IG5ldyBFcnJvcign5a+85Ye65LiK5Lyg6K+35rGC5Lit5pyq5om+5Yiw5pyJ5pWIIFBQVFgg5paH5Lu2JylcbiAgcmV0dXJuIGJvZHkuc3ViYXJyYXkoc3RhcnQsIGVuZClcbn1cblxuZm9yIChjb25zdCB2aWV3cG9ydCBvZiBbXG4gIHsgd2lkdGg6IDEyMDAsIGhlaWdodDogNzYwIH0sXG4gIHsgd2lkdGg6IDE0NDAsIGhlaWdodDogOTAwIH0sXG4gIHsgd2lkdGg6IDE5MjAsIGhlaWdodDogMTA4MCB9LFxuXSkge1xuICB0ZXN0KGBuYXRpdmUgd29ya3NwYWNlIGZpdHMgJHt2aWV3cG9ydC53aWR0aH14JHt2aWV3cG9ydC5oZWlnaHR9YCwgYXN5bmMgKHsgcGFnZSB9LCB0ZXN0SW5mbykgPT4ge1xuICAgIGF3YWl0IHBhZ2Uuc2V0Vmlld3BvcnRTaXplKHZpZXdwb3J0KVxuICAgIGF3YWl0IG1vY2tOYXRpdmVQcm9qZWN0KHBhZ2UpXG4gICAgYXdhaXQgcGFnZS5nb3RvKGAvcHJvamVjdC8ke3Byb2plY3RJZH0vcHJldmlld2ApXG5cbiAgICBjb25zdCBzaGVsbCA9IHBhZ2UubG9jYXRvcignLndvcmtzcGFjZS1zaGVsbCcpXG4gICAgYXdhaXQgZXhwZWN0KHNoZWxsKS50b0JlVmlzaWJsZSgpXG4gICAgYXdhaXQgZXhwZWN0KHBhZ2UuZ2V0QnlSb2xlKCdtYWluJykpLnRvQ29udGFpblRleHQoJ+WOn+eUn+mhtemdoumqjOaUticpXG4gICAgYXdhaXQgZXhwZWN0KHNoZWxsKS50b0hhdmVBdHRyaWJ1dGUoJ2RhdGEtaW5zcGVjdG9yLWxheW91dCcsIHZpZXdwb3J0LndpZHRoID09PSAxMjAwID8gJ2RyYXdlcicgOiAnY29sdW1uJylcblxuICAgIGNvbnN0IGluc3BlY3RvciA9IHBhZ2UuZ2V0QnlSb2xlKCdjb21wbGVtZW50YXJ5JywgeyBuYW1lOiAn5bGe5oCn5qCPJyB9KVxuXG4gICAgaWYgKHZpZXdwb3J0LndpZHRoID09PSAxMjAwKSB7XG4gICAgICBjb25zdCBvcGVuSW5zcGVjdG9yID0gcGFnZS5sb2NhdG9yKCcud29ya3NwYWNlLXNoZWxsID4gaGVhZGVyIGJ1dHRvblthcmlhLWxhYmVsPVwi5omT5byA5bGe5oCn5qCPXCJdJylcbiAgICAgIGF3YWl0IGV4cGVjdChvcGVuSW5zcGVjdG9yKS50b0JlVmlzaWJsZSgpXG4gICAgICBhd2FpdCBvcGVuSW5zcGVjdG9yLmNsaWNrKClcbiAgICAgIGF3YWl0IGV4cGVjdChpbnNwZWN0b3IpLnRvQmVWaXNpYmxlKClcbiAgICB9XG5cbiAgICBhd2FpdCBpbnNwZWN0b3IuZ2V0QnlSb2xlKCd0YWInLCB7IG5hbWU6ICflhoXlrrknIH0pLmNsaWNrKClcbiAgICBhd2FpdCBleHBlY3QoaW5zcGVjdG9yLmdldEJ5Um9sZSgndGV4dGJveCcsIHsgbmFtZTogJ3RpdGxlJywgZXhhY3Q6IHRydWUgfSkpLnRvQmVWaXNpYmxlKClcblxuICAgIGF3YWl0IGluc3BlY3Rvci5nZXRCeVJvbGUoJ3RhYicsIHsgbmFtZTogJ+iuvuiuoScgfSkuY2xpY2soKVxuICAgIGF3YWl0IGluc3BlY3Rvci5nZXRCeVRleHQoJ+mhtemdouWKqOaViCcpLmNsaWNrKClcbiAgICBhd2FpdCBpbnNwZWN0b3IuZ2V0QnlSb2xlKCdjb21ib2JveCcsIHsgbmFtZTogJ+i/m+WFpeaViOaenCcgfSkuc2VsZWN0T3B0aW9uKCdmYWRlJylcbiAgICBhd2FpdCBleHBlY3QocGFnZS5nZXRCeVJvbGUoJ2J1dHRvbicsIHsgbmFtZTogJ+mHjeaWsOmihOiniOWKqOaViCcgfSkpLnRvQmVFbmFibGVkKClcbiAgICBhd2FpdCBwYWdlLmdldEJ5Um9sZSgnYnV0dG9uJywgeyBuYW1lOiAn6YeN5paw6aKE6KeI5Yqo5pWIJyB9KS5jbGljaygpXG4gICAgYXdhaXQgZXhwZWN0KHBhZ2UubG9jYXRvcignbWFpbiAubmF0aXZlLWVudGVyLWZhZGUnKSkudG9IYXZlQ2xhc3MoL25hdGl2ZS1lbnRlci1mYWRlLylcbiAgICBhd2FpdCBwYWdlLmdldEJ5Um9sZSgnYnV0dG9uJywgeyBuYW1lOiAv56ysIDIg6aG1LyB9KS5jbGljaygpXG4gICAgYXdhaXQgaW5zcGVjdG9yLmdldEJ5Um9sZSgnY29tYm9ib3gnLCB7IG5hbWU6ICfpobXpnaLliIfmjaInIH0pLnNlbGVjdE9wdGlvbignY292ZXInKVxuICAgIGF3YWl0IGluc3BlY3Rvci5nZXRCeVJvbGUoJ2NvbWJvYm94JywgeyBuYW1lOiAn5YiH5o2i6YCf5bqmJyB9KS5zZWxlY3RPcHRpb24oJ3Nsb3cnKVxuICAgIGF3YWl0IGluc3BlY3Rvci5nZXRCeVJvbGUoJ2NvbWJvYm94JywgeyBuYW1lOiAn5YiH5o2i5pa55ZCRJyB9KS5zZWxlY3RPcHRpb24oJ3UnKVxuICAgIGF3YWl0IHBhZ2UuZ2V0QnlSb2xlKCdidXR0b24nLCB7IG5hbWU6IC/nrKwgMSDpobUvIH0pLmNsaWNrKClcbiAgICBhd2FpdCBwYWdlLmdldEJ5Um9sZSgnYnV0dG9uJywgeyBuYW1lOiAv56ysIDIg6aG1LyB9KS5jbGljaygpXG4gICAgYXdhaXQgZXhwZWN0KHBhZ2UubG9jYXRvcignbWFpbiAubmF0aXZlLXBhZ2UtdHJhbnNpdGlvbi1jb3ZlcicpKS50b0hhdmVDbGFzcygvbmF0aXZlLXBhZ2UtdHJhbnNpdGlvbi1jb3Zlci8pXG5cbiAgICBjb25zdCBvdmVyZmxvdyA9IGF3YWl0IHBhZ2UuZXZhbHVhdGUoKCkgPT4gKHtcbiAgICAgIHdpZHRoOiBkb2N1bWVudC5kb2N1bWVudEVsZW1lbnQuc2Nyb2xsV2lkdGggLSB3aW5kb3cuaW5uZXJXaWR0aCxcbiAgICAgIGhlaWdodDogZG9jdW1lbnQuZG9jdW1lbnRFbGVtZW50LnNjcm9sbEhlaWdodCAtIHdpbmRvdy5pbm5lckhlaWdodCxcbiAgICB9KSlcbiAgICBleHBlY3Qob3ZlcmZsb3cud2lkdGgpLnRvQmVMZXNzVGhhbk9yRXF1YWwoMSlcbiAgICBleHBlY3Qob3ZlcmZsb3cuaGVpZ2h0KS50b0JlTGVzc1RoYW5PckVxdWFsKDEpXG4gICAgYXdhaXQgcGFnZS5zY3JlZW5zaG90KHsgcGF0aDogdGVzdEluZm8ub3V0cHV0UGF0aChgbmF0aXZlLSR7dmlld3BvcnQud2lkdGh9eCR7dmlld3BvcnQuaGVpZ2h0fS5wbmdgKSwgZnVsbFBhZ2U6IHRydWUgfSlcbiAgfSlcbn1cblxudGVzdCgnRGFzaGlBSSBydW50aW1lIHJlbmRlcnMgY29tcGxleCBwcm9wcyBhbmQgY29waWVkIGFzc2V0cycsIGFzeW5jICh7IHBhZ2UgfSkgPT4ge1xuICB0ZXN0LnNldFRpbWVvdXQoOTBfMDAwKVxuICBhd2FpdCBwYWdlLnNldFZpZXdwb3J0U2l6ZSh7IHdpZHRoOiAxNDQwLCBoZWlnaHQ6IDkwMCB9KVxuICBhd2FpdCBtb2NrRGFzaGlQcm9qZWN0KHBhZ2UpXG4gIGF3YWl0IHBhZ2UuZ290byhgL3Byb2plY3QvJHtkYXNoaVByb2plY3RJZH0vcHJldmlld2ApXG5cbiAgYXdhaXQgZXhwZWN0KHBhZ2UuZ2V0QnlSb2xlKCdtYWluJykpLnRvQ29udGFpblRleHQoJ+S6p+WTgeWNh+e6p+i3r+e6v+WbvicpXG4gIGNvbnN0IGluc3BlY3RvciA9IHBhZ2UuZ2V0QnlSb2xlKCdjb21wbGVtZW50YXJ5JywgeyBuYW1lOiAn5bGe5oCn5qCPJyB9KVxuICBhd2FpdCBpbnNwZWN0b3IuZ2V0QnlSb2xlKCd0YWInLCB7IG5hbWU6ICflhoXlrrknIH0pLmNsaWNrKClcbiAgYXdhaXQgZXhwZWN0KGluc3BlY3RvcikudG9Db250YWluVGV4dCgncGhhc2VzJylcbiAgY29uc3QgbmF2aWdhdG9yID0gcGFnZS5nZXRCeVRlc3RJZCgnbmF0aXZlLXBhZ2UtbmF2aWdhdG9yJylcbiAgYXdhaXQgbmF2aWdhdG9yLmdldEJ5Um9sZSgnYnV0dG9uJywgeyBuYW1lOiAn5LiL5LiA6aG1JyB9KS5jbGljaygpXG4gIGF3YWl0IGV4cGVjdChwYWdlLmdldEJ5Um9sZSgnbWFpbicpKS50b0NvbnRhaW5UZXh0KCfmioDmnK/ot6/nur/lr7zop4gnKVxuICBjb25zdCBkZWNvciA9IHBhZ2UuZ2V0QnlSb2xlKCdtYWluJykubG9jYXRvcignaW1nJykuZmlyc3QoKVxuICBhd2FpdCBleHBlY3QoZGVjb3IpLnRvQmVWaXNpYmxlKClcbiAgYXdhaXQgZXhwZWN0LnBvbGwoKCkgPT4gZGVjb3IuZXZhbHVhdGUoKGltYWdlOiBIVE1MSW1hZ2VFbGVtZW50KSA9PiBpbWFnZS5uYXR1cmFsV2lkdGgpKS50b0JlR3JlYXRlclRoYW4oMClcblxuICBhd2FpdCBuYXZpZ2F0b3IuZ2V0QnlSb2xlKCdidXR0b24nLCB7IG5hbWU6ICfkuIvkuIDpobUnIH0pLmNsaWNrKClcbiAgY29uc3QgdW5pY29ybkZyYW1lID0gcGFnZS5sb2NhdG9yKCdtYWluIC5idC11bmljb3JuLWZyYW1lW2RhdGEtdW5pY29ybi1yZWFkeT1cInRydWVcIl0nKS5maXJzdCgpXG4gIGF3YWl0IGV4cGVjdCh1bmljb3JuRnJhbWUpLnRvQmVWaXNpYmxlKHsgdGltZW91dDogMTUwMDAgfSlcbiAgY29uc3QgY2FudmFzID0gdW5pY29ybkZyYW1lLmxvY2F0b3IoJ2NhbnZhcycpXG4gIGF3YWl0IGV4cGVjdChjYW52YXMpLnRvQmVWaXNpYmxlKClcbiAgYXdhaXQgZXhwZWN0KGNhbnZhcykudG9IYXZlQXR0cmlidXRlKCd3aWR0aCcsIC9bMS05XVxcZCovKVxuICBhd2FpdCBleHBlY3QoY2FudmFzKS50b0hhdmVBdHRyaWJ1dGUoJ2hlaWdodCcsIC9bMS05XVxcZCovKVxuXG4gIGNvbnN0IG92ZXJmbG93ID0gYXdhaXQgcGFnZS5ldmFsdWF0ZSgoKSA9PiAoe1xuICAgIHdpZHRoOiBkb2N1bWVudC5kb2N1bWVudEVsZW1lbnQuc2Nyb2xsV2lkdGggLSB3aW5kb3cuaW5uZXJXaWR0aCxcbiAgICBoZWlnaHQ6IGRvY3VtZW50LmRvY3VtZW50RWxlbWVudC5zY3JvbGxIZWlnaHQgLSB3aW5kb3cuaW5uZXJIZWlnaHQsXG4gIH0pKVxuICBleHBlY3Qob3ZlcmZsb3cud2lkdGgpLnRvQmVMZXNzVGhhbk9yRXF1YWwoMSlcbiAgZXhwZWN0KG92ZXJmbG93LmhlaWdodCkudG9CZUxlc3NUaGFuT3JFcXVhbCgxKVxufSlcblxudGVzdCgnbmF0aXZlIERPTSBoYW5kcyBwcm9ncmVzc2l2ZSBQTkcgZnJhbWVzIHRvIHRoZSB2aWRlbyB3b3Jrc3BhY2UnLCBhc3luYyAoeyBwYWdlIH0sIHRlc3RJbmZvKSA9PiB7XG4gIHRlc3Quc2V0VGltZW91dCgxMjBfMDAwKVxuICBsZXQgY2FwdHVyZWQ6IFJldHVyblR5cGU8dHlwZW9mIGluc3BlY3RCcm93c2VyRnJhbWVNdWx0aXBhcnQ+IHwgdW5kZWZpbmVkXG4gIGF3YWl0IHBhZ2Uuc2V0Vmlld3BvcnRTaXplKHsgd2lkdGg6IDE0NDAsIGhlaWdodDogOTAwIH0pXG4gIGF3YWl0IG1vY2tOYXRpdmVQcm9qZWN0KHBhZ2UsIChyZXF1ZXN0KSA9PiB7IGNhcHR1cmVkID0gaW5zcGVjdEJyb3dzZXJGcmFtZU11bHRpcGFydChyZXF1ZXN0KSB9KVxuICBhd2FpdCBwYWdlLmdvdG8oYC9wcm9qZWN0LyR7cHJvamVjdElkfS9wcmV2aWV3YClcblxuICBhd2FpdCBleHBlY3QocGFnZS5sb2NhdG9yKCdtYWluIC5uYXRpdmUtc2xpZGUnKSkudG9IYXZlQXR0cmlidXRlKCdkYXRhLW5hdGl2ZS1sYXlvdXQtcmVhZHknLCAndHJ1ZScpXG4gIGF3YWl0IHBhZ2UuZ2V0QnlMYWJlbCgn5a+85Ye65qC85byPJykuc2VsZWN0T3B0aW9uKCforrLop6Pop4bpopEnKVxuICBhd2FpdCBwYWdlLmdldEJ5Um9sZSgnYnV0dG9uJywgeyBuYW1lOiAn5a+85Ye66K6y6Kej6KeG6aKRJyB9KS5jbGljaygpXG4gIGF3YWl0IGV4cGVjdChwYWdlLmdldEJ5Um9sZSgnZGlhbG9nJywgeyBuYW1lOiAn6K6y6Kej6KeG6aKR6K6+572uJyB9KSkudG9CZVZpc2libGUoKVxuICBhd2FpdCBwYWdlLmdldEJ5Um9sZSgnYnV0dG9uJywgeyBuYW1lOiAn5byA5aeL5a+85Ye66KeG6aKRJyB9KS5jbGljaygpXG4gIGF3YWl0IGV4cGVjdC5wb2xsKCgpID0+IGNhcHR1cmVkPy5mcmFtZUNvdW50IHx8IDAsIHsgdGltZW91dDogOTBfMDAwIH0pLnRvQmVHcmVhdGVyVGhhbigxKVxuXG4gIGV4cGVjdChjYXB0dXJlZCEucGFnZUlkcykudG9FcXVhbChbJ3BhZ2UtMScsICdwYWdlLTInXSlcbiAgZXhwZWN0KGNhcHR1cmVkIS5mcmFtZUNvdW50c1swXSkudG9CZUdyZWF0ZXJUaGFuKDEpXG4gIGV4cGVjdChjYXB0dXJlZCEuZnJhbWVDb3VudHNbMV0pLnRvQmUoMSlcbiAgZXhwZWN0KGNhcHR1cmVkIS5mcmFtZUNvdW50KS50b0JlKGNhcHR1cmVkIS5mcmFtZUNvdW50cy5yZWR1Y2UoKHRvdGFsLCBjb3VudCkgPT4gdG90YWwgKyBjb3VudCwgMCkpXG4gIGNvbnN0IGZpcnN0UG5nID0gY2FwdHVyZWQhLnBuZ3NbMF1cbiAgY29uc3QgZmluYWxQbmcgPSBjYXB0dXJlZCEucG5nc1tjYXB0dXJlZCEuZnJhbWVDb3VudHNbMF0gLSAxXVxuICBleHBlY3QoZmlyc3RQbmcubGVuZ3RoKS50b0JlR3JlYXRlclRoYW4oMV8wMDApXG4gIGV4cGVjdChmaW5hbFBuZy5lcXVhbHMoZmlyc3RQbmcpKS50b0JlKGZhbHNlKVxuICBjb25zdCBmaXJzdEZyYW1lUGF0aCA9IHRlc3RJbmZvLm91dHB1dFBhdGgoJ2Jyb3dzZXItZnJhbWUtcGFnZS0xLXN0YWdlLTEucG5nJylcbiAgY29uc3QgZmluYWxGcmFtZVBhdGggPSB0ZXN0SW5mby5vdXRwdXRQYXRoKCdicm93c2VyLWZyYW1lLXBhZ2UtMS1maW5hbC1zdGFnZS5wbmcnKVxuICB3cml0ZUZpbGVTeW5jKGZpcnN0RnJhbWVQYXRoLCBmaXJzdFBuZylcbiAgd3JpdGVGaWxlU3luYyhmaW5hbEZyYW1lUGF0aCwgZmluYWxQbmcpXG4gIGF3YWl0IHRlc3RJbmZvLmF0dGFjaCgnYnJvd3Nlci1mcmFtZS1wYWdlLTEtc3RhZ2UtMScsIHsgcGF0aDogZmlyc3RGcmFtZVBhdGgsIGNvbnRlbnRUeXBlOiAnaW1hZ2UvcG5nJyB9KVxuICBhd2FpdCB0ZXN0SW5mby5hdHRhY2goJ2Jyb3dzZXItZnJhbWUtcGFnZS0xLWZpbmFsLXN0YWdlJywgeyBwYXRoOiBmaW5hbEZyYW1lUGF0aCwgY29udGVudFR5cGU6ICdpbWFnZS9wbmcnIH0pXG59KVxuXG50ZXN0KCdIdWFzaHUgbGF5b3V0cyBrZWVwIGxvbmcgQ2hpbmVzZSBjb3B5LCBtZWRpYSwgYW5kIHZpc3VhbCBzeXN0ZW1zIGluc2lkZSB0aGUgc2xpZGUnLCBhc3luYyAoeyBwYWdlIH0sIHRlc3RJbmZvKSA9PiB7XG4gIGF3YWl0IHBhZ2Uuc2V0Vmlld3BvcnRTaXplKHsgd2lkdGg6IDE5MjAsIGhlaWdodDogMTA4MCB9KVxuICBhd2FpdCBtb2NrSHVhc2h1UHJvamVjdChwYWdlKVxuICBhd2FpdCBwYWdlLmdvdG8oYC9wcm9qZWN0LyR7aHVhc2h1UHJvamVjdElkfS9wcmV2aWV3YClcblxuICBhd2FpdCBleHBlY3QocGFnZS5sb2NhdG9yKCdtYWluIC5uYXRpdmUtc2xpZGUnKSkudG9IYXZlQXR0cmlidXRlKCdkYXRhLW5hdGl2ZS1sYXlvdXQtcmVhZHknLCAndHJ1ZScpXG4gIGNvbnN0IGFjY2VudHMgPSBuZXcgU2V0PHN0cmluZz4oKVxuXG4gIGZvciAobGV0IGluZGV4ID0gMDsgaW5kZXggPCBodWFzaHVTbGlkZXMubGVuZ3RoOyBpbmRleCArPSAxKSB7XG4gICAgYXdhaXQgcGFnZS5nZXRCeVJvbGUoJ2J1dHRvbicsIHsgbmFtZTogbmV3IFJlZ0V4cChgXuesrCAke2luZGV4ICsgMX0g6aG1YCkgfSkuY2xpY2soKVxuICAgIGNvbnN0IHNsaWRlID0gcGFnZS5sb2NhdG9yKCdtYWluIC5uYXRpdmUtc2xpZGUnKS5sYXN0KClcbiAgICBhd2FpdCBleHBlY3Qoc2xpZGUpLnRvSGF2ZUF0dHJpYnV0ZSgnZGF0YS1sYXlvdXQnLCBodWFzaHVTbGlkZXNbaW5kZXhdLm5hdGl2ZV9sYXlvdXQpXG4gICAgYXdhaXQgZXhwZWN0KHNsaWRlKS50b0hhdmVBdHRyaWJ1dGUoJ2RhdGEtZGVzaWduLWVuZ2luZScsICdodWFzaHVfbmF0aXZlJylcbiAgICBhd2FpdCBleHBlY3Qoc2xpZGUpLnRvSGF2ZUF0dHJpYnV0ZSgnZGF0YS12aXN1YWwtc3lzdGVtJywgdmlzdWFsU3lzdGVtc1tpbmRleCAlIHZpc3VhbFN5c3RlbXMubGVuZ3RoXSlcblxuICAgIGNvbnN0IGF1ZGl0ID0gYXdhaXQgc2xpZGUuZXZhbHVhdGUoKHJvb3QpID0+IHtcbiAgICAgIGNvbnN0IHNsaWRlUmVjdCA9IHJvb3QuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KClcbiAgICAgIGNvbnN0IHdhbGtlciA9IGRvY3VtZW50LmNyZWF0ZVRyZWVXYWxrZXIocm9vdCwgTm9kZUZpbHRlci5TSE9XX1RFWFQpXG4gICAgICBjb25zdCBlc2NhcGVkVGV4dDogc3RyaW5nW10gPSBbXVxuICAgICAgbGV0IG5vZGUgPSB3YWxrZXIubmV4dE5vZGUoKVxuICAgICAgd2hpbGUgKG5vZGUpIHtcbiAgICAgICAgY29uc3QgdGV4dCA9IG5vZGUudGV4dENvbnRlbnQ/LnRyaW0oKSB8fCAnJ1xuICAgICAgICBjb25zdCBwYXJlbnQgPSBub2RlLnBhcmVudEVsZW1lbnRcbiAgICAgICAgaWYgKHRleHQgJiYgcGFyZW50ICYmIGdldENvbXB1dGVkU3R5bGUocGFyZW50KS52aXNpYmlsaXR5ICE9PSAnaGlkZGVuJykge1xuICAgICAgICAgIGNvbnN0IHJhbmdlID0gZG9jdW1lbnQuY3JlYXRlUmFuZ2UoKVxuICAgICAgICAgIHJhbmdlLnNlbGVjdE5vZGVDb250ZW50cyhub2RlKVxuICAgICAgICAgIGNvbnN0IHJlY3QgPSByYW5nZS5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKVxuICAgICAgICAgIGlmIChyZWN0LndpZHRoID4gMCAmJiByZWN0LmhlaWdodCA+IDAgJiYgKFxuICAgICAgICAgICAgcmVjdC5sZWZ0IDwgc2xpZGVSZWN0LmxlZnQgLSAxIHx8IHJlY3QudG9wIDwgc2xpZGVSZWN0LnRvcCAtIDEgfHxcbiAgICAgICAgICAgIHJlY3QucmlnaHQgPiBzbGlkZVJlY3QucmlnaHQgKyAxIHx8IHJlY3QuYm90dG9tID4gc2xpZGVSZWN0LmJvdHRvbSArIDFcbiAgICAgICAgICApKSBlc2NhcGVkVGV4dC5wdXNoKHRleHQpXG4gICAgICAgIH1cbiAgICAgICAgbm9kZSA9IHdhbGtlci5uZXh0Tm9kZSgpXG4gICAgICB9XG4gICAgICBjb25zdCBpbWFnZXMgPSBBcnJheS5mcm9tKHJvb3QucXVlcnlTZWxlY3RvckFsbDxIVE1MSW1hZ2VFbGVtZW50PignaW1nJykpLm1hcChpbWFnZSA9PiAoe1xuICAgICAgICBzb3VyY2U6IGltYWdlLmdldEF0dHJpYnV0ZSgnc3JjJykgfHwgJycsXG4gICAgICAgIG5hdHVyYWxXaWR0aDogaW1hZ2UubmF0dXJhbFdpZHRoLFxuICAgICAgICBuYXR1cmFsSGVpZ2h0OiBpbWFnZS5uYXR1cmFsSGVpZ2h0LFxuICAgICAgfSkpXG4gICAgICBjb25zdCBzdHlsZSA9IGdldENvbXB1dGVkU3R5bGUocm9vdClcbiAgICAgIHJldHVybiB7XG4gICAgICAgIGVzY2FwZWRUZXh0LFxuICAgICAgICBhY2NlbnQ6IHN0eWxlLmdldFByb3BlcnR5VmFsdWUoJy0taHVhc2h1LWFjY2VudCcpLnRyaW0oKSxcbiAgICAgICAgaW1hZ2VzLFxuICAgICAgICBzY3JvbGxXaWR0aDogcm9vdC5zY3JvbGxXaWR0aCxcbiAgICAgICAgc2Nyb2xsSGVpZ2h0OiByb290LnNjcm9sbEhlaWdodCxcbiAgICAgIH1cbiAgICB9KVxuXG4gICAgZXhwZWN0KGF1ZGl0LmVzY2FwZWRUZXh0LCBgJHtodWFzaHVTbGlkZXNbaW5kZXhdLm5hdGl2ZV9sYXlvdXR9IGhhcyB0ZXh0IG91dHNpZGUgdGhlIHNsaWRlYCkudG9FcXVhbChbXSlcbiAgICBleHBlY3QoYXVkaXQuc2Nyb2xsV2lkdGgpLnRvQmUoMTkyMClcbiAgICBleHBlY3QoYXVkaXQuc2Nyb2xsSGVpZ2h0KS50b0JlKDEwODApXG4gICAgZXhwZWN0KGF1ZGl0LmFjY2VudCkubm90LnRvQmUoJycpXG4gICAgYWNjZW50cy5hZGQoYXVkaXQuYWNjZW50KVxuICAgIGZvciAoY29uc3QgaW1hZ2Ugb2YgYXVkaXQuaW1hZ2VzKSB7XG4gICAgICBleHBlY3QoaW1hZ2Uuc291cmNlKS5ub3QudG9CZSgnJylcbiAgICAgIGV4cGVjdChpbWFnZS5uYXR1cmFsV2lkdGgpLnRvQmVHcmVhdGVyVGhhbigwKVxuICAgICAgZXhwZWN0KGltYWdlLm5hdHVyYWxIZWlnaHQpLnRvQmVHcmVhdGVyVGhhbigwKVxuICAgIH1cbiAgICBpZiAoaHVhc2h1U2xpZGVzW2luZGV4XS5uYXRpdmVfbGF5b3V0ID09PSAnY29yZTAxX2FjdGlvbnMnKSB7XG4gICAgICBjb25zdCBzdW1tYXJ5Q29udHJhc3QgPSBhd2FpdCBzbGlkZS5ldmFsdWF0ZSgocm9vdCkgPT4ge1xuICAgICAgICBjb25zdCBwYXJzZVJnYiA9ICh2YWx1ZTogc3RyaW5nKSA9PiAodmFsdWUubWF0Y2goL1tcXGQuXSsvZykgfHwgW10pLnNsaWNlKDAsIDMpLm1hcChOdW1iZXIpXG4gICAgICAgIGNvbnN0IGx1bWluYW5jZSA9ICh2YWx1ZTogc3RyaW5nKSA9PiB7XG4gICAgICAgICAgY29uc3QgY2hhbm5lbHMgPSBwYXJzZVJnYih2YWx1ZSkubWFwKGNoYW5uZWwgPT4ge1xuICAgICAgICAgICAgY29uc3Qgbm9ybWFsaXplZCA9IGNoYW5uZWwgLyAyNTVcbiAgICAgICAgICAgIHJldHVybiBub3JtYWxpemVkIDw9IDAuMDM5MjggPyBub3JtYWxpemVkIC8gMTIuOTIgOiAoKG5vcm1hbGl6ZWQgKyAwLjA1NSkgLyAxLjA1NSkgKiogMi40XG4gICAgICAgICAgfSlcbiAgICAgICAgICByZXR1cm4gMC4yMTI2ICogY2hhbm5lbHNbMF0gKyAwLjcxNTIgKiBjaGFubmVsc1sxXSArIDAuMDcyMiAqIGNoYW5uZWxzWzJdXG4gICAgICAgIH1cbiAgICAgICAgY29uc3QgZm9yZWdyb3VuZCA9IGdldENvbXB1dGVkU3R5bGUocm9vdC5xdWVyeVNlbGVjdG9yKCcuY29yZTAxLWFjdGlvbnMtaGVhZGluZyBwJykgYXMgRWxlbWVudCkuY29sb3JcbiAgICAgICAgY29uc3QgYmFja2dyb3VuZCA9IGdldENvbXB1dGVkU3R5bGUocm9vdC5xdWVyeVNlbGVjdG9yKCcuY29yZTAxLWFjdGlvbnMnKSBhcyBFbGVtZW50KS5iYWNrZ3JvdW5kQ29sb3JcbiAgICAgICAgY29uc3QgbGlnaHQgPSBNYXRoLm1heChsdW1pbmFuY2UoZm9yZWdyb3VuZCksIGx1bWluYW5jZShiYWNrZ3JvdW5kKSlcbiAgICAgICAgY29uc3QgZGFyayA9IE1hdGgubWluKGx1bWluYW5jZShmb3JlZ3JvdW5kKSwgbHVtaW5hbmNlKGJhY2tncm91bmQpKVxuICAgICAgICByZXR1cm4gKGxpZ2h0ICsgMC4wNSkgLyAoZGFyayArIDAuMDUpXG4gICAgICB9KVxuICAgICAgZXhwZWN0KHN1bW1hcnlDb250cmFzdCkudG9CZUdyZWF0ZXJUaGFuT3JFcXVhbCg0LjUpXG4gICAgfVxuICAgIGF3YWl0IHNsaWRlLnNjcmVlbnNob3QoeyBwYXRoOiB0ZXN0SW5mby5vdXRwdXRQYXRoKGBodWFzaHUtJHtTdHJpbmcoaW5kZXggKyAxKS5wYWRTdGFydCgyLCAnMCcpfS0ke2h1YXNodVNsaWRlc1tpbmRleF0ubmF0aXZlX2xheW91dH0ucG5nYCkgfSlcbiAgfVxuXG4gIGV4cGVjdChhY2NlbnRzLnNpemUpLnRvQmUodmlzdWFsU3lzdGVtcy5sZW5ndGgpXG4gIGNvbnN0IG92ZXJmbG93ID0gYXdhaXQgcGFnZS5ldmFsdWF0ZSgoKSA9PiAoe1xuICAgIHdpZHRoOiBkb2N1bWVudC5kb2N1bWVudEVsZW1lbnQuc2Nyb2xsV2lkdGggLSB3aW5kb3cuaW5uZXJXaWR0aCxcbiAgICBoZWlnaHQ6IGRvY3VtZW50LmRvY3VtZW50RWxlbWVudC5zY3JvbGxIZWlnaHQgLSB3aW5kb3cuaW5uZXJIZWlnaHQsXG4gIH0pKVxuICBleHBlY3Qob3ZlcmZsb3cud2lkdGgpLnRvQmVMZXNzVGhhbk9yRXF1YWwoMSlcbiAgZXhwZWN0KG92ZXJmbG93LmhlaWdodCkudG9CZUxlc3NUaGFuT3JFcXVhbCgxKVxufSlcblxudGVzdCgnSHVhc2h1IHdvcmtzcGFjZSBleHBvcnRzIGEgdmFsaWQgZWRpdGFibGUgMTMtc2xpZGUgUFBUWCB0aHJvdWdoIHRoZSB0YXNrIGZsb3cnLCBhc3luYyAoeyBwYWdlIH0sIHRlc3RJbmZvKSA9PiB7XG4gIHRlc3Quc2V0VGltZW91dCgxODBfMDAwKVxuICBsZXQgdXBsb2FkZWRQcHR4OiBCdWZmZXIgfCB1bmRlZmluZWRcbiAgYXdhaXQgcGFnZS5zZXRWaWV3cG9ydFNpemUoeyB3aWR0aDogMTkyMCwgaGVpZ2h0OiAxMDgwIH0pXG4gIGF3YWl0IG1vY2tIdWFzaHVQcm9qZWN0KHBhZ2UsIChyZXF1ZXN0KSA9PiB7IHVwbG9hZGVkUHB0eCA9IGV4dHJhY3RQcHR4RnJvbU11bHRpcGFydChyZXF1ZXN0KSB9KVxuICBhd2FpdCBwYWdlLmdvdG8oYC9wcm9qZWN0LyR7aHVhc2h1UHJvamVjdElkfS9wcmV2aWV3YClcblxuICBhd2FpdCBleHBlY3QocGFnZS5sb2NhdG9yKCdtYWluIC5uYXRpdmUtc2xpZGUnKSkudG9IYXZlQXR0cmlidXRlKCdkYXRhLW5hdGl2ZS1sYXlvdXQtcmVhZHknLCAndHJ1ZScpXG4gIGF3YWl0IHBhZ2UuZ2V0QnlSb2xlKCdidXR0b24nLCB7IG5hbWU6ICflr7zlh7pQUFRYJyB9KS5jbGljaygpXG4gIGF3YWl0IGV4cGVjdC5wb2xsKCgpID0+IHVwbG9hZGVkUHB0eD8ubGVuZ3RoIHx8IDAsIHsgdGltZW91dDogMTUwXzAwMCB9KS50b0JlR3JlYXRlclRoYW4oMTBfMDAwKVxuXG4gIGNvbnN0IG91dHB1dFBhdGggPSB0ZXN0SW5mby5vdXRwdXRQYXRoKCdodWFzaHUtZWRpdGFibGUtMTMtc2xpZGVzLnBwdHgnKVxuICB3cml0ZUZpbGVTeW5jKG91dHB1dFBhdGgsIHVwbG9hZGVkUHB0eCEpXG4gIGNvbnN0IGFyY2hpdmUgPSBhd2FpdCBKU1ppcC5sb2FkQXN5bmModXBsb2FkZWRQcHR4ISlcbiAgY29uc3Qgc2xpZGVGaWxlcyA9IE9iamVjdC5rZXlzKGFyY2hpdmUuZmlsZXMpLmZpbHRlcihuYW1lID0+IC9ecHB0XFwvc2xpZGVzXFwvc2xpZGVcXGQrXFwueG1sJC8udGVzdChuYW1lKSlcbiAgZXhwZWN0KHNsaWRlRmlsZXMpLnRvSGF2ZUxlbmd0aChodWFzaHVTbGlkZXMubGVuZ3RoKVxuICBleHBlY3QoYXJjaGl2ZS5maWxlKCdbQ29udGVudF9UeXBlc10ueG1sJykpLm5vdC50b0JlTnVsbCgpXG4gIGV4cGVjdChhcmNoaXZlLmZpbGUoJ3BwdC9wcmVzZW50YXRpb24ueG1sJykpLm5vdC50b0JlTnVsbCgpXG4gIGV4cGVjdChhcmNoaXZlLmZpbGUoJ3BwdC9fcmVscy9wcmVzZW50YXRpb24ueG1sLnJlbHMnKSkubm90LnRvQmVOdWxsKClcblxuICBjb25zdCBzbGlkZVhtbCA9IGF3YWl0IFByb21pc2UuYWxsKHNsaWRlRmlsZXMubWFwKG5hbWUgPT4gYXJjaGl2ZS5maWxlKG5hbWUpIS5hc3luYygnc3RyaW5nJykpKVxuICBjb25zdCBhbGxTbGlkZVhtbCA9IHNsaWRlWG1sLmpvaW4oJ1xcbicpXG4gIGNvbnN0IGVkaXRhYmxlVGV4dCA9IHNsaWRlWG1sLmZsYXRNYXAoeG1sID0+IEFycmF5LmZyb20oeG1sLm1hdGNoQWxsKC88YTp0PihbXFxzXFxTXSo/KTxcXC9hOnQ+L2cpLCBtYXRjaCA9PiBtYXRjaFsxXSkpLmpvaW4oJycpXG4gIGV4cGVjdChlZGl0YWJsZVRleHQpLnRvQ29udGFpbign5LuO5LiA5qyh5oCn5Lqk5LuY6L2s5ZCR5oyB57ut57uP6JCl6IO95Yqb5bu66K6+JylcbiAgZXhwZWN0KGVkaXRhYmxlVGV4dCkudG9Db250YWluKCfop6PlhrPmlrnmoYjotJ/otKPkuronKVxuICBleHBlY3QoZWRpdGFibGVUZXh0KS5ub3QudG9Db250YWluKCdUaGUgcXVpY2sgYnJvd24gZm94IGp1bXBzIG92ZXIgdGhlIGxhenkgZG9nLicpXG4gIGV4cGVjdChlZGl0YWJsZVRleHQudG9Mb3dlckNhc2UoKSkubm90LnRvQ29udGFpbignbG9yZW0nKVxuICBleHBlY3QoYWxsU2xpZGVYbWwpLnRvQ29udGFpbigndHlwZWZhY2U9XCJOb3RvIFNhbnMgU0NcIicpXG4gIGV4cGVjdChhbGxTbGlkZVhtbCkudG9Db250YWluKCd0eXBlZmFjZT1cIk5vdG8gU2VyaWYgU0NcIicpXG4gIGV4cGVjdChzbGlkZVhtbC5ldmVyeSh4bWwgPT4geG1sLmluY2x1ZGVzKCc8cDpzbGQnKSkpLnRvQmUodHJ1ZSlcbiAgYXdhaXQgdGVzdEluZm8uYXR0YWNoKCdodWFzaHUtZWRpdGFibGUtcHB0eCcsIHsgcGF0aDogb3V0cHV0UGF0aCwgY29udGVudFR5cGU6ICdhcHBsaWNhdGlvbi92bmQub3BlbnhtbGZvcm1hdHMtb2ZmaWNlZG9jdW1lbnQucHJlc2VudGF0aW9ubWwucHJlc2VudGF0aW9uJyB9KVxufSlcbiJdLCJtYXBwaW5ncyI6IkFBQUEsU0FBU0EsTUFBTSxFQUFFQyxJQUFJLFFBQW1CLGtCQUFrQjtBQUMxRCxTQUFTQyxhQUFhLFFBQVEsU0FBUztBQUN2QyxPQUFPQyxLQUFLLE1BQU0sT0FBTztBQUV6QixNQUFNQyxTQUFTLEdBQUcsc0JBQXNCO0FBQ3hDLE1BQU1DLGNBQWMsR0FBRyxxQkFBcUI7QUFDNUMsTUFBTUMsZUFBZSxHQUFHLHNCQUFzQjtBQUU5QyxNQUFNQyxhQUFhLEdBQUcsQ0FBQyxXQUFXLEVBQUUsUUFBUSxFQUFFLE9BQU8sRUFBRSxVQUFVLEVBQUUsV0FBVyxFQUFFLFNBQVMsQ0FBVTtBQUVuRyxNQUFNQyxZQUFZLEdBQUcsQ0FDbkI7RUFBRUMsTUFBTSxFQUFFLGtCQUFrQjtFQUFFQyxLQUFLLEVBQUU7SUFBRUMsTUFBTSxFQUFFLFdBQVc7SUFBRUMsS0FBSyxFQUFFLGtCQUFrQjtJQUFFQyxPQUFPLEVBQUUseUNBQXlDO0lBQUVDLE1BQU0sRUFBRSxDQUFDLGNBQWMsRUFBRSxjQUFjLEVBQUUsY0FBYyxFQUFFLGFBQWE7RUFBRTtBQUFFLENBQUMsRUFDdE47RUFBRUwsTUFBTSxFQUFFLGlCQUFpQjtFQUFFQyxLQUFLLEVBQUU7SUFBRUUsS0FBSyxFQUFFLGNBQWM7SUFBRUMsT0FBTyxFQUFFLHdDQUF3QztJQUFFRSxPQUFPLEVBQUUsQ0FBQyxrQkFBa0IsRUFBRSxnQkFBZ0IsRUFBRSxlQUFlLEVBQUUsZUFBZTtFQUFFO0FBQUUsQ0FBQyxFQUNyTTtFQUFFTixNQUFNLEVBQUUsa0JBQWtCO0VBQUVDLEtBQUssRUFBRTtJQUFFQyxNQUFNLEVBQUUsV0FBVztJQUFFQyxLQUFLLEVBQUUsYUFBYTtJQUFFQyxPQUFPLEVBQUUsa0NBQWtDO0lBQUVHLEtBQUssRUFBRSxDQUFDLGFBQWEsRUFBRSxjQUFjLEVBQUUsYUFBYSxFQUFFLGNBQWM7RUFBRTtBQUFFLENBQUMsRUFDeE07RUFBRVAsTUFBTSxFQUFFLGFBQWE7RUFBRUMsS0FBSyxFQUFFO0lBQUVFLEtBQUssRUFBRSxlQUFlO0lBQUVDLE9BQU8sRUFBRSxxQ0FBcUM7SUFBRUksS0FBSyxFQUFFLENBQUMsZ0JBQWdCLEVBQUUsZ0JBQWdCLEVBQUUsZ0JBQWdCLEVBQUUsZUFBZTtFQUFFO0FBQUUsQ0FBQyxFQUM1TDtFQUFFUixNQUFNLEVBQUUsaUJBQWlCO0VBQUVDLEtBQUssRUFBRTtJQUFFQyxNQUFNLEVBQUUsV0FBVztJQUFFQyxLQUFLLEVBQUUsY0FBYztJQUFFTSxjQUFjLEVBQUUsMENBQTBDO0lBQUVDLE9BQU8sRUFBRSxDQUFDLFdBQVcsRUFBRSxZQUFZLEVBQUUsWUFBWSxFQUFFLFdBQVc7RUFBRTtBQUFFLENBQUMsRUFDak47RUFBRVYsTUFBTSxFQUFFLG9CQUFvQjtFQUFFQyxLQUFLLEVBQUU7SUFBRUMsTUFBTSxFQUFFLFdBQVc7SUFBRUMsS0FBSyxFQUFFLGFBQWE7SUFBRUMsT0FBTyxFQUFFLDRDQUE0QztJQUFFTyxPQUFPLEVBQUUsa0JBQWtCO0lBQUVDLEtBQUssRUFBRTtFQUEyQztBQUFFLENBQUMsRUFDN047RUFBRVosTUFBTSxFQUFFLGNBQWM7RUFBRUMsS0FBSyxFQUFFO0lBQUVDLE1BQU0sRUFBRSxXQUFXO0lBQUVXLEtBQUssRUFBRSx5Q0FBeUM7SUFBRUMsV0FBVyxFQUFFLFlBQVk7SUFBRVYsT0FBTyxFQUFFO0VBQWlDO0FBQUUsQ0FBQyxFQUNsTDtFQUFFSixNQUFNLEVBQUUsZ0JBQWdCO0VBQUVDLEtBQUssRUFBRTtJQUFFRSxLQUFLLEVBQUUsV0FBVztJQUFFQyxPQUFPLEVBQUUsb0NBQW9DO0lBQUVXLE9BQU8sRUFBRSxDQUFDLGFBQWEsRUFBRSxhQUFhLEVBQUUsYUFBYSxFQUFFLGNBQWMsRUFBRSxhQUFhO0VBQUU7QUFBRSxDQUFDLEVBQ2pNO0VBQUVmLE1BQU0sRUFBRSxlQUFlO0VBQUVDLEtBQUssRUFBRTtJQUFFRSxLQUFLLEVBQUUsYUFBYTtJQUFFYSxNQUFNLEVBQUUsV0FBVztJQUFFQyxNQUFNLEVBQUUsVUFBVTtJQUFFQyxLQUFLLEVBQUUsQ0FBQyxhQUFhLEVBQUUsYUFBYSxFQUFFLGFBQWEsRUFBRSxhQUFhO0VBQUU7QUFBRSxDQUFDLEVBQzFLO0VBQUVsQixNQUFNLEVBQUUsaUJBQWlCO0VBQUVDLEtBQUssRUFBRTtJQUFFRSxLQUFLLEVBQUUsWUFBWTtJQUFFZ0IsVUFBVSxFQUFFLENBQUMsZ0JBQWdCLEVBQUUsZ0JBQWdCLEVBQUUsZ0JBQWdCLEVBQUUsZ0JBQWdCLEVBQUUsa0JBQWtCLEVBQUUsa0JBQWtCO0VBQUU7QUFBRSxDQUFDLEVBQzNMO0VBQUVuQixNQUFNLEVBQUUscUJBQXFCO0VBQUVDLEtBQUssRUFBRTtJQUFFQyxNQUFNLEVBQUUsV0FBVztJQUFFQyxLQUFLLEVBQUUsY0FBYztJQUFFQyxPQUFPLEVBQUUsbUNBQW1DO0lBQUVnQixNQUFNLEVBQUUsQ0FBQyxVQUFVLEVBQUUsVUFBVSxFQUFFLFVBQVUsRUFBRSxVQUFVO0VBQUU7QUFBRSxDQUFDLEVBQ2hNO0VBQUVwQixNQUFNLEVBQUUsZ0JBQWdCO0VBQUVDLEtBQUssRUFBRTtJQUFFQyxNQUFNLEVBQUUsV0FBVztJQUFFbUIsSUFBSSxFQUFFLFNBQVM7SUFBRUMsSUFBSSxFQUFFLGtCQUFrQjtJQUFFbEIsT0FBTyxFQUFFLHVDQUF1QztJQUFFbUIsVUFBVSxFQUFFLENBQUMsTUFBTSxFQUFFLE1BQU0sRUFBRSxNQUFNLEVBQUUsTUFBTSxDQUFDO0lBQUVYLEtBQUssRUFBRTtFQUEyQztBQUFFLENBQUMsRUFDMVA7RUFBRVosTUFBTSxFQUFFLGVBQWU7RUFBRUMsS0FBSyxFQUFFO0lBQUVDLE1BQU0sRUFBRSxXQUFXO0lBQUVDLEtBQUssRUFBRSxZQUFZO0lBQUVDLE9BQU8sRUFBRSxrQ0FBa0M7SUFBRW9CLE1BQU0sRUFBRSxDQUFDLFdBQVcsRUFBRSxXQUFXLEVBQUUsV0FBVyxFQUFFLFdBQVcsRUFBRSxXQUFXO0VBQUU7QUFBRSxDQUFDLENBQ3pNLENBQUNDLEdBQUcsQ0FBQyxDQUFDQyxLQUFLLEVBQUVDLEtBQUssTUFBTTtFQUN2QkMsRUFBRSxFQUFFLGVBQWVELEtBQUssR0FBRyxDQUFDLEVBQUU7RUFDOUJFLE9BQU8sRUFBRSxlQUFlRixLQUFLLEdBQUcsQ0FBQyxFQUFFO0VBQ25DRyxXQUFXLEVBQUVILEtBQUs7RUFDbEJJLE1BQU0sRUFBRSxrQkFBa0I7RUFDMUJDLGVBQWUsRUFBRTtJQUFFN0IsS0FBSyxFQUFFOEIsTUFBTSxDQUFDUCxLQUFLLENBQUN6QixLQUFLLENBQUNFLEtBQUssSUFBSXVCLEtBQUssQ0FBQ3pCLEtBQUssQ0FBQ29CLElBQUksSUFBSUssS0FBSyxDQUFDekIsS0FBSyxDQUFDWSxLQUFLLElBQUksS0FBS2MsS0FBSyxHQUFHLENBQUMsSUFBSSxDQUFDO0lBQUV0QixNQUFNLEVBQUU7RUFBRyxDQUFDO0VBQ2hJNkIsYUFBYSxFQUFFUixLQUFLLENBQUMxQixNQUFNO0VBQzNCbUMsWUFBWSxFQUFFO0lBQ1osR0FBR1QsS0FBSyxDQUFDekIsS0FBSztJQUNkbUMsZUFBZSxFQUFFO01BQ2ZDLGFBQWEsRUFBRSxlQUFlO01BQzlCQyxTQUFTLEVBQUU7UUFBRUMsYUFBYSxFQUFFekMsYUFBYSxDQUFDNkIsS0FBSyxHQUFHN0IsYUFBYSxDQUFDMEMsTUFBTTtNQUFFLENBQUM7TUFDekVDLGNBQWMsRUFBRTtRQUFFVixNQUFNLEVBQUUsTUFBTTtRQUFFVyxLQUFLLEVBQUUsR0FBRztRQUFFQyxNQUFNLEVBQUU7TUFBRztJQUMzRDtFQUNGO0FBQ0YsQ0FBQyxDQUFDLENBQUM7QUFFSCxlQUFlQyxpQkFBaUJBLENBQzlCQyxJQUFVLEVBQ1ZDLGVBQXVFLEVBQ3ZFO0VBQ0EsTUFBTUQsSUFBSSxDQUFDRSxhQUFhLENBQUMsTUFBTUMsWUFBWSxDQUFDQyxPQUFPLENBQUMsa0JBQWtCLEVBQUUsTUFBTSxDQUFDLENBQUM7RUFDaEYsTUFBTUosSUFBSSxDQUFDSyxLQUFLLENBQUNDLEdBQUcsSUFBSSxJQUFJQyxHQUFHLENBQUNELEdBQUcsQ0FBQyxDQUFDRSxRQUFRLENBQUNDLFVBQVUsQ0FBQyxPQUFPLENBQUMsRUFBRSxNQUFPSixLQUFLLElBQUs7SUFDbEYsTUFBTUcsUUFBUSxHQUFHLElBQUlELEdBQUcsQ0FBQ0YsS0FBSyxDQUFDSyxPQUFPLENBQUMsQ0FBQyxDQUFDSixHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUNFLFFBQVE7SUFDeEQsSUFBSUEsUUFBUSxLQUFLLHdCQUF3QixFQUFFO01BQ3pDLE9BQU9ILEtBQUssQ0FBQ00sT0FBTyxDQUFDO1FBQUV6QixNQUFNLEVBQUUsR0FBRztRQUFFMEIsV0FBVyxFQUFFLGtCQUFrQjtRQUFFQyxJQUFJLEVBQUVDLElBQUksQ0FBQ0MsU0FBUyxDQUFDO1VBQUVDLE9BQU8sRUFBRSxJQUFJO1VBQUVDLElBQUksRUFBRTtZQUFFQyxPQUFPLEVBQUU7VUFBTTtRQUFFLENBQUM7TUFBRSxDQUFDLENBQUM7SUFDM0k7SUFDQSxJQUFJVixRQUFRLEtBQUssZUFBZSxFQUFFO01BQ2hDLE9BQU9ILEtBQUssQ0FBQ00sT0FBTyxDQUFDO1FBQUV6QixNQUFNLEVBQUUsR0FBRztRQUFFMEIsV0FBVyxFQUFFLGtCQUFrQjtRQUFFQyxJQUFJLEVBQUVDLElBQUksQ0FBQ0MsU0FBUyxDQUFDO1VBQUVDLE9BQU8sRUFBRSxJQUFJO1VBQUVDLElBQUksRUFBRTtZQUFFRSxlQUFlLEVBQUU7VUFBSztRQUFFLENBQUM7TUFBRSxDQUFDLENBQUM7SUFDbEo7SUFDQSxJQUFJWCxRQUFRLEtBQUssc0JBQXNCLEVBQUU7TUFDdkMsT0FBT0gsS0FBSyxDQUFDTSxPQUFPLENBQUM7UUFBRXpCLE1BQU0sRUFBRSxHQUFHO1FBQUUwQixXQUFXLEVBQUUsa0JBQWtCO1FBQUVDLElBQUksRUFBRUMsSUFBSSxDQUFDQyxTQUFTLENBQUM7VUFBRUMsT0FBTyxFQUFFLElBQUk7VUFBRUMsSUFBSSxFQUFFO1lBQUVHLFFBQVEsRUFBRTtVQUFLO1FBQUUsQ0FBQztNQUFFLENBQUMsQ0FBQztJQUMzSTtJQUNBLElBQUlaLFFBQVEsS0FBSyx5QkFBeUIxRCxTQUFTLEVBQUUsRUFBRTtNQUNyRCxPQUFPdUQsS0FBSyxDQUFDTSxPQUFPLENBQUM7UUFDbkJ6QixNQUFNLEVBQUUsR0FBRztRQUNYMEIsV0FBVyxFQUFFLGtCQUFrQjtRQUMvQkMsSUFBSSxFQUFFQyxJQUFJLENBQUNDLFNBQVMsQ0FBQztVQUNuQkMsT0FBTyxFQUFFLElBQUk7VUFDYkMsSUFBSSxFQUFFO1lBQ0pJLFVBQVUsRUFBRXZFLFNBQVM7WUFDckJ3RSxjQUFjLEVBQUUsS0FBSztZQUNyQkMsa0JBQWtCLEVBQUUsQ0FBQztZQUNyQkMsS0FBSyxFQUFFO2NBQ0x6QyxFQUFFLEVBQUUsd0JBQXdCO2NBQzVCc0MsVUFBVSxFQUFFdkUsU0FBUztjQUNyQjJFLFFBQVEsRUFBRSxDQUFDO2NBQ1h2QyxNQUFNLEVBQUUsV0FBVztjQUNuQndDLFlBQVksRUFBRSx1QkFBdUI7Y0FDckNDLFFBQVEsRUFBRTtnQkFBRUMsS0FBSyxFQUFFO2tCQUFFQyxLQUFLLEVBQUU7Z0JBQVksQ0FBQztnQkFBRUMsUUFBUSxFQUFFO2NBQUc7WUFDMUQsQ0FBQztZQUNEQyxVQUFVLEVBQUUsQ0FDVjtjQUFFaEQsRUFBRSxFQUFFLHNCQUFzQjtjQUFFc0MsVUFBVSxFQUFFdkUsU0FBUztjQUFFa0YsSUFBSSxFQUFFLEtBQUs7Y0FBRUMsS0FBSyxFQUFFLE9BQU87Y0FBRVIsUUFBUSxFQUFFLENBQUM7Y0FBRVMsV0FBVyxFQUFFLE9BQU87Y0FBRUMsUUFBUSxFQUFFLENBQUM7WUFBRSxDQUFDLEVBQ25JO2NBQUVwRCxFQUFFLEVBQUUsd0JBQXdCO2NBQUVzQyxVQUFVLEVBQUV2RSxTQUFTO2NBQUVrRixJQUFJLEVBQUUsT0FBTztjQUFFQyxLQUFLLEVBQUUsT0FBTztjQUFFUixRQUFRLEVBQUUsQ0FBQztjQUFFUyxXQUFXLEVBQUUsS0FBSztjQUFFQyxRQUFRLEVBQUUsQ0FBQztZQUFFLENBQUMsRUFDckk7Y0FBRXBELEVBQUUsRUFBRSwwQkFBMEI7Y0FBRXNDLFVBQVUsRUFBRXZFLFNBQVM7Y0FBRWtGLElBQUksRUFBRSxTQUFTO2NBQUVDLEtBQUssRUFBRSxlQUFlO2NBQUVSLFFBQVEsRUFBRSxDQUFDO2NBQUVTLFdBQVcsRUFBRSxRQUFRO2NBQUVDLFFBQVEsRUFBRSxDQUFDO1lBQUUsQ0FBQztVQUV4SjtRQUNGLENBQUM7TUFDSCxDQUFDLENBQUM7SUFDSjtJQUNBLElBQUkzQixRQUFRLEtBQUssaUJBQWlCMUQsU0FBUyxhQUFhLEVBQUU7TUFDeEQsT0FBT3VELEtBQUssQ0FBQ00sT0FBTyxDQUFDO1FBQ25CekIsTUFBTSxFQUFFLEdBQUc7UUFDWDBCLFdBQVcsRUFBRSxrQkFBa0I7UUFDL0JDLElBQUksRUFBRUMsSUFBSSxDQUFDQyxTQUFTLENBQUM7VUFDbkJDLE9BQU8sRUFBRSxJQUFJO1VBQ2JDLElBQUksRUFBRTtZQUNKbUIsS0FBSyxFQUFFLENBQUMsUUFBUSxFQUFFLFFBQVEsQ0FBQyxDQUFDeEQsR0FBRyxDQUFDLENBQUN5RCxNQUFNLEVBQUV2RCxLQUFLLE1BQU07Y0FDbERFLE9BQU8sRUFBRXFELE1BQU07Y0FDZnBELFdBQVcsRUFBRUgsS0FBSztjQUNsQndELGtCQUFrQixFQUFFLGFBQWF4RCxLQUFLLEdBQUcsQ0FBQyxFQUFFO2NBQzVDMkMsUUFBUSxFQUFFLENBQUM7Y0FDWGMsVUFBVSxFQUFFLEVBQUU7Y0FDZEMsaUJBQWlCLEVBQUUsQ0FBQztjQUNwQkMsZUFBZSxFQUFFO1lBQ25CLENBQUMsQ0FBQyxDQUFDO1lBQ0hDLFdBQVcsRUFBRSxDQUFDO1lBQ2RDLGVBQWUsRUFBRSxDQUFDO1lBQ2xCQyxhQUFhLEVBQUUsQ0FBQztZQUNoQkMsZUFBZSxFQUFFO1VBQ25CO1FBQ0YsQ0FBQztNQUNILENBQUMsQ0FBQztJQUNKO0lBQ0EsSUFBSXJDLFFBQVEsS0FBSyxpQkFBaUIxRCxTQUFTLHlCQUF5QixFQUFFO01BQ3BFLE9BQU91RCxLQUFLLENBQUNNLE9BQU8sQ0FBQztRQUNuQnpCLE1BQU0sRUFBRSxHQUFHO1FBQ1gwQixXQUFXLEVBQUUsa0JBQWtCO1FBQy9CQyxJQUFJLEVBQUVDLElBQUksQ0FBQ0MsU0FBUyxDQUFDO1VBQUVDLE9BQU8sRUFBRSxJQUFJO1VBQUVDLElBQUksRUFBRTtZQUFFNkIsVUFBVSxFQUFFLElBQUk7WUFBRUMsTUFBTSxFQUFFLEVBQUU7WUFBRUMsUUFBUSxFQUFFO1VBQUc7UUFBRSxDQUFDO01BQzlGLENBQUMsQ0FBQztJQUNKO0lBQ0EsSUFBSXhDLFFBQVEsS0FBSyx5QkFBeUIxRCxTQUFTLGtDQUFrQyxFQUFFO01BQ3JGbUQsZUFBZSxhQUFmQSxlQUFlLGVBQWZBLGVBQWUsQ0FBR0ksS0FBSyxDQUFDSyxPQUFPLENBQUMsQ0FBQyxDQUFDO01BQ2xDLE9BQU9MLEtBQUssQ0FBQ00sT0FBTyxDQUFDO1FBQ25CekIsTUFBTSxFQUFFLEdBQUc7UUFDWDBCLFdBQVcsRUFBRSxrQkFBa0I7UUFDL0JDLElBQUksRUFBRUMsSUFBSSxDQUFDQyxTQUFTLENBQUM7VUFBRUMsT0FBTyxFQUFFLElBQUk7VUFBRUMsSUFBSSxFQUFFO1lBQUVnQyxRQUFRLEVBQUU7VUFBSztRQUFFLENBQUM7TUFDbEUsQ0FBQyxDQUFDO0lBQ0o7SUFDQSxJQUFJekMsUUFBUSxLQUFLLGlCQUFpQjFELFNBQVMsc0JBQXNCLEVBQUU7TUFDakUsT0FBT3VELEtBQUssQ0FBQ00sT0FBTyxDQUFDO1FBQ25CekIsTUFBTSxFQUFFLEdBQUc7UUFDWDBCLFdBQVcsRUFBRSxrQkFBa0I7UUFDL0JDLElBQUksRUFBRUMsSUFBSSxDQUFDQyxTQUFTLENBQUM7VUFBRUMsT0FBTyxFQUFFLElBQUk7VUFBRUMsSUFBSSxFQUFFO1lBQUVpQyxPQUFPLEVBQUU7VUFBb0I7UUFBRSxDQUFDO01BQ2hGLENBQUMsQ0FBQztJQUNKO0lBQ0EsSUFBSTFDLFFBQVEsS0FBSyxpQkFBaUIxRCxTQUFTLDBCQUEwQixFQUFFO01BQ3JFLE9BQU91RCxLQUFLLENBQUNNLE9BQU8sQ0FBQztRQUNuQnpCLE1BQU0sRUFBRSxHQUFHO1FBQ1gwQixXQUFXLEVBQUUsa0JBQWtCO1FBQy9CQyxJQUFJLEVBQUVDLElBQUksQ0FBQ0MsU0FBUyxDQUFDO1VBQ25CQyxPQUFPLEVBQUUsSUFBSTtVQUNiQyxJQUFJLEVBQUU7WUFDSmxDLEVBQUUsRUFBRSxtQkFBbUI7WUFDdkJHLE1BQU0sRUFBRSxXQUFXO1lBQ25CaUUsUUFBUSxFQUFFO2NBQUVDLEtBQUssRUFBRSxDQUFDO2NBQUVDLFNBQVMsRUFBRSxDQUFDO2NBQUVDLE9BQU8sRUFBRTtZQUFJO1VBQ25EO1FBQ0YsQ0FBQztNQUNILENBQUMsQ0FBQztJQUNKO0lBQ0EsSUFBSTlDLFFBQVEsS0FBSyxpQkFBaUIxRCxTQUFTLEVBQUUsRUFBRTtNQUM3QyxPQUFPdUQsS0FBSyxDQUFDTSxPQUFPLENBQUM7UUFDbkJ6QixNQUFNLEVBQUUsR0FBRztRQUNYMEIsV0FBVyxFQUFFLGtCQUFrQjtRQUMvQkMsSUFBSSxFQUFFQyxJQUFJLENBQUNDLFNBQVMsQ0FBQztVQUNuQkMsT0FBTyxFQUFFLElBQUk7VUFDYkMsSUFBSSxFQUFFO1lBQ0psQyxFQUFFLEVBQUVqQyxTQUFTO1lBQ2J1RSxVQUFVLEVBQUV2RSxTQUFTO1lBQ3JCeUcsV0FBVyxFQUFFLFdBQVc7WUFDeEJDLFdBQVcsRUFBRSxRQUFRO1lBQ3JCdEUsTUFBTSxFQUFFLHVCQUF1QjtZQUMvQmtELEtBQUssRUFBRSxDQUNMO2NBQUVyRCxFQUFFLEVBQUUsUUFBUTtjQUFFQyxPQUFPLEVBQUUsUUFBUTtjQUFFQyxXQUFXLEVBQUUsQ0FBQztjQUFFQyxNQUFNLEVBQUUsa0JBQWtCO2NBQUVDLGVBQWUsRUFBRTtnQkFBRTdCLEtBQUssRUFBRSxRQUFRO2dCQUFFRSxNQUFNLEVBQUU7Y0FBRyxDQUFDO2NBQUU2QixhQUFhLEVBQUUsY0FBYztjQUFFQyxZQUFZLEVBQUU7Z0JBQUVqQyxNQUFNLEVBQUUsV0FBVztnQkFBRUMsS0FBSyxFQUFFLFFBQVE7Z0JBQUVtRyxRQUFRLEVBQUUsVUFBVTtnQkFBRUMsV0FBVyxFQUFFO2tCQUFFQyxZQUFZLEVBQUU7Z0JBQU87Y0FBRTtZQUFFLENBQUMsRUFDclI7Y0FBRTVFLEVBQUUsRUFBRSxRQUFRO2NBQUVDLE9BQU8sRUFBRSxRQUFRO2NBQUVDLFdBQVcsRUFBRSxDQUFDO2NBQUVDLE1BQU0sRUFBRSxrQkFBa0I7Y0FBRUMsZUFBZSxFQUFFO2dCQUFFN0IsS0FBSyxFQUFFLEtBQUs7Z0JBQUVFLE1BQU0sRUFBRTtjQUFHLENBQUM7Y0FBRTZCLGFBQWEsRUFBRSxZQUFZO2NBQUVDLFlBQVksRUFBRTtnQkFBRWhDLEtBQUssRUFBRSxLQUFLO2dCQUFFbUcsUUFBUSxFQUFFO2NBQVU7WUFBRSxDQUFDO1VBRXBOO1FBQ0YsQ0FBQztNQUNILENBQUMsQ0FBQztJQUNKO0lBQ0EsT0FBT3BELEtBQUssQ0FBQ00sT0FBTyxDQUFDO01BQUV6QixNQUFNLEVBQUUsR0FBRztNQUFFMEIsV0FBVyxFQUFFLGtCQUFrQjtNQUFFQyxJQUFJLEVBQUVDLElBQUksQ0FBQ0MsU0FBUyxDQUFDO1FBQUVDLE9BQU8sRUFBRSxJQUFJO1FBQUVDLElBQUksRUFBRSxDQUFDO01BQUUsQ0FBQztJQUFFLENBQUMsQ0FBQztFQUMzSCxDQUFDLENBQUM7QUFDSjtBQUVBLFNBQVMyQyw0QkFBNEJBLENBQUNsRCxPQUEyQyxFQUFFO0VBQUEsSUFBQW1ELHFCQUFBO0VBQ2pGLE1BQU1oRCxJQUFJLEdBQUdILE9BQU8sQ0FBQ29ELGNBQWMsQ0FBQyxDQUFDO0VBQ3JDLE1BQU1DLFFBQVEsSUFBQUYscUJBQUEsR0FBR25ELE9BQU8sQ0FBQ3NELE9BQU8sQ0FBQyxDQUFDLENBQUMsY0FBYyxDQUFDLGNBQUFILHFCQUFBLGdCQUFBQSxxQkFBQSxHQUFqQ0EscUJBQUEsQ0FBbUNJLEtBQUssQ0FBQyxtQkFBbUIsQ0FBQyxjQUFBSixxQkFBQSx1QkFBN0RBLHFCQUFBLENBQWdFLENBQUMsQ0FBQztFQUNuRixJQUFJLENBQUNoRCxJQUFJLElBQUksQ0FBQ2tELFFBQVEsRUFBRSxNQUFNLElBQUlHLEtBQUssQ0FBQyxrQ0FBa0MsQ0FBQztFQUMzRSxNQUFNQyxJQUFJLEdBQUd0RCxJQUFJLENBQUN1RCxRQUFRLENBQUMsUUFBUSxDQUFDO0VBQ3BDLE1BQU1DLFNBQVMsR0FBSTdGLElBQVksSUFBSztJQUNsQyxNQUFNeUYsS0FBSyxHQUFHLElBQUlLLE1BQU0sQ0FBQyxTQUFTOUYsSUFBSSwyQkFBMkIsQ0FBQyxDQUFDK0YsSUFBSSxDQUFDSixJQUFJLENBQUM7SUFDN0UsSUFBSSxDQUFDRixLQUFLLEVBQUUsTUFBTSxJQUFJQyxLQUFLLENBQUMsdUJBQXVCMUYsSUFBSSxFQUFFLENBQUM7SUFDMUQsT0FBT3NDLElBQUksQ0FBQzBELEtBQUssQ0FBQ1AsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDO0VBQzdCLENBQUM7RUFDRCxNQUFNUSxNQUFNLEdBQUcsZUFBZTtFQUM5QixNQUFNQyxZQUFZLEdBQUdDLE1BQU0sQ0FBQ0MsSUFBSSxDQUFDLENBQUMsSUFBSSxFQUFFLElBQUksRUFBRSxJQUFJLEVBQUUsSUFBSSxFQUFFLElBQUksRUFBRSxJQUFJLEVBQUUsSUFBSSxFQUFFLElBQUksQ0FBQyxDQUFDO0VBQ2xGLE1BQU1DLFVBQVUsR0FBR1YsSUFBSSxDQUFDVyxLQUFLLENBQUNMLE1BQU0sQ0FBQyxDQUFDOUUsTUFBTSxHQUFHLENBQUM7RUFDaEQsTUFBTW9GLElBQWMsR0FBRyxFQUFFO0VBQ3pCLElBQUlDLE1BQU0sR0FBRyxDQUFDO0VBQ2QsT0FBT0QsSUFBSSxDQUFDcEYsTUFBTSxHQUFHa0YsVUFBVSxFQUFFO0lBQy9CLE1BQU1JLFFBQVEsR0FBR3BFLElBQUksQ0FBQ3FFLE9BQU8sQ0FBQ1IsWUFBWSxFQUFFTSxNQUFNLENBQUM7SUFDbkQsTUFBTUcsTUFBTSxHQUFHdEUsSUFBSSxDQUFDcUUsT0FBTyxDQUFDUCxNQUFNLENBQUNDLElBQUksQ0FBQyxTQUFTYixRQUFRLEVBQUUsQ0FBQyxFQUFFa0IsUUFBUSxDQUFDO0lBQ3ZFLElBQUlBLFFBQVEsR0FBRyxDQUFDLElBQUlFLE1BQU0sSUFBSUYsUUFBUSxFQUFFLE1BQU0sSUFBSWYsS0FBSyxDQUFDLDRCQUE0QixDQUFDO0lBQ3JGYSxJQUFJLENBQUNLLElBQUksQ0FBQ3ZFLElBQUksQ0FBQ3dFLFFBQVEsQ0FBQ0osUUFBUSxFQUFFRSxNQUFNLENBQUMsQ0FBQztJQUMxQ0gsTUFBTSxHQUFHRyxNQUFNO0VBQ2pCO0VBQ0EsT0FBTztJQUNMRyxPQUFPLEVBQUVqQixTQUFTLENBQUMsVUFBVSxDQUFhO0lBQzFDa0IsV0FBVyxFQUFFbEIsU0FBUyxDQUFDLGNBQWMsQ0FBYTtJQUNsRFEsVUFBVTtJQUNWRTtFQUNGLENBQUM7QUFDSDtBQUVBLGVBQWVTLGdCQUFnQkEsQ0FBQ3hGLElBQVUsRUFBRTtFQUMxQyxNQUFNQSxJQUFJLENBQUNFLGFBQWEsQ0FBQyxNQUFNQyxZQUFZLENBQUNDLE9BQU8sQ0FBQyxrQkFBa0IsRUFBRSxNQUFNLENBQUMsQ0FBQztFQUNoRixNQUFNSixJQUFJLENBQUNLLEtBQUssQ0FBQ0MsR0FBRyxJQUFJLElBQUlDLEdBQUcsQ0FBQ0QsR0FBRyxDQUFDLENBQUNFLFFBQVEsQ0FBQ0MsVUFBVSxDQUFDLE9BQU8sQ0FBQyxFQUFFLE1BQU9KLEtBQUssSUFBSztJQUNsRixNQUFNRyxRQUFRLEdBQUcsSUFBSUQsR0FBRyxDQUFDRixLQUFLLENBQUNLLE9BQU8sQ0FBQyxDQUFDLENBQUNKLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQ0UsUUFBUTtJQUN4RCxJQUFJQSxRQUFRLEtBQUssd0JBQXdCLEVBQUUsT0FBT0gsS0FBSyxDQUFDTSxPQUFPLENBQUM7TUFBRXpCLE1BQU0sRUFBRSxHQUFHO01BQUUwQixXQUFXLEVBQUUsa0JBQWtCO01BQUVDLElBQUksRUFBRUMsSUFBSSxDQUFDQyxTQUFTLENBQUM7UUFBRUMsT0FBTyxFQUFFLElBQUk7UUFBRUMsSUFBSSxFQUFFO1VBQUVDLE9BQU8sRUFBRTtRQUFNO01BQUUsQ0FBQztJQUFFLENBQUMsQ0FBQztJQUNwTCxJQUFJVixRQUFRLEtBQUssZUFBZSxFQUFFLE9BQU9ILEtBQUssQ0FBQ00sT0FBTyxDQUFDO01BQUV6QixNQUFNLEVBQUUsR0FBRztNQUFFMEIsV0FBVyxFQUFFLGtCQUFrQjtNQUFFQyxJQUFJLEVBQUVDLElBQUksQ0FBQ0MsU0FBUyxDQUFDO1FBQUVDLE9BQU8sRUFBRSxJQUFJO1FBQUVDLElBQUksRUFBRTtVQUFFRSxlQUFlLEVBQUU7UUFBSztNQUFFLENBQUM7SUFBRSxDQUFDLENBQUM7SUFDbEwsSUFBSVgsUUFBUSxLQUFLLHNCQUFzQixFQUFFLE9BQU9ILEtBQUssQ0FBQ00sT0FBTyxDQUFDO01BQUV6QixNQUFNLEVBQUUsR0FBRztNQUFFMEIsV0FBVyxFQUFFLGtCQUFrQjtNQUFFQyxJQUFJLEVBQUVDLElBQUksQ0FBQ0MsU0FBUyxDQUFDO1FBQUVDLE9BQU8sRUFBRSxJQUFJO1FBQUVDLElBQUksRUFBRTtVQUFFRyxRQUFRLEVBQUU7UUFBSztNQUFFLENBQUM7SUFBRSxDQUFDLENBQUM7SUFDbEwsSUFBSVosUUFBUSxLQUFLLGlCQUFpQnpELGNBQWMsRUFBRSxFQUFFO01BQ2xELE9BQU9zRCxLQUFLLENBQUNNLE9BQU8sQ0FBQztRQUNuQnpCLE1BQU0sRUFBRSxHQUFHO1FBQ1gwQixXQUFXLEVBQUUsa0JBQWtCO1FBQy9CQyxJQUFJLEVBQUVDLElBQUksQ0FBQ0MsU0FBUyxDQUFDO1VBQ25CQyxPQUFPLEVBQUUsSUFBSTtVQUNiQyxJQUFJLEVBQUU7WUFDSmxDLEVBQUUsRUFBRWhDLGNBQWM7WUFDbEJzRSxVQUFVLEVBQUV0RSxjQUFjO1lBQzFCd0csV0FBVyxFQUFFLGNBQWM7WUFDM0JDLFdBQVcsRUFBRSxRQUFRO1lBQ3JCaUMsWUFBWSxFQUFFLFNBQVM7WUFDdkJ2RyxNQUFNLEVBQUUsdUJBQXVCO1lBQy9Ca0QsS0FBSyxFQUFFLENBQ0w7Y0FDRXJELEVBQUUsRUFBRSxjQUFjO2NBQUVDLE9BQU8sRUFBRSxjQUFjO2NBQUVDLFdBQVcsRUFBRSxDQUFDO2NBQUVDLE1BQU0sRUFBRSxrQkFBa0I7Y0FDdkZDLGVBQWUsRUFBRTtnQkFBRTdCLEtBQUssRUFBRSxTQUFTO2dCQUFFRSxNQUFNLEVBQUU7Y0FBRyxDQUFDO2NBQUU2QixhQUFhLEVBQUUsaUJBQWlCO2NBQ25GQyxZQUFZLEVBQUU7Z0JBQ1poQyxLQUFLLEVBQUUsU0FBUztnQkFDaEJvSSxNQUFNLEVBQUUsQ0FDTjtrQkFBRUMsTUFBTSxFQUFFLElBQUk7a0JBQUVDLElBQUksRUFBRSxJQUFJO2tCQUFFQyxPQUFPLEVBQUUsTUFBTTtrQkFBRXJJLE1BQU0sRUFBRSxDQUFDLE9BQU8sRUFBRSxPQUFPLENBQUM7a0JBQUVzSSxPQUFPLEVBQUU7Z0JBQUssQ0FBQyxFQUN4RjtrQkFBRUgsTUFBTSxFQUFFLElBQUk7a0JBQUVDLElBQUksRUFBRSxJQUFJO2tCQUFFQyxPQUFPLEVBQUUsTUFBTTtrQkFBRXJJLE1BQU0sRUFBRSxDQUFDLE1BQU0sRUFBRSxNQUFNLENBQUM7a0JBQUVzSSxPQUFPLEVBQUU7Z0JBQUssQ0FBQyxFQUN0RjtrQkFBRUgsTUFBTSxFQUFFLElBQUk7a0JBQUVDLElBQUksRUFBRSxJQUFJO2tCQUFFQyxPQUFPLEVBQUUsTUFBTTtrQkFBRXJJLE1BQU0sRUFBRSxDQUFDLE9BQU8sRUFBRSxNQUFNLENBQUM7a0JBQUVzSSxPQUFPLEVBQUU7Z0JBQUssQ0FBQztjQUUzRjtZQUNGLENBQUMsRUFDRDtjQUNFL0csRUFBRSxFQUFFLFdBQVc7Y0FBRUMsT0FBTyxFQUFFLFdBQVc7Y0FBRUMsV0FBVyxFQUFFLENBQUM7Y0FBRUMsTUFBTSxFQUFFLGtCQUFrQjtjQUNqRkMsZUFBZSxFQUFFO2dCQUFFN0IsS0FBSyxFQUFFLFFBQVE7Z0JBQUVFLE1BQU0sRUFBRTtjQUFHLENBQUM7Y0FBRTZCLGFBQWEsRUFBRSxpQkFBaUI7Y0FDbEZDLFlBQVksRUFBRTtnQkFBRXlHLFFBQVEsRUFBRSxJQUFJO2dCQUFFQyxXQUFXLEVBQUUsTUFBTTtnQkFBRUMsU0FBUyxFQUFFLElBQUk7Z0JBQUVDLFFBQVEsRUFBRTtjQUFtQjtZQUNyRyxDQUFDLEVBQ0Q7Y0FDRW5ILEVBQUUsRUFBRSxjQUFjO2NBQUVDLE9BQU8sRUFBRSxjQUFjO2NBQUVDLFdBQVcsRUFBRSxDQUFDO2NBQUVDLE1BQU0sRUFBRSxrQkFBa0I7Y0FDdkZDLGVBQWUsRUFBRTtnQkFBRTdCLEtBQUssRUFBRSxRQUFRO2dCQUFFRSxNQUFNLEVBQUU7Y0FBRyxDQUFDO2NBQUU2QixhQUFhLEVBQUUsaUJBQWlCO2NBQ2xGQyxZQUFZLEVBQUU7Z0JBQUVoQyxLQUFLLEVBQUUsUUFBUTtnQkFBRTZJLGNBQWMsRUFBRSxTQUFTO2dCQUFFQyxZQUFZLEVBQUU7Y0FBTztZQUNuRixDQUFDO1VBRUw7UUFDRixDQUFDO01BQ0gsQ0FBQyxDQUFDO0lBQ0o7SUFDQSxPQUFPL0YsS0FBSyxDQUFDTSxPQUFPLENBQUM7TUFBRXpCLE1BQU0sRUFBRSxHQUFHO01BQUUwQixXQUFXLEVBQUUsa0JBQWtCO01BQUVDLElBQUksRUFBRUMsSUFBSSxDQUFDQyxTQUFTLENBQUM7UUFBRUMsT0FBTyxFQUFFLElBQUk7UUFBRUMsSUFBSSxFQUFFLENBQUM7TUFBRSxDQUFDO0lBQUUsQ0FBQyxDQUFDO0VBQzNILENBQUMsQ0FBQztBQUNKO0FBRUEsZUFBZW9GLGlCQUFpQkEsQ0FBQ3JHLElBQVUsRUFBRXNHLGdCQUF3RSxFQUFFO0VBQ3JILE1BQU10RyxJQUFJLENBQUNFLGFBQWEsQ0FBQyxNQUFNQyxZQUFZLENBQUNDLE9BQU8sQ0FBQyxrQkFBa0IsRUFBRSxNQUFNLENBQUMsQ0FBQztFQUNoRixNQUFNSixJQUFJLENBQUNLLEtBQUssQ0FBQ0MsR0FBRyxJQUFJLElBQUlDLEdBQUcsQ0FBQ0QsR0FBRyxDQUFDLENBQUNFLFFBQVEsQ0FBQ0MsVUFBVSxDQUFDLE9BQU8sQ0FBQyxFQUFFLE1BQU9KLEtBQUssSUFBSztJQUNsRixNQUFNRyxRQUFRLEdBQUcsSUFBSUQsR0FBRyxDQUFDRixLQUFLLENBQUNLLE9BQU8sQ0FBQyxDQUFDLENBQUNKLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQ0UsUUFBUTtJQUN4RCxJQUFJQSxRQUFRLEtBQUssd0JBQXdCLEVBQUUsT0FBT0gsS0FBSyxDQUFDTSxPQUFPLENBQUM7TUFBRXpCLE1BQU0sRUFBRSxHQUFHO01BQUUwQixXQUFXLEVBQUUsa0JBQWtCO01BQUVDLElBQUksRUFBRUMsSUFBSSxDQUFDQyxTQUFTLENBQUM7UUFBRUMsT0FBTyxFQUFFLElBQUk7UUFBRUMsSUFBSSxFQUFFO1VBQUVDLE9BQU8sRUFBRTtRQUFNO01BQUUsQ0FBQztJQUFFLENBQUMsQ0FBQztJQUNwTCxJQUFJVixRQUFRLEtBQUssZUFBZSxFQUFFLE9BQU9ILEtBQUssQ0FBQ00sT0FBTyxDQUFDO01BQUV6QixNQUFNLEVBQUUsR0FBRztNQUFFMEIsV0FBVyxFQUFFLGtCQUFrQjtNQUFFQyxJQUFJLEVBQUVDLElBQUksQ0FBQ0MsU0FBUyxDQUFDO1FBQUVDLE9BQU8sRUFBRSxJQUFJO1FBQUVDLElBQUksRUFBRTtVQUFFRSxlQUFlLEVBQUU7UUFBSztNQUFFLENBQUM7SUFBRSxDQUFDLENBQUM7SUFDbEwsSUFBSVgsUUFBUSxLQUFLLHNCQUFzQixFQUFFLE9BQU9ILEtBQUssQ0FBQ00sT0FBTyxDQUFDO01BQUV6QixNQUFNLEVBQUUsR0FBRztNQUFFMEIsV0FBVyxFQUFFLGtCQUFrQjtNQUFFQyxJQUFJLEVBQUVDLElBQUksQ0FBQ0MsU0FBUyxDQUFDO1FBQUVDLE9BQU8sRUFBRSxJQUFJO1FBQUVDLElBQUksRUFBRTtVQUFFRyxRQUFRLEVBQUU7UUFBSztNQUFFLENBQUM7SUFBRSxDQUFDLENBQUM7SUFDbEwsSUFBSVosUUFBUSxLQUFLLGlCQUFpQnhELGVBQWUscUJBQXFCLElBQUlxRCxLQUFLLENBQUNLLE9BQU8sQ0FBQyxDQUFDLENBQUM2RixNQUFNLENBQUMsQ0FBQyxLQUFLLE1BQU0sRUFBRTtNQUM3RyxPQUFPbEcsS0FBSyxDQUFDTSxPQUFPLENBQUM7UUFBRXpCLE1BQU0sRUFBRSxHQUFHO1FBQUUwQixXQUFXLEVBQUUsa0JBQWtCO1FBQUVDLElBQUksRUFBRUMsSUFBSSxDQUFDQyxTQUFTLENBQUM7VUFBRUMsT0FBTyxFQUFFLElBQUk7VUFBRUMsSUFBSSxFQUFFO1lBQUVpQyxPQUFPLEVBQUUsb0JBQW9CO1lBQUVoRSxNQUFNLEVBQUU7VUFBVTtRQUFFLENBQUM7TUFBRSxDQUFDLENBQUM7SUFDN0s7SUFDQSxJQUFJc0IsUUFBUSxLQUFLLGlCQUFpQnhELGVBQWUsaURBQWlELEVBQUU7TUFDbEcsT0FBT3FELEtBQUssQ0FBQ00sT0FBTyxDQUFDO1FBQUV6QixNQUFNLEVBQUUsR0FBRztRQUFFMEIsV0FBVyxFQUFFLGtCQUFrQjtRQUFFQyxJQUFJLEVBQUVDLElBQUksQ0FBQ0MsU0FBUyxDQUFDO1VBQUVDLE9BQU8sRUFBRSxJQUFJO1VBQUVDLElBQUksRUFBRTtZQUFFaUMsT0FBTyxFQUFFLG9CQUFvQjtZQUFFaEUsTUFBTSxFQUFFO1VBQWE7UUFBRSxDQUFDO01BQUUsQ0FBQyxDQUFDO0lBQ2hMO0lBQ0EsSUFBSXNCLFFBQVEsS0FBSyxpQkFBaUJ4RCxlQUFlLGlEQUFpRCxFQUFFO01BQ2xHc0osZ0JBQWdCLGFBQWhCQSxnQkFBZ0IsZUFBaEJBLGdCQUFnQixDQUFHakcsS0FBSyxDQUFDSyxPQUFPLENBQUMsQ0FBQyxDQUFDO01BQ25DLE9BQU9MLEtBQUssQ0FBQ00sT0FBTyxDQUFDO1FBQUV6QixNQUFNLEVBQUUsR0FBRztRQUFFMEIsV0FBVyxFQUFFLGtCQUFrQjtRQUFFQyxJQUFJLEVBQUVDLElBQUksQ0FBQ0MsU0FBUyxDQUFDO1VBQUVDLE9BQU8sRUFBRSxJQUFJO1VBQUVDLElBQUksRUFBRTtZQUFFaUMsT0FBTyxFQUFFLG9CQUFvQjtZQUFFaEUsTUFBTSxFQUFFLFdBQVc7WUFBRWlFLFFBQVEsRUFBRTtjQUFFcUQsWUFBWSxFQUFFLG1DQUFtQztjQUFFQyxRQUFRLEVBQUU7WUFBeUI7VUFBRTtRQUFFLENBQUM7TUFBRSxDQUFDLENBQUM7SUFDcFI7SUFDQSxJQUFJakcsUUFBUSxLQUFLLGlCQUFpQnhELGVBQWUsRUFBRSxFQUFFO01BQ25ELE9BQU9xRCxLQUFLLENBQUNNLE9BQU8sQ0FBQztRQUNuQnpCLE1BQU0sRUFBRSxHQUFHO1FBQ1gwQixXQUFXLEVBQUUsa0JBQWtCO1FBQy9CQyxJQUFJLEVBQUVDLElBQUksQ0FBQ0MsU0FBUyxDQUFDO1VBQ25CQyxPQUFPLEVBQUUsSUFBSTtVQUNiQyxJQUFJLEVBQUU7WUFDSmxDLEVBQUUsRUFBRS9CLGVBQWU7WUFDbkJxRSxVQUFVLEVBQUVyRSxlQUFlO1lBQzNCdUcsV0FBVyxFQUFFLG1CQUFtQjtZQUNoQ0MsV0FBVyxFQUFFLFFBQVE7WUFDckJ0RSxNQUFNLEVBQUUsdUJBQXVCO1lBQy9Ca0QsS0FBSyxFQUFFbEY7VUFDVDtRQUNGLENBQUM7TUFDSCxDQUFDLENBQUM7SUFDSjtJQUNBLE9BQU9tRCxLQUFLLENBQUNNLE9BQU8sQ0FBQztNQUFFekIsTUFBTSxFQUFFLEdBQUc7TUFBRTBCLFdBQVcsRUFBRSxrQkFBa0I7TUFBRUMsSUFBSSxFQUFFQyxJQUFJLENBQUNDLFNBQVMsQ0FBQztRQUFFQyxPQUFPLEVBQUUsSUFBSTtRQUFFQyxJQUFJLEVBQUUsQ0FBQztNQUFFLENBQUM7SUFBRSxDQUFDLENBQUM7RUFDM0gsQ0FBQyxDQUFDO0FBQ0o7QUFFQSxTQUFTeUYsd0JBQXdCQSxDQUFDaEcsT0FBMkMsRUFBRTtFQUFBLElBQUFpRyxzQkFBQTtFQUM3RSxNQUFNOUYsSUFBSSxHQUFHSCxPQUFPLENBQUNvRCxjQUFjLENBQUMsQ0FBQztFQUNyQyxNQUFNQyxRQUFRLElBQUE0QyxzQkFBQSxHQUFHakcsT0FBTyxDQUFDc0QsT0FBTyxDQUFDLENBQUMsQ0FBQyxjQUFjLENBQUMsY0FBQTJDLHNCQUFBLGdCQUFBQSxzQkFBQSxHQUFqQ0Esc0JBQUEsQ0FBbUMxQyxLQUFLLENBQUMsbUJBQW1CLENBQUMsY0FBQTBDLHNCQUFBLHVCQUE3REEsc0JBQUEsQ0FBZ0UsQ0FBQyxDQUFDO0VBQ25GLElBQUksQ0FBQzlGLElBQUksSUFBSSxDQUFDa0QsUUFBUSxFQUFFLE1BQU0sSUFBSUcsS0FBSyxDQUFDLHlCQUF5QixDQUFDO0VBQ2xFLE1BQU0wQyxLQUFLLEdBQUcvRixJQUFJLENBQUNxRSxPQUFPLENBQUNQLE1BQU0sQ0FBQ0MsSUFBSSxDQUFDLENBQUMsSUFBSSxFQUFFLElBQUksRUFBRSxJQUFJLEVBQUUsSUFBSSxDQUFDLENBQUMsQ0FBQztFQUNqRSxNQUFNaUMsR0FBRyxHQUFHaEcsSUFBSSxDQUFDcUUsT0FBTyxDQUFDUCxNQUFNLENBQUNDLElBQUksQ0FBQyxTQUFTYixRQUFRLEVBQUUsQ0FBQyxFQUFFNkMsS0FBSyxDQUFDO0VBQ2pFLElBQUlBLEtBQUssR0FBRyxDQUFDLElBQUlDLEdBQUcsSUFBSUQsS0FBSyxFQUFFLE1BQU0sSUFBSTFDLEtBQUssQ0FBQyxzQkFBc0IsQ0FBQztFQUN0RSxPQUFPckQsSUFBSSxDQUFDd0UsUUFBUSxDQUFDdUIsS0FBSyxFQUFFQyxHQUFHLENBQUM7QUFDbEM7QUFFQSxLQUFLLE1BQU1DLFFBQVEsSUFBSSxDQUNyQjtFQUFFQyxLQUFLLEVBQUUsSUFBSTtFQUFFQyxNQUFNLEVBQUU7QUFBSSxDQUFDLEVBQzVCO0VBQUVELEtBQUssRUFBRSxJQUFJO0VBQUVDLE1BQU0sRUFBRTtBQUFJLENBQUMsRUFDNUI7RUFBRUQsS0FBSyxFQUFFLElBQUk7RUFBRUMsTUFBTSxFQUFFO0FBQUssQ0FBQyxDQUM5QixFQUFFO0VBQ0RySyxJQUFJLENBQUMseUJBQXlCbUssUUFBUSxDQUFDQyxLQUFLLElBQUlELFFBQVEsQ0FBQ0UsTUFBTSxFQUFFLEVBQUUsT0FBTztJQUFFaEg7RUFBSyxDQUFDLEVBQUVpSCxRQUFRLEtBQUs7SUFDL0YsTUFBTWpILElBQUksQ0FBQ2tILGVBQWUsQ0FBQ0osUUFBUSxDQUFDO0lBQ3BDLE1BQU0vRyxpQkFBaUIsQ0FBQ0MsSUFBSSxDQUFDO0lBQzdCLE1BQU1BLElBQUksQ0FBQ21ILElBQUksQ0FBQyxZQUFZckssU0FBUyxVQUFVLENBQUM7SUFFaEQsTUFBTXNLLEtBQUssR0FBR3BILElBQUksQ0FBQ3FILE9BQU8sQ0FBQyxrQkFBa0IsQ0FBQztJQUM5QyxNQUFNM0ssTUFBTSxDQUFDMEssS0FBSyxDQUFDLENBQUNFLFdBQVcsQ0FBQyxDQUFDO0lBQ2pDLE1BQU01SyxNQUFNLENBQUNzRCxJQUFJLENBQUN1SCxTQUFTLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQ0MsYUFBYSxDQUFDLFFBQVEsQ0FBQztJQUM1RCxNQUFNOUssTUFBTSxDQUFDMEssS0FBSyxDQUFDLENBQUNLLGVBQWUsQ0FBQyx1QkFBdUIsRUFBRVgsUUFBUSxDQUFDQyxLQUFLLEtBQUssSUFBSSxHQUFHLFFBQVEsR0FBRyxRQUFRLENBQUM7SUFFM0csTUFBTVcsU0FBUyxHQUFHMUgsSUFBSSxDQUFDdUgsU0FBUyxDQUFDLGVBQWUsRUFBRTtNQUFFL0ksSUFBSSxFQUFFO0lBQU0sQ0FBQyxDQUFDO0lBRWxFLElBQUlzSSxRQUFRLENBQUNDLEtBQUssS0FBSyxJQUFJLEVBQUU7TUFDM0IsTUFBTVksYUFBYSxHQUFHM0gsSUFBSSxDQUFDcUgsT0FBTyxDQUFDLHNEQUFzRCxDQUFDO01BQzFGLE1BQU0zSyxNQUFNLENBQUNpTCxhQUFhLENBQUMsQ0FBQ0wsV0FBVyxDQUFDLENBQUM7TUFDekMsTUFBTUssYUFBYSxDQUFDQyxLQUFLLENBQUMsQ0FBQztNQUMzQixNQUFNbEwsTUFBTSxDQUFDZ0wsU0FBUyxDQUFDLENBQUNKLFdBQVcsQ0FBQyxDQUFDO0lBQ3ZDO0lBRUEsTUFBTUksU0FBUyxDQUFDSCxTQUFTLENBQUMsS0FBSyxFQUFFO01BQUUvSSxJQUFJLEVBQUU7SUFBSyxDQUFDLENBQUMsQ0FBQ29KLEtBQUssQ0FBQyxDQUFDO0lBQ3hELE1BQU1sTCxNQUFNLENBQUNnTCxTQUFTLENBQUNILFNBQVMsQ0FBQyxTQUFTLEVBQUU7TUFBRS9JLElBQUksRUFBRSxPQUFPO01BQUVxSixLQUFLLEVBQUU7SUFBSyxDQUFDLENBQUMsQ0FBQyxDQUFDUCxXQUFXLENBQUMsQ0FBQztJQUUxRixNQUFNSSxTQUFTLENBQUNILFNBQVMsQ0FBQyxLQUFLLEVBQUU7TUFBRS9JLElBQUksRUFBRTtJQUFLLENBQUMsQ0FBQyxDQUFDb0osS0FBSyxDQUFDLENBQUM7SUFDeEQsTUFBTUYsU0FBUyxDQUFDSSxTQUFTLENBQUMsTUFBTSxDQUFDLENBQUNGLEtBQUssQ0FBQyxDQUFDO0lBQ3pDLE1BQU1GLFNBQVMsQ0FBQ0gsU0FBUyxDQUFDLFVBQVUsRUFBRTtNQUFFL0ksSUFBSSxFQUFFO0lBQU8sQ0FBQyxDQUFDLENBQUN1SixZQUFZLENBQUMsTUFBTSxDQUFDO0lBQzVFLE1BQU1yTCxNQUFNLENBQUNzRCxJQUFJLENBQUN1SCxTQUFTLENBQUMsUUFBUSxFQUFFO01BQUUvSSxJQUFJLEVBQUU7SUFBUyxDQUFDLENBQUMsQ0FBQyxDQUFDd0osV0FBVyxDQUFDLENBQUM7SUFDeEUsTUFBTWhJLElBQUksQ0FBQ3VILFNBQVMsQ0FBQyxRQUFRLEVBQUU7TUFBRS9JLElBQUksRUFBRTtJQUFTLENBQUMsQ0FBQyxDQUFDb0osS0FBSyxDQUFDLENBQUM7SUFDMUQsTUFBTWxMLE1BQU0sQ0FBQ3NELElBQUksQ0FBQ3FILE9BQU8sQ0FBQyx5QkFBeUIsQ0FBQyxDQUFDLENBQUNZLFdBQVcsQ0FBQyxtQkFBbUIsQ0FBQztJQUN0RixNQUFNakksSUFBSSxDQUFDdUgsU0FBUyxDQUFDLFFBQVEsRUFBRTtNQUFFL0ksSUFBSSxFQUFFO0lBQVEsQ0FBQyxDQUFDLENBQUNvSixLQUFLLENBQUMsQ0FBQztJQUN6RCxNQUFNRixTQUFTLENBQUNILFNBQVMsQ0FBQyxVQUFVLEVBQUU7TUFBRS9JLElBQUksRUFBRTtJQUFPLENBQUMsQ0FBQyxDQUFDdUosWUFBWSxDQUFDLE9BQU8sQ0FBQztJQUM3RSxNQUFNTCxTQUFTLENBQUNILFNBQVMsQ0FBQyxVQUFVLEVBQUU7TUFBRS9JLElBQUksRUFBRTtJQUFPLENBQUMsQ0FBQyxDQUFDdUosWUFBWSxDQUFDLE1BQU0sQ0FBQztJQUM1RSxNQUFNTCxTQUFTLENBQUNILFNBQVMsQ0FBQyxVQUFVLEVBQUU7TUFBRS9JLElBQUksRUFBRTtJQUFPLENBQUMsQ0FBQyxDQUFDdUosWUFBWSxDQUFDLEdBQUcsQ0FBQztJQUN6RSxNQUFNL0gsSUFBSSxDQUFDdUgsU0FBUyxDQUFDLFFBQVEsRUFBRTtNQUFFL0ksSUFBSSxFQUFFO0lBQVEsQ0FBQyxDQUFDLENBQUNvSixLQUFLLENBQUMsQ0FBQztJQUN6RCxNQUFNNUgsSUFBSSxDQUFDdUgsU0FBUyxDQUFDLFFBQVEsRUFBRTtNQUFFL0ksSUFBSSxFQUFFO0lBQVEsQ0FBQyxDQUFDLENBQUNvSixLQUFLLENBQUMsQ0FBQztJQUN6RCxNQUFNbEwsTUFBTSxDQUFDc0QsSUFBSSxDQUFDcUgsT0FBTyxDQUFDLG9DQUFvQyxDQUFDLENBQUMsQ0FBQ1ksV0FBVyxDQUFDLDhCQUE4QixDQUFDO0lBRTVHLE1BQU1DLFFBQVEsR0FBRyxNQUFNbEksSUFBSSxDQUFDbUksUUFBUSxDQUFDLE9BQU87TUFDMUNwQixLQUFLLEVBQUVwRixRQUFRLENBQUN5RyxlQUFlLENBQUNDLFdBQVcsR0FBR0MsTUFBTSxDQUFDQyxVQUFVO01BQy9EdkIsTUFBTSxFQUFFckYsUUFBUSxDQUFDeUcsZUFBZSxDQUFDSSxZQUFZLEdBQUdGLE1BQU0sQ0FBQ0c7SUFDekQsQ0FBQyxDQUFDLENBQUM7SUFDSC9MLE1BQU0sQ0FBQ3dMLFFBQVEsQ0FBQ25CLEtBQUssQ0FBQyxDQUFDMkIsbUJBQW1CLENBQUMsQ0FBQyxDQUFDO0lBQzdDaE0sTUFBTSxDQUFDd0wsUUFBUSxDQUFDbEIsTUFBTSxDQUFDLENBQUMwQixtQkFBbUIsQ0FBQyxDQUFDLENBQUM7SUFDOUMsTUFBTTFJLElBQUksQ0FBQzJJLFVBQVUsQ0FBQztNQUFFQyxJQUFJLEVBQUUzQixRQUFRLENBQUM0QixVQUFVLENBQUMsVUFBVS9CLFFBQVEsQ0FBQ0MsS0FBSyxJQUFJRCxRQUFRLENBQUNFLE1BQU0sTUFBTSxDQUFDO01BQUU4QixRQUFRLEVBQUU7SUFBSyxDQUFDLENBQUM7RUFDekgsQ0FBQyxDQUFDO0FBQ0o7QUFFQW5NLElBQUksQ0FBQyx5REFBeUQsRUFBRSxPQUFPO0VBQUVxRDtBQUFLLENBQUMsS0FBSztFQUNsRnJELElBQUksQ0FBQ29NLFVBQVUsQ0FBQyxLQUFNLENBQUM7RUFDdkIsTUFBTS9JLElBQUksQ0FBQ2tILGVBQWUsQ0FBQztJQUFFSCxLQUFLLEVBQUUsSUFBSTtJQUFFQyxNQUFNLEVBQUU7RUFBSSxDQUFDLENBQUM7RUFDeEQsTUFBTXhCLGdCQUFnQixDQUFDeEYsSUFBSSxDQUFDO0VBQzVCLE1BQU1BLElBQUksQ0FBQ21ILElBQUksQ0FBQyxZQUFZcEssY0FBYyxVQUFVLENBQUM7RUFFckQsTUFBTUwsTUFBTSxDQUFDc0QsSUFBSSxDQUFDdUgsU0FBUyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUNDLGFBQWEsQ0FBQyxTQUFTLENBQUM7RUFDN0QsTUFBTUUsU0FBUyxHQUFHMUgsSUFBSSxDQUFDdUgsU0FBUyxDQUFDLGVBQWUsRUFBRTtJQUFFL0ksSUFBSSxFQUFFO0VBQU0sQ0FBQyxDQUFDO0VBQ2xFLE1BQU1rSixTQUFTLENBQUNILFNBQVMsQ0FBQyxLQUFLLEVBQUU7SUFBRS9JLElBQUksRUFBRTtFQUFLLENBQUMsQ0FBQyxDQUFDb0osS0FBSyxDQUFDLENBQUM7RUFDeEQsTUFBTWxMLE1BQU0sQ0FBQ2dMLFNBQVMsQ0FBQyxDQUFDRixhQUFhLENBQUMsUUFBUSxDQUFDO0VBQy9DLE1BQU13QixTQUFTLEdBQUdoSixJQUFJLENBQUNpSixXQUFXLENBQUMsdUJBQXVCLENBQUM7RUFDM0QsTUFBTUQsU0FBUyxDQUFDekIsU0FBUyxDQUFDLFFBQVEsRUFBRTtJQUFFL0ksSUFBSSxFQUFFO0VBQU0sQ0FBQyxDQUFDLENBQUNvSixLQUFLLENBQUMsQ0FBQztFQUM1RCxNQUFNbEwsTUFBTSxDQUFDc0QsSUFBSSxDQUFDdUgsU0FBUyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUNDLGFBQWEsQ0FBQyxRQUFRLENBQUM7RUFDNUQsTUFBTTBCLEtBQUssR0FBR2xKLElBQUksQ0FBQ3VILFNBQVMsQ0FBQyxNQUFNLENBQUMsQ0FBQ0YsT0FBTyxDQUFDLEtBQUssQ0FBQyxDQUFDOEIsS0FBSyxDQUFDLENBQUM7RUFDM0QsTUFBTXpNLE1BQU0sQ0FBQ3dNLEtBQUssQ0FBQyxDQUFDNUIsV0FBVyxDQUFDLENBQUM7RUFDakMsTUFBTTVLLE1BQU0sQ0FBQzBNLElBQUksQ0FBQyxNQUFNRixLQUFLLENBQUNmLFFBQVEsQ0FBRXBLLEtBQXVCLElBQUtBLEtBQUssQ0FBQ3NMLFlBQVksQ0FBQyxDQUFDLENBQUNDLGVBQWUsQ0FBQyxDQUFDLENBQUM7RUFFM0csTUFBTU4sU0FBUyxDQUFDekIsU0FBUyxDQUFDLFFBQVEsRUFBRTtJQUFFL0ksSUFBSSxFQUFFO0VBQU0sQ0FBQyxDQUFDLENBQUNvSixLQUFLLENBQUMsQ0FBQztFQUM1RCxNQUFNMkIsWUFBWSxHQUFHdkosSUFBSSxDQUFDcUgsT0FBTyxDQUFDLG1EQUFtRCxDQUFDLENBQUM4QixLQUFLLENBQUMsQ0FBQztFQUM5RixNQUFNek0sTUFBTSxDQUFDNk0sWUFBWSxDQUFDLENBQUNqQyxXQUFXLENBQUM7SUFBRWtDLE9BQU8sRUFBRTtFQUFNLENBQUMsQ0FBQztFQUMxRCxNQUFNQyxNQUFNLEdBQUdGLFlBQVksQ0FBQ2xDLE9BQU8sQ0FBQyxRQUFRLENBQUM7RUFDN0MsTUFBTTNLLE1BQU0sQ0FBQytNLE1BQU0sQ0FBQyxDQUFDbkMsV0FBVyxDQUFDLENBQUM7RUFDbEMsTUFBTTVLLE1BQU0sQ0FBQytNLE1BQU0sQ0FBQyxDQUFDaEMsZUFBZSxDQUFDLE9BQU8sRUFBRSxVQUFVLENBQUM7RUFDekQsTUFBTS9LLE1BQU0sQ0FBQytNLE1BQU0sQ0FBQyxDQUFDaEMsZUFBZSxDQUFDLFFBQVEsRUFBRSxVQUFVLENBQUM7RUFFMUQsTUFBTVMsUUFBUSxHQUFHLE1BQU1sSSxJQUFJLENBQUNtSSxRQUFRLENBQUMsT0FBTztJQUMxQ3BCLEtBQUssRUFBRXBGLFFBQVEsQ0FBQ3lHLGVBQWUsQ0FBQ0MsV0FBVyxHQUFHQyxNQUFNLENBQUNDLFVBQVU7SUFDL0R2QixNQUFNLEVBQUVyRixRQUFRLENBQUN5RyxlQUFlLENBQUNJLFlBQVksR0FBR0YsTUFBTSxDQUFDRztFQUN6RCxDQUFDLENBQUMsQ0FBQztFQUNIL0wsTUFBTSxDQUFDd0wsUUFBUSxDQUFDbkIsS0FBSyxDQUFDLENBQUMyQixtQkFBbUIsQ0FBQyxDQUFDLENBQUM7RUFDN0NoTSxNQUFNLENBQUN3TCxRQUFRLENBQUNsQixNQUFNLENBQUMsQ0FBQzBCLG1CQUFtQixDQUFDLENBQUMsQ0FBQztBQUNoRCxDQUFDLENBQUM7QUFFRi9MLElBQUksQ0FBQyxnRUFBZ0UsRUFBRSxPQUFPO0VBQUVxRDtBQUFLLENBQUMsRUFBRWlILFFBQVEsS0FBSztFQUNuR3RLLElBQUksQ0FBQ29NLFVBQVUsQ0FBQyxNQUFPLENBQUM7RUFDeEIsSUFBSVcsUUFBcUU7RUFDekUsTUFBTTFKLElBQUksQ0FBQ2tILGVBQWUsQ0FBQztJQUFFSCxLQUFLLEVBQUUsSUFBSTtJQUFFQyxNQUFNLEVBQUU7RUFBSSxDQUFDLENBQUM7RUFDeEQsTUFBTWpILGlCQUFpQixDQUFDQyxJQUFJLEVBQUdVLE9BQU8sSUFBSztJQUFFZ0osUUFBUSxHQUFHOUYsNEJBQTRCLENBQUNsRCxPQUFPLENBQUM7RUFBQyxDQUFDLENBQUM7RUFDaEcsTUFBTVYsSUFBSSxDQUFDbUgsSUFBSSxDQUFDLFlBQVlySyxTQUFTLFVBQVUsQ0FBQztFQUVoRCxNQUFNSixNQUFNLENBQUNzRCxJQUFJLENBQUNxSCxPQUFPLENBQUMsb0JBQW9CLENBQUMsQ0FBQyxDQUFDSSxlQUFlLENBQUMsMEJBQTBCLEVBQUUsTUFBTSxDQUFDO0VBQ3BHLE1BQU16SCxJQUFJLENBQUMySixVQUFVLENBQUMsTUFBTSxDQUFDLENBQUM1QixZQUFZLENBQUMsTUFBTSxDQUFDO0VBQ2xELE1BQU0vSCxJQUFJLENBQUN1SCxTQUFTLENBQUMsUUFBUSxFQUFFO0lBQUUvSSxJQUFJLEVBQUU7RUFBUyxDQUFDLENBQUMsQ0FBQ29KLEtBQUssQ0FBQyxDQUFDO0VBQzFELE1BQU1sTCxNQUFNLENBQUNzRCxJQUFJLENBQUN1SCxTQUFTLENBQUMsUUFBUSxFQUFFO0lBQUUvSSxJQUFJLEVBQUU7RUFBUyxDQUFDLENBQUMsQ0FBQyxDQUFDOEksV0FBVyxDQUFDLENBQUM7RUFDeEUsTUFBTXRILElBQUksQ0FBQ3VILFNBQVMsQ0FBQyxRQUFRLEVBQUU7SUFBRS9JLElBQUksRUFBRTtFQUFTLENBQUMsQ0FBQyxDQUFDb0osS0FBSyxDQUFDLENBQUM7RUFDMUQsTUFBTWxMLE1BQU0sQ0FBQzBNLElBQUksQ0FBQztJQUFBLElBQUFRLFNBQUE7SUFBQSxPQUFNLEVBQUFBLFNBQUEsR0FBQUYsUUFBUSxjQUFBRSxTQUFBLHVCQUFSQSxTQUFBLENBQVUvRSxVQUFVLEtBQUksQ0FBQztFQUFBLEdBQUU7SUFBRTJFLE9BQU8sRUFBRTtFQUFPLENBQUMsQ0FBQyxDQUFDRixlQUFlLENBQUMsQ0FBQyxDQUFDO0VBRTFGNU0sTUFBTSxDQUFDZ04sUUFBUSxDQUFFcEUsT0FBTyxDQUFDLENBQUN1RSxPQUFPLENBQUMsQ0FBQyxRQUFRLEVBQUUsUUFBUSxDQUFDLENBQUM7RUFDdkRuTixNQUFNLENBQUNnTixRQUFRLENBQUVuRSxXQUFXLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQytELGVBQWUsQ0FBQyxDQUFDLENBQUM7RUFDbkQ1TSxNQUFNLENBQUNnTixRQUFRLENBQUVuRSxXQUFXLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQ3VFLElBQUksQ0FBQyxDQUFDLENBQUM7RUFDeENwTixNQUFNLENBQUNnTixRQUFRLENBQUU3RSxVQUFVLENBQUMsQ0FBQ2lGLElBQUksQ0FBQ0osUUFBUSxDQUFFbkUsV0FBVyxDQUFDd0UsTUFBTSxDQUFDLENBQUMzRyxLQUFLLEVBQUU0RyxLQUFLLEtBQUs1RyxLQUFLLEdBQUc0RyxLQUFLLEVBQUUsQ0FBQyxDQUFDLENBQUM7RUFDbkcsTUFBTUMsUUFBUSxHQUFHUCxRQUFRLENBQUUzRSxJQUFJLENBQUMsQ0FBQyxDQUFDO0VBQ2xDLE1BQU1tRixRQUFRLEdBQUdSLFFBQVEsQ0FBRTNFLElBQUksQ0FBQzJFLFFBQVEsQ0FBRW5FLFdBQVcsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUM7RUFDN0Q3SSxNQUFNLENBQUN1TixRQUFRLENBQUN0SyxNQUFNLENBQUMsQ0FBQzJKLGVBQWUsQ0FBQyxJQUFLLENBQUM7RUFDOUM1TSxNQUFNLENBQUN3TixRQUFRLENBQUNDLE1BQU0sQ0FBQ0YsUUFBUSxDQUFDLENBQUMsQ0FBQ0gsSUFBSSxDQUFDLEtBQUssQ0FBQztFQUM3QyxNQUFNTSxjQUFjLEdBQUduRCxRQUFRLENBQUM0QixVQUFVLENBQUMsa0NBQWtDLENBQUM7RUFDOUUsTUFBTXdCLGNBQWMsR0FBR3BELFFBQVEsQ0FBQzRCLFVBQVUsQ0FBQyxzQ0FBc0MsQ0FBQztFQUNsRmpNLGFBQWEsQ0FBQ3dOLGNBQWMsRUFBRUgsUUFBUSxDQUFDO0VBQ3ZDck4sYUFBYSxDQUFDeU4sY0FBYyxFQUFFSCxRQUFRLENBQUM7RUFDdkMsTUFBTWpELFFBQVEsQ0FBQ3FELE1BQU0sQ0FBQyw4QkFBOEIsRUFBRTtJQUFFMUIsSUFBSSxFQUFFd0IsY0FBYztJQUFFeEosV0FBVyxFQUFFO0VBQVksQ0FBQyxDQUFDO0VBQ3pHLE1BQU1xRyxRQUFRLENBQUNxRCxNQUFNLENBQUMsa0NBQWtDLEVBQUU7SUFBRTFCLElBQUksRUFBRXlCLGNBQWM7SUFBRXpKLFdBQVcsRUFBRTtFQUFZLENBQUMsQ0FBQztBQUMvRyxDQUFDLENBQUM7QUFFRmpFLElBQUksQ0FBQyxtRkFBbUYsRUFBRSxPQUFPO0VBQUVxRDtBQUFLLENBQUMsRUFBRWlILFFBQVEsS0FBSztFQUN0SCxNQUFNakgsSUFBSSxDQUFDa0gsZUFBZSxDQUFDO0lBQUVILEtBQUssRUFBRSxJQUFJO0lBQUVDLE1BQU0sRUFBRTtFQUFLLENBQUMsQ0FBQztFQUN6RCxNQUFNWCxpQkFBaUIsQ0FBQ3JHLElBQUksQ0FBQztFQUM3QixNQUFNQSxJQUFJLENBQUNtSCxJQUFJLENBQUMsWUFBWW5LLGVBQWUsVUFBVSxDQUFDO0VBRXRELE1BQU1OLE1BQU0sQ0FBQ3NELElBQUksQ0FBQ3FILE9BQU8sQ0FBQyxvQkFBb0IsQ0FBQyxDQUFDLENBQUNJLGVBQWUsQ0FBQywwQkFBMEIsRUFBRSxNQUFNLENBQUM7RUFDcEcsTUFBTThDLE9BQU8sR0FBRyxJQUFJQyxHQUFHLENBQVMsQ0FBQztFQUVqQyxLQUFLLElBQUkxTCxLQUFLLEdBQUcsQ0FBQyxFQUFFQSxLQUFLLEdBQUc1QixZQUFZLENBQUN5QyxNQUFNLEVBQUViLEtBQUssSUFBSSxDQUFDLEVBQUU7SUFDM0QsTUFBTWtCLElBQUksQ0FBQ3VILFNBQVMsQ0FBQyxRQUFRLEVBQUU7TUFBRS9JLElBQUksRUFBRSxJQUFJOEYsTUFBTSxDQUFDLE1BQU14RixLQUFLLEdBQUcsQ0FBQyxJQUFJO0lBQUUsQ0FBQyxDQUFDLENBQUM4SSxLQUFLLENBQUMsQ0FBQztJQUNqRixNQUFNL0ksS0FBSyxHQUFHbUIsSUFBSSxDQUFDcUgsT0FBTyxDQUFDLG9CQUFvQixDQUFDLENBQUNvRCxJQUFJLENBQUMsQ0FBQztJQUN2RCxNQUFNL04sTUFBTSxDQUFDbUMsS0FBSyxDQUFDLENBQUM0SSxlQUFlLENBQUMsYUFBYSxFQUFFdkssWUFBWSxDQUFDNEIsS0FBSyxDQUFDLENBQUNPLGFBQWEsQ0FBQztJQUNyRixNQUFNM0MsTUFBTSxDQUFDbUMsS0FBSyxDQUFDLENBQUM0SSxlQUFlLENBQUMsb0JBQW9CLEVBQUUsZUFBZSxDQUFDO0lBQzFFLE1BQU0vSyxNQUFNLENBQUNtQyxLQUFLLENBQUMsQ0FBQzRJLGVBQWUsQ0FBQyxvQkFBb0IsRUFBRXhLLGFBQWEsQ0FBQzZCLEtBQUssR0FBRzdCLGFBQWEsQ0FBQzBDLE1BQU0sQ0FBQyxDQUFDO0lBRXRHLE1BQU0rSyxLQUFLLEdBQUcsTUFBTTdMLEtBQUssQ0FBQ3NKLFFBQVEsQ0FBRXdDLElBQUksSUFBSztNQUMzQyxNQUFNQyxTQUFTLEdBQUdELElBQUksQ0FBQ0UscUJBQXFCLENBQUMsQ0FBQztNQUM5QyxNQUFNQyxNQUFNLEdBQUduSixRQUFRLENBQUNvSixnQkFBZ0IsQ0FBQ0osSUFBSSxFQUFFSyxVQUFVLENBQUNDLFNBQVMsQ0FBQztNQUNwRSxNQUFNQyxXQUFxQixHQUFHLEVBQUU7TUFDaEMsSUFBSUMsSUFBSSxHQUFHTCxNQUFNLENBQUNNLFFBQVEsQ0FBQyxDQUFDO01BQzVCLE9BQU9ELElBQUksRUFBRTtRQUFBLElBQUFFLGlCQUFBO1FBQ1gsTUFBTWxILElBQUksR0FBRyxFQUFBa0gsaUJBQUEsR0FBQUYsSUFBSSxDQUFDRyxXQUFXLGNBQUFELGlCQUFBLHVCQUFoQkEsaUJBQUEsQ0FBa0JFLElBQUksQ0FBQyxDQUFDLEtBQUksRUFBRTtRQUMzQyxNQUFNQyxNQUFNLEdBQUdMLElBQUksQ0FBQ00sYUFBYTtRQUNqQyxJQUFJdEgsSUFBSSxJQUFJcUgsTUFBTSxJQUFJRSxnQkFBZ0IsQ0FBQ0YsTUFBTSxDQUFDLENBQUNHLFVBQVUsS0FBSyxRQUFRLEVBQUU7VUFDdEUsTUFBTUMsS0FBSyxHQUFHakssUUFBUSxDQUFDa0ssV0FBVyxDQUFDLENBQUM7VUFDcENELEtBQUssQ0FBQ0Usa0JBQWtCLENBQUNYLElBQUksQ0FBQztVQUM5QixNQUFNWSxJQUFJLEdBQUdILEtBQUssQ0FBQ2YscUJBQXFCLENBQUMsQ0FBQztVQUMxQyxJQUFJa0IsSUFBSSxDQUFDaEYsS0FBSyxHQUFHLENBQUMsSUFBSWdGLElBQUksQ0FBQy9FLE1BQU0sR0FBRyxDQUFDLEtBQ25DK0UsSUFBSSxDQUFDQyxJQUFJLEdBQUdwQixTQUFTLENBQUNvQixJQUFJLEdBQUcsQ0FBQyxJQUFJRCxJQUFJLENBQUNFLEdBQUcsR0FBR3JCLFNBQVMsQ0FBQ3FCLEdBQUcsR0FBRyxDQUFDLElBQzlERixJQUFJLENBQUNHLEtBQUssR0FBR3RCLFNBQVMsQ0FBQ3NCLEtBQUssR0FBRyxDQUFDLElBQUlILElBQUksQ0FBQ0ksTUFBTSxHQUFHdkIsU0FBUyxDQUFDdUIsTUFBTSxHQUFHLENBQUMsQ0FDdkUsRUFBRWpCLFdBQVcsQ0FBQzlGLElBQUksQ0FBQ2pCLElBQUksQ0FBQztRQUMzQjtRQUNBZ0gsSUFBSSxHQUFHTCxNQUFNLENBQUNNLFFBQVEsQ0FBQyxDQUFDO01BQzFCO01BQ0EsTUFBTWdCLE1BQU0sR0FBR0MsS0FBSyxDQUFDekgsSUFBSSxDQUFDK0YsSUFBSSxDQUFDMkIsZ0JBQWdCLENBQW1CLEtBQUssQ0FBQyxDQUFDLENBQUMxTixHQUFHLENBQUNiLEtBQUssS0FBSztRQUN0RndPLE1BQU0sRUFBRXhPLEtBQUssQ0FBQ3lPLFlBQVksQ0FBQyxLQUFLLENBQUMsSUFBSSxFQUFFO1FBQ3ZDbkQsWUFBWSxFQUFFdEwsS0FBSyxDQUFDc0wsWUFBWTtRQUNoQ29ELGFBQWEsRUFBRTFPLEtBQUssQ0FBQzBPO01BQ3ZCLENBQUMsQ0FBQyxDQUFDO01BQ0gsTUFBTUMsS0FBSyxHQUFHaEIsZ0JBQWdCLENBQUNmLElBQUksQ0FBQztNQUNwQyxPQUFPO1FBQ0xPLFdBQVc7UUFDWHlCLE1BQU0sRUFBRUQsS0FBSyxDQUFDRSxnQkFBZ0IsQ0FBQyxpQkFBaUIsQ0FBQyxDQUFDckIsSUFBSSxDQUFDLENBQUM7UUFDeERhLE1BQU07UUFDTi9ELFdBQVcsRUFBRXNDLElBQUksQ0FBQ3RDLFdBQVc7UUFDN0JHLFlBQVksRUFBRW1DLElBQUksQ0FBQ25DO01BQ3JCLENBQUM7SUFDSCxDQUFDLENBQUM7SUFFRjlMLE1BQU0sQ0FBQ2dPLEtBQUssQ0FBQ1EsV0FBVyxFQUFFLEdBQUdoTyxZQUFZLENBQUM0QixLQUFLLENBQUMsQ0FBQ08sYUFBYSw2QkFBNkIsQ0FBQyxDQUFDd0ssT0FBTyxDQUFDLEVBQUUsQ0FBQztJQUN4R25OLE1BQU0sQ0FBQ2dPLEtBQUssQ0FBQ3JDLFdBQVcsQ0FBQyxDQUFDeUIsSUFBSSxDQUFDLElBQUksQ0FBQztJQUNwQ3BOLE1BQU0sQ0FBQ2dPLEtBQUssQ0FBQ2xDLFlBQVksQ0FBQyxDQUFDc0IsSUFBSSxDQUFDLElBQUksQ0FBQztJQUNyQ3BOLE1BQU0sQ0FBQ2dPLEtBQUssQ0FBQ2lDLE1BQU0sQ0FBQyxDQUFDRSxHQUFHLENBQUMvQyxJQUFJLENBQUMsRUFBRSxDQUFDO0lBQ2pDUyxPQUFPLENBQUN1QyxHQUFHLENBQUNwQyxLQUFLLENBQUNpQyxNQUFNLENBQUM7SUFDekIsS0FBSyxNQUFNNU8sS0FBSyxJQUFJMk0sS0FBSyxDQUFDMEIsTUFBTSxFQUFFO01BQ2hDMVAsTUFBTSxDQUFDcUIsS0FBSyxDQUFDd08sTUFBTSxDQUFDLENBQUNNLEdBQUcsQ0FBQy9DLElBQUksQ0FBQyxFQUFFLENBQUM7TUFDakNwTixNQUFNLENBQUNxQixLQUFLLENBQUNzTCxZQUFZLENBQUMsQ0FBQ0MsZUFBZSxDQUFDLENBQUMsQ0FBQztNQUM3QzVNLE1BQU0sQ0FBQ3FCLEtBQUssQ0FBQzBPLGFBQWEsQ0FBQyxDQUFDbkQsZUFBZSxDQUFDLENBQUMsQ0FBQztJQUNoRDtJQUNBLElBQUlwTSxZQUFZLENBQUM0QixLQUFLLENBQUMsQ0FBQ08sYUFBYSxLQUFLLGdCQUFnQixFQUFFO01BQzFELE1BQU0wTixlQUFlLEdBQUcsTUFBTWxPLEtBQUssQ0FBQ3NKLFFBQVEsQ0FBRXdDLElBQUksSUFBSztRQUNyRCxNQUFNcUMsUUFBUSxHQUFJbkwsS0FBYSxJQUFLLENBQUNBLEtBQUssQ0FBQ29DLEtBQUssQ0FBQyxTQUFTLENBQUMsSUFBSSxFQUFFLEVBQUVnSixLQUFLLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDck8sR0FBRyxDQUFDc08sTUFBTSxDQUFDO1FBQzFGLE1BQU1DLFNBQVMsR0FBSXRMLEtBQWEsSUFBSztVQUNuQyxNQUFNdUwsUUFBUSxHQUFHSixRQUFRLENBQUNuTCxLQUFLLENBQUMsQ0FBQ2pELEdBQUcsQ0FBQ3lPLE9BQU8sSUFBSTtZQUM5QyxNQUFNQyxVQUFVLEdBQUdELE9BQU8sR0FBRyxHQUFHO1lBQ2hDLE9BQU9DLFVBQVUsSUFBSSxPQUFPLEdBQUdBLFVBQVUsR0FBRyxLQUFLLEdBQUcsQ0FBQyxDQUFDQSxVQUFVLEdBQUcsS0FBSyxJQUFJLEtBQUssS0FBSyxHQUFHO1VBQzNGLENBQUMsQ0FBQztVQUNGLE9BQU8sTUFBTSxHQUFHRixRQUFRLENBQUMsQ0FBQyxDQUFDLEdBQUcsTUFBTSxHQUFHQSxRQUFRLENBQUMsQ0FBQyxDQUFDLEdBQUcsTUFBTSxHQUFHQSxRQUFRLENBQUMsQ0FBQyxDQUFDO1FBQzNFLENBQUM7UUFDRCxNQUFNRyxVQUFVLEdBQUc3QixnQkFBZ0IsQ0FBQ2YsSUFBSSxDQUFDNkMsYUFBYSxDQUFDLDJCQUEyQixDQUFZLENBQUMsQ0FBQ0MsS0FBSztRQUNyRyxNQUFNQyxVQUFVLEdBQUdoQyxnQkFBZ0IsQ0FBQ2YsSUFBSSxDQUFDNkMsYUFBYSxDQUFDLGlCQUFpQixDQUFZLENBQUMsQ0FBQ0csZUFBZTtRQUNyRyxNQUFNQyxLQUFLLEdBQUdDLElBQUksQ0FBQ0MsR0FBRyxDQUFDWCxTQUFTLENBQUNJLFVBQVUsQ0FBQyxFQUFFSixTQUFTLENBQUNPLFVBQVUsQ0FBQyxDQUFDO1FBQ3BFLE1BQU1LLElBQUksR0FBR0YsSUFBSSxDQUFDRyxHQUFHLENBQUNiLFNBQVMsQ0FBQ0ksVUFBVSxDQUFDLEVBQUVKLFNBQVMsQ0FBQ08sVUFBVSxDQUFDLENBQUM7UUFDbkUsT0FBTyxDQUFDRSxLQUFLLEdBQUcsSUFBSSxLQUFLRyxJQUFJLEdBQUcsSUFBSSxDQUFDO01BQ3ZDLENBQUMsQ0FBQztNQUNGclIsTUFBTSxDQUFDcVEsZUFBZSxDQUFDLENBQUNrQixzQkFBc0IsQ0FBQyxHQUFHLENBQUM7SUFDckQ7SUFDQSxNQUFNcFAsS0FBSyxDQUFDOEosVUFBVSxDQUFDO01BQUVDLElBQUksRUFBRTNCLFFBQVEsQ0FBQzRCLFVBQVUsQ0FBQyxVQUFVekosTUFBTSxDQUFDTixLQUFLLEdBQUcsQ0FBQyxDQUFDLENBQUNvUCxRQUFRLENBQUMsQ0FBQyxFQUFFLEdBQUcsQ0FBQyxJQUFJaFIsWUFBWSxDQUFDNEIsS0FBSyxDQUFDLENBQUNPLGFBQWEsTUFBTTtJQUFFLENBQUMsQ0FBQztFQUNoSjtFQUVBM0MsTUFBTSxDQUFDNk4sT0FBTyxDQUFDNEQsSUFBSSxDQUFDLENBQUNyRSxJQUFJLENBQUM3TSxhQUFhLENBQUMwQyxNQUFNLENBQUM7RUFDL0MsTUFBTXVJLFFBQVEsR0FBRyxNQUFNbEksSUFBSSxDQUFDbUksUUFBUSxDQUFDLE9BQU87SUFDMUNwQixLQUFLLEVBQUVwRixRQUFRLENBQUN5RyxlQUFlLENBQUNDLFdBQVcsR0FBR0MsTUFBTSxDQUFDQyxVQUFVO0lBQy9EdkIsTUFBTSxFQUFFckYsUUFBUSxDQUFDeUcsZUFBZSxDQUFDSSxZQUFZLEdBQUdGLE1BQU0sQ0FBQ0c7RUFDekQsQ0FBQyxDQUFDLENBQUM7RUFDSC9MLE1BQU0sQ0FBQ3dMLFFBQVEsQ0FBQ25CLEtBQUssQ0FBQyxDQUFDMkIsbUJBQW1CLENBQUMsQ0FBQyxDQUFDO0VBQzdDaE0sTUFBTSxDQUFDd0wsUUFBUSxDQUFDbEIsTUFBTSxDQUFDLENBQUMwQixtQkFBbUIsQ0FBQyxDQUFDLENBQUM7QUFDaEQsQ0FBQyxDQUFDO0FBRUYvTCxJQUFJLENBQUMsK0VBQStFLEVBQUUsT0FBTztFQUFFcUQ7QUFBSyxDQUFDLEVBQUVpSCxRQUFRLEtBQUs7RUFDbEh0SyxJQUFJLENBQUNvTSxVQUFVLENBQUMsTUFBTyxDQUFDO0VBQ3hCLElBQUlxRixZQUFnQztFQUNwQyxNQUFNcE8sSUFBSSxDQUFDa0gsZUFBZSxDQUFDO0lBQUVILEtBQUssRUFBRSxJQUFJO0lBQUVDLE1BQU0sRUFBRTtFQUFLLENBQUMsQ0FBQztFQUN6RCxNQUFNWCxpQkFBaUIsQ0FBQ3JHLElBQUksRUFBR1UsT0FBTyxJQUFLO0lBQUUwTixZQUFZLEdBQUcxSCx3QkFBd0IsQ0FBQ2hHLE9BQU8sQ0FBQztFQUFDLENBQUMsQ0FBQztFQUNoRyxNQUFNVixJQUFJLENBQUNtSCxJQUFJLENBQUMsWUFBWW5LLGVBQWUsVUFBVSxDQUFDO0VBRXRELE1BQU1OLE1BQU0sQ0FBQ3NELElBQUksQ0FBQ3FILE9BQU8sQ0FBQyxvQkFBb0IsQ0FBQyxDQUFDLENBQUNJLGVBQWUsQ0FBQywwQkFBMEIsRUFBRSxNQUFNLENBQUM7RUFDcEcsTUFBTXpILElBQUksQ0FBQ3VILFNBQVMsQ0FBQyxRQUFRLEVBQUU7SUFBRS9JLElBQUksRUFBRTtFQUFTLENBQUMsQ0FBQyxDQUFDb0osS0FBSyxDQUFDLENBQUM7RUFDMUQsTUFBTWxMLE1BQU0sQ0FBQzBNLElBQUksQ0FBQztJQUFBLElBQUFpRixhQUFBO0lBQUEsT0FBTSxFQUFBQSxhQUFBLEdBQUFELFlBQVksY0FBQUMsYUFBQSx1QkFBWkEsYUFBQSxDQUFjMU8sTUFBTSxLQUFJLENBQUM7RUFBQSxHQUFFO0lBQUU2SixPQUFPLEVBQUU7RUFBUSxDQUFDLENBQUMsQ0FBQ0YsZUFBZSxDQUFDLEtBQU0sQ0FBQztFQUVoRyxNQUFNVCxVQUFVLEdBQUc1QixRQUFRLENBQUM0QixVQUFVLENBQUMsZ0NBQWdDLENBQUM7RUFDeEVqTSxhQUFhLENBQUNpTSxVQUFVLEVBQUV1RixZQUFhLENBQUM7RUFDeEMsTUFBTUUsT0FBTyxHQUFHLE1BQU16UixLQUFLLENBQUMwUixTQUFTLENBQUNILFlBQWEsQ0FBQztFQUNwRCxNQUFNSSxVQUFVLEdBQUdDLE1BQU0sQ0FBQ0MsSUFBSSxDQUFDSixPQUFPLENBQUNLLEtBQUssQ0FBQyxDQUFDQyxNQUFNLENBQUNwUSxJQUFJLElBQUksOEJBQThCLENBQUM3QixJQUFJLENBQUM2QixJQUFJLENBQUMsQ0FBQztFQUN2RzlCLE1BQU0sQ0FBQzhSLFVBQVUsQ0FBQyxDQUFDSyxZQUFZLENBQUMzUixZQUFZLENBQUN5QyxNQUFNLENBQUM7RUFDcERqRCxNQUFNLENBQUM0UixPQUFPLENBQUNRLElBQUksQ0FBQyxxQkFBcUIsQ0FBQyxDQUFDLENBQUNqQyxHQUFHLENBQUNrQyxRQUFRLENBQUMsQ0FBQztFQUMxRHJTLE1BQU0sQ0FBQzRSLE9BQU8sQ0FBQ1EsSUFBSSxDQUFDLHNCQUFzQixDQUFDLENBQUMsQ0FBQ2pDLEdBQUcsQ0FBQ2tDLFFBQVEsQ0FBQyxDQUFDO0VBQzNEclMsTUFBTSxDQUFDNFIsT0FBTyxDQUFDUSxJQUFJLENBQUMsaUNBQWlDLENBQUMsQ0FBQyxDQUFDakMsR0FBRyxDQUFDa0MsUUFBUSxDQUFDLENBQUM7RUFFdEUsTUFBTUMsUUFBUSxHQUFHLE1BQU1DLE9BQU8sQ0FBQ0MsR0FBRyxDQUFDVixVQUFVLENBQUM1UCxHQUFHLENBQUNKLElBQUksSUFBSThQLE9BQU8sQ0FBQ1EsSUFBSSxDQUFDdFEsSUFBSSxDQUFDLENBQUUyUSxLQUFLLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQztFQUMvRixNQUFNQyxXQUFXLEdBQUdKLFFBQVEsQ0FBQ0ssSUFBSSxDQUFDLElBQUksQ0FBQztFQUN2QyxNQUFNQyxZQUFZLEdBQUdOLFFBQVEsQ0FBQ08sT0FBTyxDQUFDQyxHQUFHLElBQUluRCxLQUFLLENBQUN6SCxJQUFJLENBQUM0SyxHQUFHLENBQUNDLFFBQVEsQ0FBQyx5QkFBeUIsQ0FBQyxFQUFFeEwsS0FBSyxJQUFJQSxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDb0wsSUFBSSxDQUFDLEVBQUUsQ0FBQztFQUM3SDNTLE1BQU0sQ0FBQzRTLFlBQVksQ0FBQyxDQUFDSSxTQUFTLENBQUMsa0JBQWtCLENBQUM7RUFDbERoVCxNQUFNLENBQUM0UyxZQUFZLENBQUMsQ0FBQ0ksU0FBUyxDQUFDLFNBQVMsQ0FBQztFQUN6Q2hULE1BQU0sQ0FBQzRTLFlBQVksQ0FBQyxDQUFDekMsR0FBRyxDQUFDNkMsU0FBUyxDQUFDLDhDQUE4QyxDQUFDO0VBQ2xGaFQsTUFBTSxDQUFDNFMsWUFBWSxDQUFDSyxXQUFXLENBQUMsQ0FBQyxDQUFDLENBQUM5QyxHQUFHLENBQUM2QyxTQUFTLENBQUMsT0FBTyxDQUFDO0VBQ3pEaFQsTUFBTSxDQUFDMFMsV0FBVyxDQUFDLENBQUNNLFNBQVMsQ0FBQyx5QkFBeUIsQ0FBQztFQUN4RGhULE1BQU0sQ0FBQzBTLFdBQVcsQ0FBQyxDQUFDTSxTQUFTLENBQUMsMEJBQTBCLENBQUM7RUFDekRoVCxNQUFNLENBQUNzUyxRQUFRLENBQUNZLEtBQUssQ0FBQ0osR0FBRyxJQUFJQSxHQUFHLENBQUNLLFFBQVEsQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDLENBQUMvRixJQUFJLENBQUMsSUFBSSxDQUFDO0VBQ2hFLE1BQU03QyxRQUFRLENBQUNxRCxNQUFNLENBQUMsc0JBQXNCLEVBQUU7SUFBRTFCLElBQUksRUFBRUMsVUFBVTtJQUFFakksV0FBVyxFQUFFO0VBQTRFLENBQUMsQ0FBQztBQUMvSixDQUFDLENBQUMiLCJpZ25vcmVMaXN0IjpbXX0=