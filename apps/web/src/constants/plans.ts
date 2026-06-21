export interface Plan {
  id: string;
  name: string;
  tag: "FREE" | "PRO" | "PRO PLUS" | "MAX" | "ULTRA";
  monthlyPrice: number; // 月付价格
  yearlyPrice: number;  // 年付折算每月价格
  features: string[];
  recommended?: boolean; // 推荐高亮
  premium?: boolean;     // 顶级奢华背景
}

export const PLANS: Plan[] = [
  {
    id: "free",
    name: "Free 套餐",
    tag: "FREE",
    monthlyPrice: 0,
    yearlyPrice: 0,
    features: [
      "无需信用卡",
      "30一次性积分",
      "每日5奖励积分",
      "AI超级智能体+智能体+连接器+技能",
      "社区支持"
    ]
  },
  {
    id: "pro",
    name: "Pro 套餐",
    tag: "PRO",
    monthlyPrice: 20,
    yearlyPrice: 16, // 年付优惠 20%
    features: [
      "包含Free所有功能",
      "每月200积分",
      "每日5奖励积分",
      "AI超级智能体支持记忆代码搜索等",
      "自定义智能体和定时运行",
      "所有连接器",
      "内置自定义和开源技能"
    ]
  },
  {
    id: "pro_plus",
    name: "Pro Plus 套餐",
    tag: "PRO PLUS",
    monthlyPrice: 50,
    yearlyPrice: 40, // 年付优惠 20% (推荐，边框高亮)
    recommended: true,
    features: [
      "包含Pro所有功能",
      "每月600积分",
      "每日5奖励积分",
      "优先支持"
    ]
  },
  {
    id: "max",
    name: "Max 套餐",
    tag: "MAX",
    monthlyPrice: 150,
    yearlyPrice: 120, // 年付优惠 20%
    features: [
      "包含Pro Plus所有功能",
      "每月2000积分",
      "每日5奖励积分",
      "专属支持"
    ]
  },
  {
    id: "ultra",
    name: "Ultra 套餐",
    tag: "ULTRA",
    monthlyPrice: 1000,
    yearlyPrice: 800, // 年付优惠 20% (皇冠高亮，高级渐变)
    premium: true,
    features: [
      "包含Max所有功能",
      "每月20000积分",
      "每日5奖励积分",
      "专属支持",
      "创始人办公时间"
    ]
  }
];
