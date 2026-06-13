"use client";

import { useState } from "react";
import {
  Mail,
  MessageSquare,
  Database,
  LayoutGrid,
  FileSpreadsheet,
  Building,
  ShoppingCart,
  Globe,
  RefreshCw,
} from "lucide-react";

// 8个连接器 Mock 数据
const MOCK_CONNECTORS = [
  {
    id: "gmail",
    name: "邮箱 (Gmail/Outlook)",
    desc: "收发邮件，同步客户沟通记录",
    icon: Mail,
    connected: true,
    lastSync: "10分钟前",
  },
  {
    id: "im",
    name: "IM (Slack/微信)",
    desc: "即时通讯协作，消息推送与提醒",
    icon: MessageSquare,
    connected: false,
  },
  {
    id: "crm",
    name: "企业 CRM",
    desc: "客户关系管理，线索与商机同步",
    icon: Database,
    connected: true,
    lastSync: "1小时前",
  },
  {
    id: "erp",
    name: "企业 ERP",
    desc: "订单与库存数据实时同步",
    icon: LayoutGrid,
    connected: false,
  },
  {
    id: "sheets",
    name: "Google Sheets",
    desc: "报表与自动化数据导出",
    icon: FileSpreadsheet,
    connected: true,
    lastSync: "5分钟前",
  },
  {
    id: "wecom",
    name: "企业微信",
    desc: "企业内部通讯与审批流集成",
    icon: Building,
    connected: false,
  },
  {
    id: "alibaba",
    name: "阿里巴巴国际站",
    desc: "店铺消息处理与数据分析",
    icon: ShoppingCart,
    connected: true,
    lastSync: "2小时前",
  },
  {
    id: "customs",
    name: "关税查询 API",
    desc: "全球多国关税实时查询",
    icon: Globe,
    connected: false,
  },
];

export function ConnectorsSettings() {
  const [connectors, setConnectors] = useState(MOCK_CONNECTORS);

  const toggleConnection = (id: string) => {
    setConnectors((prev) =>
      prev.map((c) => {
        if (c.id === id) {
          return {
            ...c,
            connected: !c.connected,
            lastSync: !c.connected ? "刚刚" : undefined,
          };
        }
        return c;
      })
    );
  };

  return (
    <div className="max-w-4xl pb-10">
      <div className="mb-6">
        <h2 className="text-lg font-semibold text-foreground">连接器授权</h2>
        <p className="text-sm text-muted-foreground mt-1">
          管理第三方平台与工具的授权连接，赋予系统更多能力
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {connectors.map((c) => {
          const Icon = c.icon;
          return (
            <div
              key={c.id}
              className="bg-card rounded-2xl border border-border p-5 flex flex-col justify-between min-h-[140px]"
            >
              <div className="flex items-start justify-between">
                <div className="flex gap-3">
                  <div className="shrink-0 bg-accent size-10 rounded-xl flex items-center justify-center">
                    <Icon className="size-[18px] text-foreground" />
                  </div>
                  <div>
                    <h3 className="text-foreground font-medium text-sm">
                      {c.name}
                    </h3>
                    <p className="text-muted-foreground text-xs mt-1 leading-relaxed line-clamp-2 pr-2">
                      {c.desc}
                    </p>
                  </div>
                </div>
                <div className="shrink-0 ml-2 flex flex-col items-end gap-2">
                  {c.connected ? (
                    <>
                      <div className="flex items-center gap-1.5">
                        <span className="size-2 rounded-full bg-success"></span>
                        <span className="text-success text-xs font-medium">
                          已连接
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => toggleConnection(c.id)}
                        className="text-xs text-muted-foreground hover:bg-accent hover:text-foreground px-2 py-1 rounded-lg transition-colors"
                      >
                        断开
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => toggleConnection(c.id)}
                      className="bg-primary text-white rounded-xl px-3 py-1.5 text-xs font-medium hover:bg-primary/90 transition-colors"
                    >
                      连接
                    </button>
                  )}
                </div>
              </div>

              {c.connected && (
                <div className="mt-4 pt-3 border-t border-border flex items-center justify-between">
                  <span className="text-hint text-xs">
                    最后同步时间：{c.lastSync}
                  </span>
                  <button
                    type="button"
                    className="text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <RefreshCw className="size-4" />
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
