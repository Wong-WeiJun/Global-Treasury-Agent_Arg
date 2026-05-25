import { useMutation, useQueryClient } from "@tanstack/react-query"
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { useState } from "react"
import type { OrganizationCreate } from "@/client"
import { OrganizationsService } from "@/client"
import { Footer } from "@/components/Common/Footer"

export const Route = createFileRoute("/onboarding")({
  component: OnboardingPage,
})

const CURRENCIES = [
  { code: "MYR", name: "Malaysian Ringgit" },
  { code: "USD", name: "US Dollar" },
  { code: "SGD", name: "Singapore Dollar" },
  { code: "EUR", name: "Euro" },
  { code: "GBP", name: "British Pound" },
  { code: "JPY", name: "Japanese Yen" },
  { code: "CNY", name: "Chinese Yuan" },
  { code: "AUD", name: "Australian Dollar" },
  { code: "CAD", name: "Canadian Dollar" },
  { code: "HKD", name: "Hong Kong Dollar" },
  { code: "THB", name: "Thai Baht" },
  { code: "IDR", name: "Indonesian Rupiah" },
]

const TIMEZONES = [
  { value: "Asia/Kuala_Lumpur", label: "Kuala Lumpur (GMT+8)" },
  { value: "Asia/Singapore", label: "Singapore (GMT+8)" },
  { value: "Asia/Hong_Kong", label: "Hong Kong (GMT+8)" },
  { value: "Asia/Bangkok", label: "Bangkok (GMT+7)" },
  { value: "Asia/Jakarta", label: "Jakarta (GMT+7)" },
  { value: "Asia/Tokyo", label: "Tokyo (GMT+9)" },
  { value: "America/New_York", label: "New York (GMT-5)" },
  { value: "Europe/London", label: "London (GMT+0)" },
]

function OnboardingPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [formData, setFormData] = useState<OrganizationCreate>({
    name: "",
    base_currency: "MYR",
    timezone: "Asia/Kuala_Lumpur",
    fx_provider: "frankfurter",
  })

  const createOrgMutation = useMutation({
    mutationFn: (data: OrganizationCreate) =>
      OrganizationsService.createOrganization({ requestBody: data }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["currentUser"] })
      await queryClient.invalidateQueries({ queryKey: ["organizations"] })
      await new Promise((resolve) => setTimeout(resolve, 500))
      await queryClient.refetchQueries({ queryKey: ["currentUser"] })
      navigate({ to: "/" })
    },
  })

  const handleSubmit = (e: { preventDefault(): void }) => {
    e.preventDefault()
    if (!formData.name.trim()) {
      return
    }
    createOrgMutation.mutate(formData)
  }

  return (
    <div className="dark min-h-screen w-full bg-[url('/assets/images/login.png')] bg-cover bg-center flex flex-col p-6 md:p-10">
      <div className="flex flex-1 items-center justify-center">
        <div className="max-w-[480px] w-full">
          <form onSubmit={handleSubmit}>
            <div className="w-full aspect-[3/4] overflow-y-auto bg-black/40 backdrop-blur-md p-8 rounded-2xl shadow-xl border border-zinc-800/50 flex flex-col gap-5">
              <div className="text-center">
                <img
                  src="/assets/images/favicon.png"
                  alt="Logo"
                  className="mx-auto h-14 w-auto object-contain mb-3"
                />
                <h2 className="text-2xl font-bold tracking-tight">Welcome!</h2>
                <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                  Let's set up your organization to get started
                </p>
              </div>

              <div>
                <label
                  htmlFor="org-name"
                  className="block text-sm font-medium mb-1"
                >
                  Organization Name
                </label>
                <input
                  id="org-name"
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) =>
                    setFormData({ ...formData, name: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-zinc-300 dark:border-zinc-700 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-[#1677c8] focus:border-[#1677c8] dark:bg-zinc-900 dark:text-white text-sm"
                  placeholder="Acme Corporation"
                />
                <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                  This will be the name of your workspace
                </p>
              </div>

              <div>
                <label
                  htmlFor="base-currency"
                  className="block text-sm font-medium mb-1"
                >
                  Base Currency
                </label>
                <select
                  id="base-currency"
                  value={formData.base_currency}
                  onChange={(e) =>
                    setFormData({ ...formData, base_currency: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-zinc-300 dark:border-zinc-700 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-[#1677c8] focus:border-[#1677c8] dark:bg-zinc-900 dark:text-white text-sm"
                >
                  {CURRENCIES.map((currency) => (
                    <option key={currency.code} value={currency.code}>
                      {currency.code} - {currency.name}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                  Currency for reconciliation and reporting
                </p>
              </div>

              <div>
                <label
                  htmlFor="timezone"
                  className="block text-sm font-medium mb-1"
                >
                  Timezone
                </label>
                <select
                  id="timezone"
                  value={formData.timezone}
                  onChange={(e) =>
                    setFormData({ ...formData, timezone: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-zinc-300 dark:border-zinc-700 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-[#1677c8] focus:border-[#1677c8] dark:bg-zinc-900 dark:text-white text-sm"
                >
                  {TIMEZONES.map((tz) => (
                    <option key={tz.value} value={tz.value}>
                      {tz.label}
                    </option>
                  ))}
                </select>
              </div>

              {createOrgMutation.error && (
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md p-3">
                  <p className="text-sm text-red-800 dark:text-red-200">
                    {(createOrgMutation.error as Error).message}
                  </p>
                </div>
              )}

              <button
                type="submit"
                disabled={createOrgMutation.isPending || !formData.name.trim()}
                className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-[#1677c8] hover:bg-[#295375] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#1677c8] disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200"
              >
                {createOrgMutation.isPending
                  ? "Creating Organization..."
                  : "Create Organization"}
              </button>
            </div>
          </form>
        </div>
      </div>

      <Footer />
    </div>
  )
}
