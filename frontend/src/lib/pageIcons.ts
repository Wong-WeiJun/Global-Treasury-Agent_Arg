import type { LucideIcon } from "lucide-react"
import {
  Building2,
  GitMerge,
  History,
  Home,
  Settings,
  Users,
  UsersRound,
} from "lucide-react"

export const PAGE_ICONS: Record<string, LucideIcon[]> = {
  "/": [Home],
  "/reconcile": [GitMerge],
  "/history": [History],
  "/team": [UsersRound],
  "/organization": [Building2],
  "/admin": [Users],
  "/settings": [Settings],
}

/** Returns icons for the current pathname, falling back to Home. */
export function getPageIcons(pathname: string): LucideIcon[] {
  if (PAGE_ICONS[pathname]) return PAGE_ICONS[pathname]
  const prefix = Object.keys(PAGE_ICONS).find(
    (k) => k !== "/" && pathname.startsWith(k),
  )
  return prefix ? PAGE_ICONS[prefix] : PAGE_ICONS["/"]
}
