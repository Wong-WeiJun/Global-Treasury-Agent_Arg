import { createFileRoute } from "@tanstack/react-router"

import ChangePassword from "@/components/UserSettings/ChangePassword"
import DeleteAccount from "@/components/UserSettings/DeleteAccount"
import UserInformation from "@/components/UserSettings/UserInformation"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import useAuth from "@/hooks/useAuth"

const tabsConfig = [
  { value: "my-profile", title: "My profile", component: UserInformation },
  { value: "password", title: "Password", component: ChangePassword },
  { value: "danger-zone", title: "Danger zone", component: DeleteAccount },
]

export const Route = createFileRoute("/_layout/settings")({
  component: UserSettings,
  head: () => ({
    meta: [
      {
        title: "Settings",
      },
    ],
  }),
})

function UserSettings() {
  const { user: currentUser } = useAuth()
  const finalTabs = currentUser?.is_superuser
    ? tabsConfig.slice(0, 3)
    : tabsConfig

  if (!currentUser) {
    return null
  }

  return (
    <div className="max-w-5xl mx-auto flex flex-col gap-8 w-full px-4 py-8 md:py-12">
      
      {/* HEADER SECTION: Big text, left-aligned */}
      <div className="text-left border-b border-zinc-200 dark:border-zinc-800 pb-6">
        <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight">User Settings</h1>
        <p className="text-base md:text-lg text-muted-foreground mt-1">
          Adjust Details and security settings.
        </p>
      </div>

      <Tabs defaultValue="my-profile" className="w-full flex flex-col">
        {/* TABS LIST: Centered and enlarged */}
        <TabsList className="justify-center items-center self-center bg-zinc-100 dark:bg-zinc-900 p-1.5 h-auto rounded-xl mb-8">
          {finalTabs.map((tab) => (
            <TabsTrigger 
              key={tab.value} 
              value={tab.value}
              className="text-sm md:text-base font-medium py-2.5 px-5 md:px-8 rounded-lg data-[state=active]:shadow-sm transition-all"
            >
              {tab.title}
            </TabsTrigger>
          ))}
        </TabsList>
        
        {/* CONTENT AREA: Centered flex layout holding the responsive content panel */}
        <div className="w-full flex justify-center items-center">
          {finalTabs.map((tab) => (
            <TabsContent 
              key={tab.value} 
              value={tab.value} 
              className="w-full max-w-2xl focus-visible:outline-none mt-0"
            >
              <tab.component />
            </TabsContent>
          ))}
        </div>
      </Tabs>
    </div>
  )
}