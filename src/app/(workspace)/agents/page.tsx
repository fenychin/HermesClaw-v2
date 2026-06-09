import { PageHeader } from "@/components/common/page-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AgentCard } from "./_components/agent-card";
import { mockAgents } from "./_data/mock-agents";
import { NewAgentDialog } from "./_components/new-agent-dialog";

export default function AgentsPage() {
  const builtInAgents = mockAgents.filter(a => a.isBuiltIn);
  const customAgents = mockAgents.filter(a => !a.isBuiltIn);

  return (
    <div className="w-full max-w-7xl mx-auto py-6 px-6">
      <PageHeader 
        title="智能体" 
        actions={<NewAgentDialog />}
      />

      <Tabs defaultValue="all" className="w-full mt-4">
        <TabsList className="mb-6">
          <TabsTrigger value="all">全部</TabsTrigger>
          <TabsTrigger value="foreign-trade">外贸专属</TabsTrigger>
          <TabsTrigger value="custom">自定义</TabsTrigger>
        </TabsList>

        {/* 全部 */}
        <TabsContent value="all" className="mt-0">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {mockAgents.map(agent => (
              <AgentCard key={agent.id} {...agent} />
            ))}
          </div>
        </TabsContent>

        {/* 外贸专属 */}
        <TabsContent value="foreign-trade" className="mt-0">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {builtInAgents.map(agent => (
              <AgentCard key={agent.id} {...agent} />
            ))}
          </div>
        </TabsContent>

        {/* 自定义 */}
        <TabsContent value="custom" className="mt-0">
          {customAgents.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {customAgents.map(agent => (
                <AgentCard key={agent.id} {...agent} />
              ))}
            </div>
          ) : (
            <div className="py-20 text-center flex flex-col items-center justify-center border border-dashed border-border rounded-xl">
              <p className="text-muted-foreground text-sm mb-4">暂无自定义智能体</p>
              {/* 这里也可以放置一个更显著的入口引导，当前直接复用对话框 */}
              <NewAgentDialog />
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
