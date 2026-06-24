import { redirect } from "next/navigation";

export default function ShortMemoryPage() {
  redirect("/brain/memory?tab=short");
}
