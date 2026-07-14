import { afterEach, describe, expect, it, vi } from 'vitest'

describe('DashiAI runtime image URLs', () => {
  afterEach(() => {
    delete (window as Window & { electronAPI?: unknown }).electronAPI
    vi.resetModules()
  })

  it('resolves /files props through the desktop backend without changing assets', async () => {
    Object.defineProperty(window, 'electronAPI', { configurable: true, value: {} })
    const { resolveDashiAssetProps, resolveDashiAssetUrl } = await import('@/native-deck/dashiRuntimeEffects')

    expect(resolveDashiAssetProps({ image: '/files/generated/cover.png' })).toEqual({
      image: 'http://127.0.0.1:5011/files/generated/cover.png',
    })
    expect(resolveDashiAssetUrl('assets/3d/08.png')).toMatch(/^http:\/\/localhost:\d+\/assets\/3d\/08\.png$/)
  })
})
