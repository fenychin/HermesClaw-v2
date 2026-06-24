import { redirect } from "next/navigation";

export default function LongMemoryPage() {
  redirect("/brain/memory?tab=long");
}
