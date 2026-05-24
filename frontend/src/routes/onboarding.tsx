import { useMutation, useQueryClient } from "@tanstack/react-query"
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { useState } from "react"
import type { OrganizationCreate } from "@/client"
import { OrganizationsService } from "@/client"

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
      // Invalidate and wait for user data to refetch
      await queryClient.invalidateQueries({ queryKey: ["currentUser"] })
      await queryClient.invalidateQueries({ queryKey: ["organizations"] })

      // Wait a bit for the backend to fully commit the changes
      await new Promise((resolve) => setTimeout(resolve, 500))

      // Refetch user to get updated organization_id
      await queryClient.refetchQueries({ queryKey: ["currentUser"] })

      // Navigate to dashboard
      navigate({ to: "/" })
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.name.trim()) {
      return
    }
    createOrgMutation.mutate(formData)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 px-4">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          <img
            src="/assets/images/favicon.png"
            alt="Logo"
            className="mx-auto h-12 w-auto"
          />
          <h2 className="mt-6 text-3xl font-bold text-gray-900 dark:text-white">
            Welcome!
          </h2>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
            Let's set up your organization to get started
          </p>
        </div>

        <form onSubmit={handleSubmit} className="mt-8 space-y-6">
          <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6 space-y-4">
            <div>
              <label
                htmlFor="org-name"
                className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
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
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
                placeholder="Acme Corporation"
              />
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                This will be the name of your workspace
              </p>
            </div>

            <div>
              <label
                htmlFor="base-currency"
                className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
              >
                Base Currency
              </label>
              <select
                id="base-currency"
                value={formData.base_currency}
                onChange={(e) =>
                  setFormData({ ...formData, base_currency: e.target.value })
                }
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
              >
                {CURRENCIES.map((currency) => (
                  <option key={currency.code} value={currency.code}>
                    {currency.code} - {currency.name}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Currency for reconciliation and reporting
              </p>
            </div>

            <div>
              <label
                htmlFor="timezone"
                className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
              >
                Timezone
              </label>
              <select
                id="timezone"
                value={formData.timezone}
                onChange={(e) =>
                  setFormData({ ...formData, timezone: e.target.value })
                }
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
              >
                {TIMEZONES.map((tz) => (
                  <option key={tz.value} value={tz.value}>
                    {tz.label}
                  </option>
                ))}
              </select>
            </div>
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
            className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {createOrgMutation.isPending
              ? "Creating Organization..."
              : "Create Organization"}
          </button>
        </form>
      </div>
    </div>
  )
}
