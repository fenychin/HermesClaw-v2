import { redirect } from "next/navigation";

export default function MidMemoryPage() {
  redirect("/brain/memory?tab=mid");
}
