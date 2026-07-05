import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

describe('local workspace copy avoids login UI language', () => {
  it('uses connection wording instead of login wording in visible local-mode prompts', () => {
    const visibleCopySources = [
      source('src/pages/Settings.tsx'),
      source('src/components/shared/ExportTasksPanel.tsx'),
      source('src/utils/index.ts'),
    ].join('\n');

    expect(visibleCopySources).not.toContain('登录或注册账号');
    expect(visibleCopySources).not.toContain('已经登录 OpenAI');
    expect(visibleCopySources).not.toContain('重新登录 OpenAI 账号');
    expect(visibleCopySources).not.toContain('重新连接 OpenAI 账号');
    expect(visibleCopySources).not.toContain('OpenAI 账号连接');
    expect(visibleCopySources).not.toContain('OpenAI account via OAuth');
    expect(visibleCopySources).not.toContain('reconnect your OpenAI account');
    expect(visibleCopySources).not.toContain('Codex 登录过期');
    expect(visibleCopySources).not.toContain('After logging in');
    expect(visibleCopySources).not.toContain('Your Codex login');
    expect(visibleCopySources).not.toContain('already logged in OpenAI');
  });
});
