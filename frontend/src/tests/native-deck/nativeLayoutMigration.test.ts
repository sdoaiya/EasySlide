import { describe, expect, it } from 'vitest'
import type { NativeLayoutContract } from '@/components/native-deck/NativeDeckPropertyPanel'
import { migrateNativeProps, selectThemeLayout } from '@/native-deck/nativeLayoutMigration'

const current: NativeLayoutContract = {
  layout: 'theme01_page040',
  theme: 'theme01',
  roles: ['process'],
  copyKeys: ['title', 'summary', 'image'],
  propShapes: { title: 'string', summary: 'string', image: 'media' },
  mediaSlots: [{ key: 'image', required: false }],
  defaultProps: { title: '模板标题', summary: '模板摘要', image: '' },
}

const sameRole: NativeLayoutContract = {
  layout: 'theme02_page007',
  theme: 'theme02',
  roles: ['process'],
  copyKeys: ['headline', 'body', 'heroImage'],
  propShapes: { headline: 'string', body: 'string', heroImage: 'media' },
  mediaSlots: [{ key: 'heroImage', required: false }],
  defaultProps: { headline: '示例标题', body: '示例正文', heroImage: '/assets/example.png' },
}

const sameNumberWrongRole: NativeLayoutContract = {
  ...sameRole,
  layout: 'theme02_page040',
  roles: ['cover'],
}

describe('native layout migration', () => {
  it('selects the same page role instead of the same page number', () => {
    expect(selectThemeLayout(current, [sameNumberWrongRole, sameRole])?.layout).toBe(sameRole.layout)
  })

  it('preserves text and media without leaking target template examples', () => {
    const migrated = migrateNativeProps(current, sameRole, {
      title: '真实路线图',
      summary: '真实项目内容',
      image: '/files/project/roadmap.png',
    })

    expect(migrated).toMatchObject({
      headline: '真实路线图',
      body: '真实项目内容',
      heroImage: '/files/project/roadmap.png',
    })
    expect(JSON.stringify(migrated)).not.toContain('示例')
    expect(JSON.stringify(migrated)).not.toContain('/assets/example.png')
  })

  it('keeps values that the target layout cannot display', () => {
    const target: NativeLayoutContract = { ...sameRole, copyKeys: ['headline'], propShapes: { headline: 'string' }, mediaSlots: [] }
    const migrated = migrateNativeProps(current, target, {
      title: '真实路线图',
      summary: '不能丢失的说明',
      image: '/files/project/roadmap.png',
    })

    expect(migrated.__unmapped_content).toEqual(expect.objectContaining({
      summary: '不能丢失的说明',
      image: '/files/project/roadmap.png',
    }))
  })

  it('preserves native metadata and removes unsupported animation values during layout switches', () => {
    const migrated = migrateNativeProps(current, sameRole, {
      title: '真实路线图',
      summary: '真实项目内容',
      __media_prompts: { image: '突出链路关系' },
      __design_intent: {
        mode: 'huashu_dashi_native',
        page_plan: { page_kind: 'process' },
      },
      __animation: {
        enter: 'fade',
        elementEnter: 'vanish',
        elementTrigger: 'manual',
        transition: 'cover',
        duration: 500,
        internal: false,
      },
    })

    expect(migrated.__media_prompts).toEqual({ image: '突出链路关系' })
    expect(migrated.__design_intent).toMatchObject({
      mode: 'huashu_dashi_native',
      page_plan: { page_kind: 'process' },
    })
    expect(migrated.__animation).toEqual({
      enter: 'fade',
      transition: 'cover',
      duration: 500,
      internal: false,
    })
  })

  it('does not migrate an object array into a string array with the same key', () => {
    const source: NativeLayoutContract = {
      ...current,
      propShapes: { phases: [{ heading: 'string', points: ['string'] }] },
      copyKeys: ['phases[].heading'],
      mediaSlots: [],
    }
    const target: NativeLayoutContract = {
      ...sameRole,
      propShapes: { phases: ['string'] },
      copyKeys: ['phases[]'],
      mediaSlots: [],
      defaultProps: { phases: [] },
    }
    const phases = [{ heading: '试点', points: ['验证'] }]

    const migrated = migrateNativeProps(source, target, { phases })

    expect(migrated.phases).toEqual([])
    expect(migrated.__unmapped_content).toEqual({ phases })
  })

  it('moves nested Dashi copy into a different nested copy contract by semantic fields', () => {
    const source: NativeLayoutContract = {
      ...current,
      layout: 'theme05_page006',
      theme: 'theme05',
      copyKeys: ['copy.title', 'copy.lead', 'copy.specs[].v'],
      propShapes: {
        copy: {
          title: 'string',
          lead: 'string',
          specs: [{ k: 'string', v: 'string' }],
        },
      },
      defaultProps: {
        copy: {
          title: '模板标题',
          lead: '模板说明',
          specs: [{ k: '模板', v: '模板值' }],
        },
      },
      mediaSlots: [],
    }
    const target: NativeLayoutContract = {
      ...sameRole,
      layout: 'theme08_page012',
      theme: 'theme08',
      copyKeys: ['copy.heading', 'copy.body', 'copy.cards[].value'],
      propShapes: {
        copy: {
          heading: 'string',
          body: 'string',
          cards: [{ label: 'string', value: 'string' }],
        },
      },
      defaultProps: {
        copy: {
          heading: '示例标题',
          body: '示例正文',
          cards: [{ label: '示例', value: '示例值' }],
        },
      },
      mediaSlots: [],
    }

    const migrated = migrateNativeProps(source, target, {
      copy: {
        title: '真实行业报告',
        lead: '真实市场判断',
        specs: [{ k: '规模', v: '970 亿美元' }],
      },
    })

    expect(migrated.copy).toMatchObject({
      heading: '真实行业报告',
      body: '真实市场判断',
      cards: [{ label: expect.any(String), value: '970 亿美元' }],
    })
    expect(JSON.stringify(migrated)).not.toContain('示例标题')
    expect(JSON.stringify(migrated)).not.toContain('示例正文')
  })
})
