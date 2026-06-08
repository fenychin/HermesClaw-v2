import { redirect } from "next/navigation";
import { siteConfig } from "@/config/site";

/** 根路由：重定向到默认工作台入口 */
export default function RootPage() {
  redirect(siteConfig.defaultRoute);
}
