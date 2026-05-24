import { Link as RouterLink, useRouterState } from "@tanstack/react-router"
import {
  Building2,
  ChevronsUpDown,
  GitMerge, // Added
  History, // Added
  Home,
  LogOut,
  Monitor,
  Moon,
  Settings,
  Sun,
  Users,
  UsersRound,
} from "lucide-react"
import { useTheme } from "@/components/theme-provider"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import useAuth from "@/hooks/useAuth"
import { useUserRole } from "@/hooks/useUserRole"
import { getInitials } from "@/utils"

export type NavigationItem = {
  icon: any
  title: string
  path: string
}

interface UserInfoProps {
  fullName?: string | null
  email?: string
}

function UserInfo({ fullName, email }: UserInfoProps) {
  return (
    <div className="flex items-center gap-2.5 min-w-0">
      <Avatar className="size-8 border border-blue-600">
        <AvatarFallback className="bg-blue-700 text-white text-xs">
          {getInitials(fullName || "User")}
        </AvatarFallback>
      </Avatar>
      <div className="flex flex-col items-start text-left min-w-0">
        <p className="text-sm font-medium text-white truncate max-w-30">
          {fullName || "User"}
        </p>
        <p className="text-xs text-blue-300 truncate max-w-35">
          {email}
        </p>
      </div>
    </div>
  )
}

export function TopNavbar() {
  const { user: currentUser, logout } = useAuth()
  const { canReconcile } = useUserRole()
  const { setTheme } = useTheme()
  const router = useRouterState()
  const currentPath = router.location.pathname

  // RIGHT SIDE: Dashboard, Documents (Reconcile only for Finance Manager+)
  const rightSideItems: NavigationItem[] = [
    { icon: Home, title: "Dashboard", path: "/" },
    ...(canReconcile
      ? [{ icon: GitMerge, title: "Reconcile", path: "/reconcile" }]
      : []),
    { icon: History, title: "History", path: "/history" },
    { icon: UsersRound, title: "Team", path: "/team" },
    ...(currentUser?.is_superuser
      ? [
          { icon: Building2, title: "Organization", path: "/organization" },
          { icon: Users, title: "Admin", path: "/admin" },
        ]
      : []),
  ]

  return (
    <div className="flex h-16 w-full items-center justify-between px-6">
      {/* FAR LEFT: Clickable Logo */}
      <div className="flex items-center gap-8">
        <RouterLink
          to="/"
          className="flex items-center gap-2 hover:opacity-80 transition-opacity text-white"
        >
          <img
            src="/assets/images/favicon.png"
            alt="Logo"
            className="h-8 w-auto object-contain"
          />
          <h1>MyAudit</h1>
        </RouterLink>

        {/* REST OF LEFT SIDE ITEMS
        <nav className="flex items-center gap-1">
          {leftSideItems.map((item) => {
            const isActive = currentPath === item.path
            return (
              <RouterLink
                key={item.title}
                to={item.path}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-blue-900 text-[#65d4e8]"
                    : "text-blue-200 hover:text-white hover:bg-blue-900"
                }`}
              >
                <item.icon className="size-4" />
                <span>{item.title}</span>
              </RouterLink>
            )
          })}
        </nav>*/}
      </div>

      {/* RIGHT SIDE ITEMS */}
      <div className="flex items-center gap-4">
        <nav className="flex items-center gap-1">
          {rightSideItems.map((item) => {
            const isActive = currentPath === item.path
            return (
              <RouterLink
                key={item.title}
                to={item.path}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-blue-900 text-[#65d4e8]"
                    : "text-blue-200 hover:text-white hover:bg-blue-900"
                }`}
              >
                <item.icon className="size-4" />
                <span>{item.title}</span>
              </RouterLink>
            )
          })}
        </nav>

        <span className="h-5 w-px bg-blue-700" />

        {/* Theme Dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger className="relative p-2 hover:bg-blue-900 rounded-xl transition-colors focus:outline-none flex items-center justify-center text-blue-200 hover:text-white">
            <Sun className="size-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
            <Moon className="absolute size-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
            <span className="sr-only">Toggle theme</span>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="rounded-xl mt-2">
            <DropdownMenuItem
              onClick={() => setTheme("light")}
              className="cursor-pointer gap-2 py-2"
            >
              <Sun className="size-4 text-muted-foreground" /> Light
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => setTheme("dark")}
              className="cursor-pointer gap-2 py-2"
            >
              <Moon className="size-4 text-muted-foreground" /> Dark
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => setTheme("system")}
              className="cursor-pointer gap-2 py-2"
            >
              <Monitor className="size-4 text-muted-foreground" /> System
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* PROFILE DROPDOWN */}
        {currentUser && (
          <DropdownMenu>
            <DropdownMenuTrigger className="flex items-center gap-1 p-1.5 hover:bg-blue-900 rounded-xl transition-colors focus:outline-none">
              <UserInfo
                fullName={currentUser?.full_name}
                email={currentUser?.email}
              />
              <ChevronsUpDown className="size-4 text-blue-300 ml-1" />
            </DropdownMenuTrigger>
            <DropdownMenuContent
              className="w-56 rounded-xl mt-2"
              align="end"
              sideOffset={6}
            >
              <RouterLink to="/settings">
                <DropdownMenuItem className="cursor-pointer gap-2 py-2">
                  <Settings className="size-4 text-muted-foreground" />
                  User Settings
                </DropdownMenuItem>
              </RouterLink>
              <RouterLink to="/team">
                <DropdownMenuItem className="cursor-pointer gap-2 py-2">
                  <Settings className="size-4 text-muted-foreground" />
                  Team Settings
                </DropdownMenuItem>
              </RouterLink>
              <DropdownMenuItem
                onClick={() => logout()}
                className="cursor-pointer gap-2 py-2 text-destructive focus:text-destructive"
              >
                <LogOut className="size-4" />
                Log Out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </div>
  )
}
