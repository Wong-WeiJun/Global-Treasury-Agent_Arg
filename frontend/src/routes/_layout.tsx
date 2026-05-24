import {
  createFileRoute,
  Outlet,
  redirect,
  useNavigate,
  useRouterState,
} from "@tanstack/react-router"
import { useEffect } from "react"

import { Footer } from "@/components/Common/Footer"
import { TopNavbar } from "@/components/Common/TopNavbar"
import AppSidebar from "@/components/Sidebar/AppSidebar"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import useAuth, { isLoggedIn } from "@/hooks/useAuth"

export const Route = createFileRoute("/_layout")({
  component: Layout,
  beforeLoad: async () => {
    if (!isLoggedIn()) {
      throw redirect({
        to: "/login",
      })
    }
  },
})

function Layout() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const router = useRouterState()

  useEffect(() => {
    // Only redirect to onboarding if user has no organization AND we're not already on onboarding
    if (
      user &&
      !user.organization_id &&
      router.location.pathname !== "/onboarding"
    ) {
      navigate({ to: "/onboarding" })
    }
  }, [user, navigate, router.location.pathname])

  // Show loading state while checking user organization
  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-gray-500 dark:text-gray-400">Loading...</div>
      </div>
    )
  }

  // Allow access if user has organization OR if they're on the onboarding page
  if (!user.organization_id && router.location.pathname !== "/onboarding") {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-gray-500 dark:text-gray-400">
          Redirecting to onboarding...
        </div>
      </div>
    )
  }

  return (
    <SidebarProvider defaultOpen={false}>
      {/* Kept rendering in the background to avoid context errors, but visually hidden */}
      <div className="hidden" aria-hidden="true">
        <AppSidebar />
      </div>

      <SidebarInset className="min-h-screen flex flex-col bg-zinc-50/85 dark:bg-zinc-950/85 backdrop-blur-sm">
        {/* Modern Sticky Header hosting your TopNavbar */}
        <header className="sticky top-0 z-50 w-full border-b border-zinc-200 dark:border-zinc-800 bg-white/80 dark:bg-zinc-950/80 backdrop-blur-md transition-all">
          <TopNavbar />
        </header>

        {/* Main Workspace Body Content Layout */}
        <main className="flex-1 w-full p-4 md:p-8">
          <div className="mx-auto max-w-7xl">
            <Outlet />
          </div>
        </main>

        <Footer />
      </SidebarInset>
    </SidebarProvider>
  )
}

export default Layout
