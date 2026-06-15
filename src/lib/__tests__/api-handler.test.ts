import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

describe('Architecture Boundary Safeguard Test', () => {
  const libDir = path.resolve(__dirname, '..');

  it('should verify that src/lib/api-handler.ts has been deleted to prevent confusion', () => {
    const apiHandlerPath = path.join(libDir, 'api-handler.ts');
    const exists = fs.existsSync(apiHandlerPath);
    expect(exists).toBe(false);
  });

  it('should guarantee no files in src/lib (root) import from src/lib/server', () => {
    // 获取 src/lib 下的第一级文件（不扫描子文件夹，如 server, models, industry-pack-sdk）
    const items = fs.readdirSync(libDir);
    const filesToScan = items.filter(item => {
      const fullPath = path.join(libDir, item);
      const stat = fs.statSync(fullPath);
      // 仅检查 .ts 和 .tsx 结尾的文件
      return stat.isFile() && (item.endsWith('.ts') || item.endsWith('.tsx'));
    });

    const violations: string[] = [];

    // 正则表达式用于匹配限制的导入格式
    const restrictedImportRegex = /(from\s+['"]([^'"]*\/lib\/server\/|[^'"]*\/server\/|[^'"]*\.\.\/server[^'"]*)['"])|(import\s+['"]([^'"]*\/lib\/server\/|[^'"]*\/server\/|[^'"]*\.\.\/server[^'"]*)['"])/;

    for (const file of filesToScan) {
      const filePath = path.join(libDir, file);
      const content = fs.readFileSync(filePath, 'utf-8');
      const lines = content.split('\n');

      lines.forEach((line, idx) => {
        // 跳过注释行
        const trimmed = line.trim();
        if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) {
          return;
        }

        if (restrictedImportRegex.test(line)) {
          violations.push(`${file}:${idx + 1} -> ${line.trim()}`);
        }
      });
    }

    // 期望违规列表为空
    expect(violations).toEqual([]);
  });
});
