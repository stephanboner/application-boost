import { redirect } from "next/navigation";

// Weiterleitung von / → /de (next-intl übernimmt danach das Locale-Routing)
export default function RootPage() {
  redirect("/de");
}
