
import { Copy, Check, RotateCcw, Save, Download, CheckCircle } from 'lucide-react'
import { useClipboard } from '@/hooks/use-clipboard'


interface LetterPreviewProps {
  subject: string
  body: string
  isCompleted?: boolean
  onChangeBody?: (val: string) => void
  onConfirm?: () => void
  onRegenerate?: () => void
}

export function LetterPreview({
  subject,
  body,
  isCompleted,
  onChangeBody,
  onConfirm,
  onRegenerate
}: LetterPreviewProps) {
  const { copied: subjectCopied, copy: copySubject } = useClipboard()
  const { copied: bodyCopied, copy: copyBody } = useClipboard()

  const handleExport = () => {
    const text = `Subject: ${subject}\n\n${body}`
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = '开发信.txt'
    a.click()
    URL.revokeObjectURL(url)
  }

  if (isCompleted) {
    return (
      <div className="bg-success/10 rounded-2xl p-6 flex flex-col items-center justify-center text-center space-y-4 border border-success/20">
        <CheckCircle className="size-10 text-success" />
        <div className="space-y-1">
          <p className="text-success font-medium text-lg">开发信已就绪，可直接复制发送</p>
          <p className="text-success/80 text-sm">您现在可以将内容复制到您的邮件客户端中</p>
        </div>
        <button
          onClick={() => copyBody(body)}
          className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-success text-white hover:bg-success/90 transition-colors text-sm font-medium shadow-sm"
        >
          {bodyCopied ? <Check className="size-4" /> : <Copy className="size-4" />}
          {bodyCopied ? '已复制' : '复制全文'}
        </button>
      </div>
    )
  }

  return (
    <div className="bg-card rounded-2xl border border-border p-6 space-y-4 shadow-sm mb-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <p className="text-hint text-[10px] font-semibold uppercase tracking-wider mb-1">邮件主题</p>
          <h3 className="text-foreground font-semibold text-base truncate">
            {subject}
          </h3>
        </div>
        <button
          onClick={() => copySubject(subject)}
          className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border hover:bg-muted/50 transition-colors text-xs font-medium"
        >
          {subjectCopied ? <Check className="size-3.5 text-success" /> : <Copy className="size-3.5 text-muted-foreground" />}
          {subjectCopied ? '已复制' : '复制主题'}
        </button>
      </div>

      <div className="relative">
        <textarea
          rows={15}
          value={body}
          onChange={(e) => onChangeBody?.(e.target.value)}
          className="w-full bg-background rounded-xl p-5 text-foreground text-sm leading-7 font-mono border border-border focus:outline-none focus:border-primary/50 transition-colors resize-y"
          placeholder="正在生成邮件正文..."
        />
      </div>

      <div className="flex items-center justify-between pt-2">
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={() => copyBody(body)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-card hover:bg-muted/50 transition-colors text-xs font-medium"
          >
            {bodyCopied ? <Check className="size-3.5 text-success" /> : <Copy className="size-3.5 text-muted-foreground" />}
            {bodyCopied ? '已复制' : '复制全文'}
          </button>
          
          <button
            onClick={onRegenerate}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-card hover:bg-muted/50 transition-colors text-xs font-medium"
          >
            <RotateCcw className="size-3.5 text-muted-foreground" />
            重新生成
          </button>
          
          <button
            onClick={handleExport}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-card hover:bg-muted/50 transition-colors text-xs font-medium"
          >
            <Download className="size-3.5 text-muted-foreground" />
            导出 .txt
          </button>
          
          <button
            onClick={() => { /* Mock save template */ }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors text-xs font-medium"
          >
            <Save className="size-3.5" />
            保存为模板
          </button>
        </div>

        <button
          onClick={onConfirm}
          className="px-6 py-2 rounded-xl bg-primary text-white text-sm font-medium hover:bg-primary/90 active:scale-95 transition-all shadow-sm shrink-0 ml-4"
        >
          确认使用
        </button>
      </div>
    </div>
  )
}
