import { createNavigation } from "next-intl/navigation";
import { routing } from "@/i18n/routing";

// Typsichere Navigation-Helpers für next-intl
export const { Link, redirect, usePathname, useRouter } =
  createNavigation(routing);
