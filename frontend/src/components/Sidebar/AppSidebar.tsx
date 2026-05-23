import {
  Briefcase,
  GitMerge,
  History,
  Home,
  MessageSquare,
  Users,
} from "lucide-react"

import { SidebarAppearance } from "@/components/Common/Appearance"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
} from "@/components/ui/sidebar"
import useAuth from "@/hooks/useAuth"
import { type Item, Main } from "./Main"
import { User } from "./User"

const baseItems: Item[] = [
  { icon: Home, title: "Dashboard", path: "/" },
  { icon: Briefcase, title: "Items", path: "/items" },
  { icon: MessageSquare, title: "Chat", path: "/chat" },
  { icon: GitMerge, title: "Reconcile", path: "/reconcile" },
  { icon: History, title: "History", path: "/history" },
]

export function AppSidebar() {
  const { user: currentUser } = useAuth()

  const items = currentUser?.is_superuser
    ? [...baseItems, { icon: Users, title: "Admin", path: "/admin" }]
    : baseItems

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="px-4 py-6 group-data-[collapsible=icon]:px-2 group-data-[collapsible=icon]:items-center">
        {/* Full Logo: visible normally, hidden when sidebar collapses into an icon bar */}
        <img 
          src="/assets/images/favicon.png" 
          alt="Logo" 
          className="h-8 w-auto object-contain block group-data-[collapsible=icon]:hidden"
        />
        
        {/* Small Icon Version: hidden normally, shown only when sidebar collapses */}
        {/* If your logo doesn't look good small, you can replace this src with a square icon file */}
        <img 
          src="/assets/images/favicon.png" 
          alt="Logo Icon" 
          className="size-6 object-contain hidden group-data-[collapsible=icon]:block"
        />
      </SidebarHeader>
      <SidebarContent>
        <Main items={items} />
      </SidebarContent>
      <SidebarFooter>
        <SidebarAppearance />
        {currentUser && <User user={currentUser} />}
      </SidebarFooter>
    </Sidebar>
  )
}

export default AppSidebar