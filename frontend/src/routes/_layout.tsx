import { createFileRoute, Outlet, redirect } from "@tanstack/react-router"

import { Footer } from "@/components/Common/Footer"
import { TopNavbar } from "@/components/Common/TopNavbar"
import AppSidebar from "@/components/Sidebar/AppSidebar"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { isLoggedIn } from "@/hooks/useAuth"

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
  return (
    <SidebarProvider defaultOpen={false}>
      {/* Kept rendering in the background to avoid context errors, but visually hidden */}
      <div className="hidden" aria-hidden="true">
        <AppSidebar />
      </div>
      
      <SidebarInset className="min-h-screen flex flex-col bg-zinc-50 dark:bg-zinc-950">
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