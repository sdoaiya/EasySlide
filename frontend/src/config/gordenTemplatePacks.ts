import { getStaticAssetUrl } from '@/api/client'

export type GordenTemplatePack = {
  id: string
  slug: string
  name: string
  pageCount: number
  aspectRatio: '16:9'
  style: string
  tags: string[]
  colors: string[]
  preview: string
  thumb: string
  reference: string
  referenceMode: 'rendered-role-slides'
  fallbackRole: 'content'
}

const pack = (slug: string, name: string, pageCount: number, style: string, tags: string[], colors: string[]): GordenTemplatePack => ({
  id: `gorden-${slug}`,
  slug,
  name,
  pageCount,
  aspectRatio: '16:9',
  style,
  tags,
  colors,
  preview: getStaticAssetUrl(`/template-packs/gorden/${slug}/preview.png`),
  thumb: getStaticAssetUrl(`/template-packs/gorden/${slug}/thumb.webp`),
  reference: getStaticAssetUrl(`/template-packs/gorden/${slug}/reference.webp`),
  referenceMode: 'rendered-role-slides',
  fallbackRole: 'content',
})

export const GORDEN_TEMPLATE_PACKS: GordenTemplatePack[] = [
  pack('minimal-business-summary', '简约商务总结汇报', 16, '极简商务、深蓝白、留白充足、章节清晰', ['商务汇报', '年度总结'], ['#485275', '#FFFFFF']),
  pack('red-patriot-youth', '新时代新青年红色教育', 16, '庄重党政红、金色点缀、飘带与传统文化元素', ['党政教育', '思政课件'], ['#A91F1F', '#D4A72C']),
  pack('cute-orange-class', '橙色可爱卡通教学', 17, '暖橙卡通、手绘插画、亲和活泼、适合教学场景', ['教学培训', '少儿课件'], ['#F5C97E', '#FFFFFF']),
  pack('quarterly-illust', '蓝灰酸性插画季度总结', 19, 'Y2K 酸性设计、蓝色强调、黑白插画、互联网感', ['互联网', '季度总结'], ['#4F4FFF', '#111111']),
  pack('geometric-summary', '多彩几何工作总结', 21, '多彩几何切片、强对比、活力、结构化数字视觉', ['工作总结', '活力风格'], ['#2E6BFF', '#EF4444', '#F4C542', '#28A269']),
  pack('red-patriot-general', '红色爱国主题教育通用', 25, '党政红、金色书法、绸缎飘带、庄重正式', ['党政教育', '主题党日'], ['#A8181C', '#D8A33B']),
  pack('red-teaching-framework', '高级红色教学实施框架', 30, '满版红色教学图解、逻辑链路清晰、正式密集', ['教学比赛', '教学设计'], ['#C00000', '#F28C28']),
  pack('red-teaching-models', '高级红色数智教学图解', 30, '红色数智教学、漏斗齿轮鱼骨放射等图解', ['教学改革', '图解课件'], ['#C00000', '#6B3FA0']),
  pack('thesis-novice', '多专业开题方法论库', 32, '墨绿学术、方法论结构、克制稳重、内容密度适中', ['开题答辩', '学术汇报'], ['#4F6E4F', '#F7F7F2']),
  pack('premium-corp', '高级感大厂 PPT 合辑', 35, '高级大厂风、酱红与深蓝灰、战略与运营表达', ['商务提案', '战略汇报'], ['#A52524', '#263238']),
  pack('architecture-deck', '领导爱的架构图合辑', 37, '深蓝架构图、系统拓扑、流程关系、企业技术表达', ['架构方案', '技术汇报'], ['#1F3A93', '#FFFFFF']),
  pack('mckinsey-style', '麦肯锡风专业模板', 37, '咨询逻辑、金字塔结构、漏斗与对比、专业克制', ['咨询分析', '战略分析'], ['#8B2E2E', '#27364B']),
  pack('report-massive-models', '汇报合辑·思维模型与复盘', 38, '深蓝商务、SWOT、PDCA、鱼骨与复盘图解', ['思维模型', '项目复盘'], ['#1E3A5F', '#FFFFFF']),
  pack('report-massive-charts', '汇报合辑·数据图表与业绩', 38, '深蓝数据汇报、漏斗树状齿轮、财务与销售分析', ['数据汇报', '业绩分析'], ['#1E3A5F', '#4F7CAC']),
  pack('thesis-formula', '开题报告万能公式', 39, '暖米色学术、深蓝文字、背景意义现状方法结构', ['开题答辩', '论文汇报'], ['#F6F0DC', '#243B64']),
  pack('top-thesis', '名校开题报告合辑', 39, '酒红学术、正式稳重、章节公式清晰', ['开题答辩', '学术汇报'], ['#7A2B22', '#F1E8D7']),
  pack('data-viz-deck', '数据可视化合辑', 41, '深蓝与砖红数据视觉、图表密集、指标表达清晰', ['数据可视化', '经营分析'], ['#2C3E70', '#B85C4A']),
  pack('report-massive-reports', '汇报合辑·工作汇报与竞聘', 37, '深蓝商务、工作汇报、竞聘与金字塔逻辑', ['工作汇报', '竞聘述职'], ['#1E3A5F', '#FFFFFF']),
  pack('report-savior', '汇报救命合辑', 44, '深蓝与亮红、商业汇报全场景、逻辑图解丰富', ['商业汇报', '综合提案'], ['#1F3A93', '#E24A4A']),
  pack('operations-deck', '运营 PPT 合辑', 52, '深蓝亮蓝、运营全场景、私域产品与数据看板', ['运营产品', '互联网汇报'], ['#1F3A93', '#2E9BFF']),
  pack('competition-speech', '竞聘述职合辑', 59, '深蓝砖红、竞聘述职、项目复盘、逻辑模型完整', ['竞聘述职', '晋升答辩'], ['#1B3464', '#B85C4A']),
]

export function findGordenTemplatePack(templateId: string | null | undefined) {
  return GORDEN_TEMPLATE_PACKS.find((template) => template.id === templateId)
}

export function isGordenTemplateId(templateId: string | null | undefined): boolean {
  return Boolean(templateId && templateId.startsWith('gorden-'))
}
