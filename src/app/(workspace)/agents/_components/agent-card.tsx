import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface AgentCardProps {
  id: string;
  name: string;
  role: string;
  status: 'active' | 'idle' | 'error';
  tags: string[];
  taskCount: number;
  isBuiltIn: boolean;
}

export function AgentCard({
  name,
  role,
  status,
  tags,
  taskCount,
  isBuiltIn
}: AgentCardProps) {
  // 获取状态对应的颜色类和文案
  const getStatusDisplay = (s: string) => {
    switch (s) {
      case 'active':
        return { label: '活跃', className: 'bg-success/10 text-success border-success/20' };
      case 'idle':
        return { label: '空闲', className: 'bg-muted/10 text-muted-foreground border-border' };
      case 'error':
        return { label: '异常', className: 'bg-danger/10 text-danger border-danger/20' };
      default:
        return { label: '未知', className: 'bg-muted/10 text-muted-foreground border-border' };
    }
  };

  const statusDisplay = getStatusDisplay(status);

  // 首字母头像
  const initial = name.charAt(0);

  return (
    <div className="bg-card rounded-2xl border border-border p-5 hover:border-primary/40 transition-all flex flex-col gap-4">
      {/* 顶部：头像 + 基础信息 + 状态 */}
      <div className="flex justify-between items-start">
        <div className="flex items-center gap-3">
          <div className="flex-shrink-0 w-10 h-10 rounded-2xl bg-primary/20 flex items-center justify-center text-primary font-bold">
            {initial}
          </div>
          <div className="flex flex-col">
            <div className="flex items-center gap-2">
              <span className="text-foreground font-medium text-sm">{name}</span>
              {isBuiltIn && (
                <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-md leading-none">
                  官方
                </span>
              )}
            </div>
            <span className="text-muted-foreground text-xs">{role}</span>
          </div>
        </div>
        <Badge variant="outline" className={statusDisplay.className}>
          {statusDisplay.label}
        </Badge>
      </div>

      {/* 中部：技能标签 */}
      <div className="flex flex-wrap gap-2">
        {tags.map((tag) => (
          <span key={tag} className="bg-primary/10 text-primary rounded-lg px-2 py-0.5 text-xs">
            {tag}
          </span>
        ))}
      </div>

      {/* 底部：任务数 + 操作 */}
      <div className="flex items-end justify-between mt-auto pt-2">
        <div className="text-hint text-xs">
          已完成 {taskCount} 项任务
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="bg-card border-border h-8 text-xs">
            详情
          </Button>
          <Button size="sm" className="bg-primary text-primary-foreground hover:bg-primary/90 h-8 text-xs">
            对话
          </Button>
        </div>
      </div>
    </div>
  );
}
