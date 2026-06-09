"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";

export function NewAgentDialog() {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(1);

  // Stepper 指示器渲染
  const renderStepper = () => {
    return (
      <div className="flex items-center justify-center mb-6">
        {[1, 2, 3].map((item, index) => (
          <div key={item} className="flex items-center">
            {/* 圆点 */}
            <div
              className={`w-3 h-3 rounded-full transition-colors ${
                step > item
                  ? "bg-primary"
                  : step === item
                  ? "bg-primary animate-pulse"
                  : "bg-border"
              }`}
            />
            {/* 连接线 */}
            {index < 2 && (
              <div
                className={`w-8 h-[2px] transition-colors ${
                  step > item ? "bg-primary" : "bg-border"
                }`}
              />
            )}
          </div>
        ))}
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={(val) => {
      setOpen(val);
      if (!val) {
        // 关闭时延迟重置步骤
        setTimeout(() => setStep(1), 300);
      }
    }}>
      <DialogTrigger render={<Button className="bg-primary text-primary-foreground hover:bg-primary/90" />}>
        + 新建智能体
      </DialogTrigger>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>新建智能体</DialogTitle>
        </DialogHeader>

        <div className="py-4">
          {renderStepper()}

          {/* 步骤 1：选择模板 */}
          {step === 1 && (
            <div className="flex flex-col gap-4 animate-in fade-in slide-in-from-right-4 duration-300">
              <h3 className="text-sm font-medium text-foreground">选择模板</h3>
              <div className="grid grid-cols-2 gap-3">
                <div className="border border-primary bg-primary/5 rounded-lg p-3 cursor-pointer">
                  <p className="text-sm text-primary font-medium mb-1">外贸销售助手</p>
                  <p className="text-xs text-muted-foreground">内置官方模板</p>
                </div>
                <div className="border border-border hover:border-primary/50 bg-card rounded-lg p-3 cursor-pointer transition-colors">
                  <p className="text-sm text-foreground font-medium mb-1">空白智能体</p>
                  <p className="text-xs text-muted-foreground">从零开始配置</p>
                </div>
              </div>
            </div>
          )}

          {/* 步骤 2：基础信息 */}
          {step === 2 && (
            <div className="flex flex-col gap-4 animate-in fade-in slide-in-from-right-4 duration-300">
              <h3 className="text-sm font-medium text-foreground">基础信息</h3>
              <div className="flex flex-col gap-2">
                <label className="text-xs text-muted-foreground">名称</label>
                <Input placeholder="例如：高级邮件助理" defaultValue="外贸销售助手" />
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-xs text-muted-foreground">职责描述</label>
                <Input placeholder="描述该智能体的主要工作" defaultValue="客户开发与跟进" />
              </div>
              <div className="flex flex-col gap-2 mt-2">
                <label className="text-xs text-muted-foreground">记忆权限</label>
                <div className="flex items-center space-x-2">
                  <Checkbox id="memory-access" defaultChecked />
                  <label
                    htmlFor="memory-access"
                    className="text-sm text-foreground font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                  >
                    允许读取工作区长期记忆
                  </label>
                </div>
              </div>
            </div>
          )}

          {/* 步骤 3：绑定技能 */}
          {step === 3 && (
            <div className="flex flex-col gap-4 animate-in fade-in slide-in-from-right-4 duration-300">
              <h3 className="text-sm font-medium text-foreground">绑定技能</h3>
              <div className="flex flex-col gap-3">
                {[
                  { id: "s1", label: "邮件撰写", desc: "结合上下文生成多语言邮件" },
                  { id: "s2", label: "需求分析", desc: "从询盘中提取关键信息" },
                  { id: "s3", label: "报价核算", desc: "自动计算运费与阶梯报价" },
                ].map((skill) => (
                  <div key={skill.id} className="flex items-start space-x-3 border border-border p-3 rounded-lg bg-card hover:border-primary/40 transition-colors">
                    <Checkbox id={skill.id} defaultChecked={skill.id !== "s3"} />
                    <div className="grid gap-1.5 leading-none">
                      <label
                        htmlFor={skill.id}
                        className="text-sm font-medium text-foreground cursor-pointer peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                      >
                        {skill.label}
                      </label>
                      <p className="text-xs text-muted-foreground">
                        {skill.desc}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-between mt-4">
          <Button
            variant="outline"
            onClick={() => setStep(Math.max(1, step - 1))}
            disabled={step === 1}
          >
            上一步
          </Button>
          <Button
            onClick={() => {
              if (step < 3) {
                setStep(step + 1);
              } else {
                setOpen(false); // 完成创建
              }
            }}
          >
            {step === 3 ? "完成创建" : "下一步"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
