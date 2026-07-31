import { test, expect } from '@playwright/test';
test.describe('Video export narration config', () => {
  test('sends narration strategy from the final export panel', async ({
    page
  }) => {
    const projectId = 'mock-video-export-config';
    let exportPayload = null;
    await page.route(url => new URL(url).pathname.startsWith('/api/'), async route => {
      const url = new URL(route.request().url());
      if (url.pathname === `/api/projects/${projectId}/export/video`) {
        exportPayload = route.request().postDataJSON();
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            data: {
              task_id: 'video-task-1'
            }
          })
        });
      }
      if (url.pathname === `/api/projects/${projectId}/export/video/preflight`) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            data: {
              can_export: true,
              errors: [],
              warnings: [],
              total_pages: 1,
              pages_with_narration: 1,
              missing_images: [],
              missing_narration: []
            }
          })
        });
      }
      if (url.pathname === `/api/projects/${projectId}/narrations`) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            data: {
              pages: [{
                page_id: 'p1',
                current_version_id: 'narration-version-p1',
                locked: false
              }]
            }
          })
        });
      }
      if (url.pathname === `/api/projects/${projectId}/tasks/video-task-1`) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            data: {
              task_id: 'video-task-1',
              status: 'RUNNING',
              progress: {
                total: 100,
                completed: 20
              }
            }
          })
        });
      }
      if (url.pathname === `/api/projects/${projectId}`) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            data: {
              project_id: projectId,
              id: projectId,
              idea_prompt: 'Nvidia annual report and roadmap',
              status: 'COMPLETED',
              template_style: 'default',
              export_allow_partial: true,
              pages: [{
                id: 'p1',
                page_id: 'p1',
                order_index: 0,
                generated_image_path: '/files/mock/1.png',
                outline_content: {
                  title: 'Revenue breakout',
                  points: ['AI', 'Data center']
                },
                description_content: {
                  text: 'Revenue keeps accelerating.'
                },
                status: 'COMPLETED'
              }]
            }
          })
        });
      }
      if (url.pathname === `/api/content-projects/${projectId}`) {
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
                id: 'spine-video-export-config',
                project_id: projectId,
                revision: 1,
                status: 'confirmed',
                content_hash: 'video-export-config-hash',
                document: {
                  topic: {
                    value: 'Nvidia annual report and roadmap'
                  },
                  sections: []
                }
              },
              workspaces: [{
                id: 'ppt-video-export-config',
                project_id: projectId,
                kind: 'ppt',
                state: 'confirmed',
                revision: 1,
                source_kind: 'legacy',
                settings: {}
              }]
            }
          })
        });
      }
      if (url.pathname === '/api/settings') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            data: {}
          })
        });
      }
      if (url.pathname === '/api/output-language') {
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
      if (url.pathname === '/api/user-templates') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            data: {
              templates: []
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
    await page.route('**/files/**', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'image/png',
        body: Buffer.alloc(100)
      });
    });
    await page.goto(`/project/${projectId}/preview`);
    await page.waitForFunction(() => document.body.innerText.length > 50, {
      timeout: 15000
    });
    await page.locator('button:has-text("导出")').first().click();
    await page.locator('button:has-text("导出为讲解视频")').click();
    await page.locator('select:has(option[value="confident corporate executive"])').selectOption('confident corporate executive');
    await page.locator('select:has(option[value="potential investors and venture capitalists"])').selectOption('potential investors and venture capitalists');
    await page.locator('select:has(option[value="inspiring, passionate, and persuasive"])').selectOption('inspiring, passionate, and persuasive');
    await page.locator('button:has-text("高级配置")').click();
    await page.locator('input[type="text"]').fill('our company 2025 annual financial report and 2026 strategic plan');
    await page.locator('input[type="number"]').nth(0).fill('80');
    await page.locator('input[type="number"]').nth(1).fill('140');
    await page.locator('button:has-text("开始导出")').click();
    await expect.poll(() => exportPayload).not.toBeNull();
    expect(exportPayload.generate_narration).toBe(false);
    expect(exportPayload.narration_policy).toBe('confirmed_only');
    expect(exportPayload.narration_version_map).toEqual({
      p1: 'narration-version-p1'
    });
    expect(exportPayload.presentation_topic).toBe('our company 2025 annual financial report and 2026 strategic plan');
    expect(exportPayload.narration_config).toMatchObject({
      speaker_persona: 'confident corporate executive',
      target_audience: 'potential investors and venture capitalists',
      speech_tone: 'inspiring, passionate, and persuasive',
      presentation_topic: 'our company 2025 annual financial report and 2026 strategic plan',
      min_words: 80,
      max_words: 140
    });
  });
});
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJ0ZXN0IiwiZXhwZWN0IiwiZGVzY3JpYmUiLCJwYWdlIiwicHJvamVjdElkIiwiZXhwb3J0UGF5bG9hZCIsInJvdXRlIiwidXJsIiwiVVJMIiwicGF0aG5hbWUiLCJzdGFydHNXaXRoIiwicmVxdWVzdCIsInBvc3REYXRhSlNPTiIsImZ1bGZpbGwiLCJzdGF0dXMiLCJjb250ZW50VHlwZSIsImJvZHkiLCJKU09OIiwic3RyaW5naWZ5Iiwic3VjY2VzcyIsImRhdGEiLCJ0YXNrX2lkIiwiY2FuX2V4cG9ydCIsImVycm9ycyIsIndhcm5pbmdzIiwidG90YWxfcGFnZXMiLCJwYWdlc193aXRoX25hcnJhdGlvbiIsIm1pc3NpbmdfaW1hZ2VzIiwibWlzc2luZ19uYXJyYXRpb24iLCJwYWdlcyIsInBhZ2VfaWQiLCJjdXJyZW50X3ZlcnNpb25faWQiLCJsb2NrZWQiLCJwcm9ncmVzcyIsInRvdGFsIiwiY29tcGxldGVkIiwicHJvamVjdF9pZCIsImlkIiwiaWRlYV9wcm9tcHQiLCJ0ZW1wbGF0ZV9zdHlsZSIsImV4cG9ydF9hbGxvd19wYXJ0aWFsIiwib3JkZXJfaW5kZXgiLCJnZW5lcmF0ZWRfaW1hZ2VfcGF0aCIsIm91dGxpbmVfY29udGVudCIsInRpdGxlIiwicG9pbnRzIiwiZGVzY3JpcHRpb25fY29udGVudCIsInRleHQiLCJsYXN0X3dvcmtzcGFjZSIsInBlbmRpbmdfc3luY19jb3VudCIsInNwaW5lIiwicmV2aXNpb24iLCJjb250ZW50X2hhc2giLCJkb2N1bWVudCIsInRvcGljIiwidmFsdWUiLCJzZWN0aW9ucyIsIndvcmtzcGFjZXMiLCJraW5kIiwic3RhdGUiLCJzb3VyY2Vfa2luZCIsInNldHRpbmdzIiwibGFuZ3VhZ2UiLCJ0ZW1wbGF0ZXMiLCJCdWZmZXIiLCJhbGxvYyIsImdvdG8iLCJ3YWl0Rm9yRnVuY3Rpb24iLCJpbm5lclRleHQiLCJsZW5ndGgiLCJ0aW1lb3V0IiwibG9jYXRvciIsImZpcnN0IiwiY2xpY2siLCJzZWxlY3RPcHRpb24iLCJmaWxsIiwibnRoIiwicG9sbCIsIm5vdCIsInRvQmVOdWxsIiwiZ2VuZXJhdGVfbmFycmF0aW9uIiwidG9CZSIsIm5hcnJhdGlvbl9wb2xpY3kiLCJuYXJyYXRpb25fdmVyc2lvbl9tYXAiLCJ0b0VxdWFsIiwicDEiLCJwcmVzZW50YXRpb25fdG9waWMiLCJuYXJyYXRpb25fY29uZmlnIiwidG9NYXRjaE9iamVjdCIsInNwZWFrZXJfcGVyc29uYSIsInRhcmdldF9hdWRpZW5jZSIsInNwZWVjaF90b25lIiwibWluX3dvcmRzIiwibWF4X3dvcmRzIl0sInNvdXJjZXMiOlsidmlkZW8tZXhwb3J0LW5hcnJhdGlvbi1jb25maWcuc3BlYy50cyJdLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyB0ZXN0LCBleHBlY3QgfSBmcm9tICdAcGxheXdyaWdodC90ZXN0J1xyXG5cclxudGVzdC5kZXNjcmliZSgnVmlkZW8gZXhwb3J0IG5hcnJhdGlvbiBjb25maWcnLCAoKSA9PiB7XHJcbiAgdGVzdCgnc2VuZHMgbmFycmF0aW9uIHN0cmF0ZWd5IGZyb20gdGhlIGZpbmFsIGV4cG9ydCBwYW5lbCcsIGFzeW5jICh7IHBhZ2UgfSkgPT4ge1xyXG4gICAgY29uc3QgcHJvamVjdElkID0gJ21vY2stdmlkZW8tZXhwb3J0LWNvbmZpZydcclxuICAgIGxldCBleHBvcnRQYXlsb2FkOiBhbnkgPSBudWxsXHJcblxyXG4gICAgYXdhaXQgcGFnZS5yb3V0ZSh1cmwgPT4gbmV3IFVSTCh1cmwpLnBhdGhuYW1lLnN0YXJ0c1dpdGgoJy9hcGkvJyksIGFzeW5jIChyb3V0ZSkgPT4ge1xyXG4gICAgICBjb25zdCB1cmwgPSBuZXcgVVJMKHJvdXRlLnJlcXVlc3QoKS51cmwoKSlcclxuXHJcbiAgICAgIGlmICh1cmwucGF0aG5hbWUgPT09IGAvYXBpL3Byb2plY3RzLyR7cHJvamVjdElkfS9leHBvcnQvdmlkZW9gKSB7XG4gICAgICAgIGV4cG9ydFBheWxvYWQgPSByb3V0ZS5yZXF1ZXN0KCkucG9zdERhdGFKU09OKClcbiAgICAgICAgcmV0dXJuIHJvdXRlLmZ1bGZpbGwoe1xuICAgICAgICAgIHN0YXR1czogMjAwLFxyXG4gICAgICAgICAgY29udGVudFR5cGU6ICdhcHBsaWNhdGlvbi9qc29uJyxcclxuICAgICAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHsgc3VjY2VzczogdHJ1ZSwgZGF0YTogeyB0YXNrX2lkOiAndmlkZW8tdGFzay0xJyB9IH0pLFxyXG4gICAgICAgIH0pXG4gICAgICB9XG5cbiAgICAgIGlmICh1cmwucGF0aG5hbWUgPT09IGAvYXBpL3Byb2plY3RzLyR7cHJvamVjdElkfS9leHBvcnQvdmlkZW8vcHJlZmxpZ2h0YCkge1xuICAgICAgICByZXR1cm4gcm91dGUuZnVsZmlsbCh7XG4gICAgICAgICAgc3RhdHVzOiAyMDAsXG4gICAgICAgICAgY29udGVudFR5cGU6ICdhcHBsaWNhdGlvbi9qc29uJyxcbiAgICAgICAgICBib2R5OiBKU09OLnN0cmluZ2lmeSh7XG4gICAgICAgICAgICBzdWNjZXNzOiB0cnVlLFxuICAgICAgICAgICAgZGF0YToge1xuICAgICAgICAgICAgICBjYW5fZXhwb3J0OiB0cnVlLFxuICAgICAgICAgICAgICBlcnJvcnM6IFtdLFxuICAgICAgICAgICAgICB3YXJuaW5nczogW10sXG4gICAgICAgICAgICAgIHRvdGFsX3BhZ2VzOiAxLFxuICAgICAgICAgICAgICBwYWdlc193aXRoX25hcnJhdGlvbjogMSxcbiAgICAgICAgICAgICAgbWlzc2luZ19pbWFnZXM6IFtdLFxuICAgICAgICAgICAgICBtaXNzaW5nX25hcnJhdGlvbjogW10sXG4gICAgICAgICAgICB9LFxuICAgICAgICAgIH0pLFxuICAgICAgICB9KVxuICAgICAgfVxuXG4gICAgICBpZiAodXJsLnBhdGhuYW1lID09PSBgL2FwaS9wcm9qZWN0cy8ke3Byb2plY3RJZH0vbmFycmF0aW9uc2ApIHtcbiAgICAgICAgcmV0dXJuIHJvdXRlLmZ1bGZpbGwoe1xuICAgICAgICAgIHN0YXR1czogMjAwLFxuICAgICAgICAgIGNvbnRlbnRUeXBlOiAnYXBwbGljYXRpb24vanNvbicsXG4gICAgICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkoe1xuICAgICAgICAgICAgc3VjY2VzczogdHJ1ZSxcbiAgICAgICAgICAgIGRhdGE6IHtcbiAgICAgICAgICAgICAgcGFnZXM6IFtcbiAgICAgICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgICBwYWdlX2lkOiAncDEnLFxuICAgICAgICAgICAgICAgICAgY3VycmVudF92ZXJzaW9uX2lkOiAnbmFycmF0aW9uLXZlcnNpb24tcDEnLFxuICAgICAgICAgICAgICAgICAgbG9ja2VkOiBmYWxzZSxcbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICBdLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICB9KSxcbiAgICAgICAgfSlcbiAgICAgIH1cblxuICAgICAgaWYgKHVybC5wYXRobmFtZSA9PT0gYC9hcGkvcHJvamVjdHMvJHtwcm9qZWN0SWR9L3Rhc2tzL3ZpZGVvLXRhc2stMWApIHtcbiAgICAgICAgcmV0dXJuIHJvdXRlLmZ1bGZpbGwoe1xyXG4gICAgICAgICAgc3RhdHVzOiAyMDAsXHJcbiAgICAgICAgICBjb250ZW50VHlwZTogJ2FwcGxpY2F0aW9uL2pzb24nLFxyXG4gICAgICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkoe1xyXG4gICAgICAgICAgICBzdWNjZXNzOiB0cnVlLFxyXG4gICAgICAgICAgICBkYXRhOiB7XHJcbiAgICAgICAgICAgICAgdGFza19pZDogJ3ZpZGVvLXRhc2stMScsXHJcbiAgICAgICAgICAgICAgc3RhdHVzOiAnUlVOTklORycsXHJcbiAgICAgICAgICAgICAgcHJvZ3Jlc3M6IHsgdG90YWw6IDEwMCwgY29tcGxldGVkOiAyMCB9LFxyXG4gICAgICAgICAgICB9LFxyXG4gICAgICAgICAgfSksXHJcbiAgICAgICAgfSlcclxuICAgICAgfVxyXG5cclxuICAgICAgaWYgKHVybC5wYXRobmFtZSA9PT0gYC9hcGkvcHJvamVjdHMvJHtwcm9qZWN0SWR9YCkge1xuICAgICAgICByZXR1cm4gcm91dGUuZnVsZmlsbCh7XG4gICAgICAgICAgc3RhdHVzOiAyMDAsXHJcbiAgICAgICAgICBjb250ZW50VHlwZTogJ2FwcGxpY2F0aW9uL2pzb24nLFxyXG4gICAgICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkoe1xyXG4gICAgICAgICAgICBzdWNjZXNzOiB0cnVlLFxyXG4gICAgICAgICAgICBkYXRhOiB7XHJcbiAgICAgICAgICAgICAgcHJvamVjdF9pZDogcHJvamVjdElkLFxyXG4gICAgICAgICAgICAgIGlkOiBwcm9qZWN0SWQsXHJcbiAgICAgICAgICAgICAgaWRlYV9wcm9tcHQ6ICdOdmlkaWEgYW5udWFsIHJlcG9ydCBhbmQgcm9hZG1hcCcsXHJcbiAgICAgICAgICAgICAgc3RhdHVzOiAnQ09NUExFVEVEJyxcclxuICAgICAgICAgICAgICB0ZW1wbGF0ZV9zdHlsZTogJ2RlZmF1bHQnLFxyXG4gICAgICAgICAgICAgIGV4cG9ydF9hbGxvd19wYXJ0aWFsOiB0cnVlLFxyXG4gICAgICAgICAgICAgIHBhZ2VzOiBbXHJcbiAgICAgICAgICAgICAgICB7XHJcbiAgICAgICAgICAgICAgICAgIGlkOiAncDEnLFxyXG4gICAgICAgICAgICAgICAgICBwYWdlX2lkOiAncDEnLFxyXG4gICAgICAgICAgICAgICAgICBvcmRlcl9pbmRleDogMCxcclxuICAgICAgICAgICAgICAgICAgZ2VuZXJhdGVkX2ltYWdlX3BhdGg6ICcvZmlsZXMvbW9jay8xLnBuZycsXHJcbiAgICAgICAgICAgICAgICAgIG91dGxpbmVfY29udGVudDogeyB0aXRsZTogJ1JldmVudWUgYnJlYWtvdXQnLCBwb2ludHM6IFsnQUknLCAnRGF0YSBjZW50ZXInXSB9LFxyXG4gICAgICAgICAgICAgICAgICBkZXNjcmlwdGlvbl9jb250ZW50OiB7IHRleHQ6ICdSZXZlbnVlIGtlZXBzIGFjY2VsZXJhdGluZy4nIH0sXHJcbiAgICAgICAgICAgICAgICAgIHN0YXR1czogJ0NPTVBMRVRFRCcsXHJcbiAgICAgICAgICAgICAgICB9LFxyXG4gICAgICAgICAgICAgIF0sXHJcbiAgICAgICAgICAgIH0sXHJcbiAgICAgICAgICB9KSxcclxuICAgICAgICB9KVxuICAgICAgfVxuXG4gICAgICBpZiAodXJsLnBhdGhuYW1lID09PSBgL2FwaS9jb250ZW50LXByb2plY3RzLyR7cHJvamVjdElkfWApIHtcbiAgICAgICAgcmV0dXJuIHJvdXRlLmZ1bGZpbGwoe1xuICAgICAgICAgIHN0YXR1czogMjAwLFxuICAgICAgICAgIGNvbnRlbnRUeXBlOiAnYXBwbGljYXRpb24vanNvbicsXG4gICAgICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkoe1xuICAgICAgICAgICAgc3VjY2VzczogdHJ1ZSxcbiAgICAgICAgICAgIGRhdGE6IHtcbiAgICAgICAgICAgICAgcHJvamVjdF9pZDogcHJvamVjdElkLFxuICAgICAgICAgICAgICBsYXN0X3dvcmtzcGFjZTogJ3BwdCcsXG4gICAgICAgICAgICAgIHBlbmRpbmdfc3luY19jb3VudDogMCxcbiAgICAgICAgICAgICAgc3BpbmU6IHtcbiAgICAgICAgICAgICAgICBpZDogJ3NwaW5lLXZpZGVvLWV4cG9ydC1jb25maWcnLFxuICAgICAgICAgICAgICAgIHByb2plY3RfaWQ6IHByb2plY3RJZCxcbiAgICAgICAgICAgICAgICByZXZpc2lvbjogMSxcbiAgICAgICAgICAgICAgICBzdGF0dXM6ICdjb25maXJtZWQnLFxuICAgICAgICAgICAgICAgIGNvbnRlbnRfaGFzaDogJ3ZpZGVvLWV4cG9ydC1jb25maWctaGFzaCcsXG4gICAgICAgICAgICAgICAgZG9jdW1lbnQ6IHtcbiAgICAgICAgICAgICAgICAgIHRvcGljOiB7IHZhbHVlOiAnTnZpZGlhIGFubnVhbCByZXBvcnQgYW5kIHJvYWRtYXAnIH0sXG4gICAgICAgICAgICAgICAgICBzZWN0aW9uczogW10sXG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgd29ya3NwYWNlczogW1xuICAgICAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICAgIGlkOiAncHB0LXZpZGVvLWV4cG9ydC1jb25maWcnLFxuICAgICAgICAgICAgICAgICAgcHJvamVjdF9pZDogcHJvamVjdElkLFxuICAgICAgICAgICAgICAgICAga2luZDogJ3BwdCcsXG4gICAgICAgICAgICAgICAgICBzdGF0ZTogJ2NvbmZpcm1lZCcsXG4gICAgICAgICAgICAgICAgICByZXZpc2lvbjogMSxcbiAgICAgICAgICAgICAgICAgIHNvdXJjZV9raW5kOiAnbGVnYWN5JyxcbiAgICAgICAgICAgICAgICAgIHNldHRpbmdzOiB7fSxcbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICBdLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICB9KSxcbiAgICAgICAgfSlcbiAgICAgIH1cblxuICAgICAgaWYgKHVybC5wYXRobmFtZSA9PT0gJy9hcGkvc2V0dGluZ3MnKSB7XG4gICAgICAgIHJldHVybiByb3V0ZS5mdWxmaWxsKHsgc3RhdHVzOiAyMDAsIGNvbnRlbnRUeXBlOiAnYXBwbGljYXRpb24vanNvbicsIGJvZHk6IEpTT04uc3RyaW5naWZ5KHsgc3VjY2VzczogdHJ1ZSwgZGF0YToge30gfSkgfSlcclxuICAgICAgfVxyXG4gICAgICBpZiAodXJsLnBhdGhuYW1lID09PSAnL2FwaS9vdXRwdXQtbGFuZ3VhZ2UnKSB7XHJcbiAgICAgICAgcmV0dXJuIHJvdXRlLmZ1bGZpbGwoeyBzdGF0dXM6IDIwMCwgY29udGVudFR5cGU6ICdhcHBsaWNhdGlvbi9qc29uJywgYm9keTogSlNPTi5zdHJpbmdpZnkoeyBzdWNjZXNzOiB0cnVlLCBkYXRhOiB7IGxhbmd1YWdlOiAnemgnIH0gfSkgfSlcclxuICAgICAgfVxyXG4gICAgICBpZiAodXJsLnBhdGhuYW1lID09PSAnL2FwaS91c2VyLXRlbXBsYXRlcycpIHtcclxuICAgICAgICByZXR1cm4gcm91dGUuZnVsZmlsbCh7IHN0YXR1czogMjAwLCBjb250ZW50VHlwZTogJ2FwcGxpY2F0aW9uL2pzb24nLCBib2R5OiBKU09OLnN0cmluZ2lmeSh7IHN1Y2Nlc3M6IHRydWUsIGRhdGE6IHsgdGVtcGxhdGVzOiBbXSB9IH0pIH0pXHJcbiAgICAgIH1cclxuXHJcbiAgICAgIHJldHVybiByb3V0ZS5mdWxmaWxsKHsgc3RhdHVzOiAyMDAsIGNvbnRlbnRUeXBlOiAnYXBwbGljYXRpb24vanNvbicsIGJvZHk6IEpTT04uc3RyaW5naWZ5KHsgc3VjY2VzczogdHJ1ZSwgZGF0YToge30gfSkgfSlcclxuICAgIH0pXHJcblxyXG4gICAgYXdhaXQgcGFnZS5yb3V0ZSgnKiovZmlsZXMvKionLCBhc3luYyAocm91dGUpID0+IHtcclxuICAgICAgYXdhaXQgcm91dGUuZnVsZmlsbCh7IHN0YXR1czogMjAwLCBjb250ZW50VHlwZTogJ2ltYWdlL3BuZycsIGJvZHk6IEJ1ZmZlci5hbGxvYygxMDApIH0pXHJcbiAgICB9KVxyXG5cclxuICAgIGF3YWl0IHBhZ2UuZ290byhgL3Byb2plY3QvJHtwcm9qZWN0SWR9L3ByZXZpZXdgKVxyXG4gICAgYXdhaXQgcGFnZS53YWl0Rm9yRnVuY3Rpb24oKCkgPT4gZG9jdW1lbnQuYm9keS5pbm5lclRleHQubGVuZ3RoID4gNTAsIHsgdGltZW91dDogMTUwMDAgfSlcclxuXHJcbiAgICBhd2FpdCBwYWdlLmxvY2F0b3IoJ2J1dHRvbjpoYXMtdGV4dChcIuWvvOWHulwiKScpLmZpcnN0KCkuY2xpY2soKVxyXG4gICAgYXdhaXQgcGFnZS5sb2NhdG9yKCdidXR0b246aGFzLXRleHQoXCLlr7zlh7rkuLrorrLop6Pop4bpopFcIiknKS5jbGljaygpXHJcblxyXG4gICAgYXdhaXQgcGFnZS5sb2NhdG9yKCdzZWxlY3Q6aGFzKG9wdGlvblt2YWx1ZT1cImNvbmZpZGVudCBjb3Jwb3JhdGUgZXhlY3V0aXZlXCJdKScpLnNlbGVjdE9wdGlvbignY29uZmlkZW50IGNvcnBvcmF0ZSBleGVjdXRpdmUnKVxuICAgIGF3YWl0IHBhZ2UubG9jYXRvcignc2VsZWN0OmhhcyhvcHRpb25bdmFsdWU9XCJwb3RlbnRpYWwgaW52ZXN0b3JzIGFuZCB2ZW50dXJlIGNhcGl0YWxpc3RzXCJdKScpLnNlbGVjdE9wdGlvbigncG90ZW50aWFsIGludmVzdG9ycyBhbmQgdmVudHVyZSBjYXBpdGFsaXN0cycpXG4gICAgYXdhaXQgcGFnZS5sb2NhdG9yKCdzZWxlY3Q6aGFzKG9wdGlvblt2YWx1ZT1cImluc3BpcmluZywgcGFzc2lvbmF0ZSwgYW5kIHBlcnN1YXNpdmVcIl0pJykuc2VsZWN0T3B0aW9uKCdpbnNwaXJpbmcsIHBhc3Npb25hdGUsIGFuZCBwZXJzdWFzaXZlJylcbiAgICBhd2FpdCBwYWdlLmxvY2F0b3IoJ2J1dHRvbjpoYXMtdGV4dChcIumrmOe6p+mFjee9rlwiKScpLmNsaWNrKClcbiAgICBhd2FpdCBwYWdlLmxvY2F0b3IoJ2lucHV0W3R5cGU9XCJ0ZXh0XCJdJykuZmlsbCgnb3VyIGNvbXBhbnkgMjAyNSBhbm51YWwgZmluYW5jaWFsIHJlcG9ydCBhbmQgMjAyNiBzdHJhdGVnaWMgcGxhbicpXG4gICAgYXdhaXQgcGFnZS5sb2NhdG9yKCdpbnB1dFt0eXBlPVwibnVtYmVyXCJdJykubnRoKDApLmZpbGwoJzgwJylcclxuICAgIGF3YWl0IHBhZ2UubG9jYXRvcignaW5wdXRbdHlwZT1cIm51bWJlclwiXScpLm50aCgxKS5maWxsKCcxNDAnKVxyXG4gICAgYXdhaXQgcGFnZS5sb2NhdG9yKCdidXR0b246aGFzLXRleHQoXCLlvIDlp4vlr7zlh7pcIiknKS5jbGljaygpXG5cclxuICAgIGF3YWl0IGV4cGVjdC5wb2xsKCgpID0+IGV4cG9ydFBheWxvYWQpLm5vdC50b0JlTnVsbCgpXHJcbiAgICBleHBlY3QoZXhwb3J0UGF5bG9hZC5nZW5lcmF0ZV9uYXJyYXRpb24pLnRvQmUoZmFsc2UpXG4gICAgZXhwZWN0KGV4cG9ydFBheWxvYWQubmFycmF0aW9uX3BvbGljeSkudG9CZSgnY29uZmlybWVkX29ubHknKVxuICAgIGV4cGVjdChleHBvcnRQYXlsb2FkLm5hcnJhdGlvbl92ZXJzaW9uX21hcCkudG9FcXVhbCh7IHAxOiAnbmFycmF0aW9uLXZlcnNpb24tcDEnIH0pXG4gICAgZXhwZWN0KGV4cG9ydFBheWxvYWQucHJlc2VudGF0aW9uX3RvcGljKS50b0JlKCdvdXIgY29tcGFueSAyMDI1IGFubnVhbCBmaW5hbmNpYWwgcmVwb3J0IGFuZCAyMDI2IHN0cmF0ZWdpYyBwbGFuJylcclxuICAgIGV4cGVjdChleHBvcnRQYXlsb2FkLm5hcnJhdGlvbl9jb25maWcpLnRvTWF0Y2hPYmplY3Qoe1xyXG4gICAgICBzcGVha2VyX3BlcnNvbmE6ICdjb25maWRlbnQgY29ycG9yYXRlIGV4ZWN1dGl2ZScsXHJcbiAgICAgIHRhcmdldF9hdWRpZW5jZTogJ3BvdGVudGlhbCBpbnZlc3RvcnMgYW5kIHZlbnR1cmUgY2FwaXRhbGlzdHMnLFxyXG4gICAgICBzcGVlY2hfdG9uZTogJ2luc3BpcmluZywgcGFzc2lvbmF0ZSwgYW5kIHBlcnN1YXNpdmUnLFxyXG4gICAgICBwcmVzZW50YXRpb25fdG9waWM6ICdvdXIgY29tcGFueSAyMDI1IGFubnVhbCBmaW5hbmNpYWwgcmVwb3J0IGFuZCAyMDI2IHN0cmF0ZWdpYyBwbGFuJyxcclxuICAgICAgbWluX3dvcmRzOiA4MCxcclxuICAgICAgbWF4X3dvcmRzOiAxNDAsXHJcbiAgICB9KVxyXG4gIH0pXHJcbn0pXHJcbiJdLCJtYXBwaW5ncyI6IkFBQUEsU0FBU0EsSUFBSSxFQUFFQyxNQUFNLFFBQVEsa0JBQWtCO0FBRS9DRCxJQUFJLENBQUNFLFFBQVEsQ0FBQywrQkFBK0IsRUFBRSxNQUFNO0VBQ25ERixJQUFJLENBQUMsc0RBQXNELEVBQUUsT0FBTztJQUFFRztFQUFLLENBQUMsS0FBSztJQUMvRSxNQUFNQyxTQUFTLEdBQUcsMEJBQTBCO0lBQzVDLElBQUlDLGFBQWtCLEdBQUcsSUFBSTtJQUU3QixNQUFNRixJQUFJLENBQUNHLEtBQUssQ0FBQ0MsR0FBRyxJQUFJLElBQUlDLEdBQUcsQ0FBQ0Qs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