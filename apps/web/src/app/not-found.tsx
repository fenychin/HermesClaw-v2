import Link from 'next/link';
import { Bot } from 'lucide-react';

export default function NotFound() {
  return (
    <html lang="zh-CN" className="dark">
      <body className="bg-background text-foreground min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="text-8xl font-bold text-zinc-800 mb-4">404</div>
          <div className="w-12 h-12 bg-primary/15 rounded-xl flex items-center justify-center mx-auto mb-4">
            <Bot className="w-6 h-6 text-primary" />
          </div>
          <h1 className="text-xl font-semibold mb-2">Hermes 找不到这个页面</h1>
          <p className="text-muted-foreground text-sm mb-6">
            这个页面不存在或已被移除
          </p>
          <Link
            href="/new"
            className="bg-primary hover:bg-primary/90 text-white px-5 py-2.5 rounded-xl text-sm transition-colors"
          >
            回到工作台
          </Link>
        </div>
      </body>
    </html>
  );
}
