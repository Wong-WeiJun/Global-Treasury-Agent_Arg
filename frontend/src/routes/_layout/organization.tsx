import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { useState } from "react"
import useAuth from "@/hooks/useAuth"
import { OrganizationsService } from "../../client"

export const Route = createFileRoute("/_layout/organization")({
  component: OrganizationSettings,
})

function OrganizationSettings() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState(false)

  // Fetch user's organization
  const { data: orgsData, isLoading } = useQuery({
    queryKey: ["organizations"],
    queryFn: () => OrganizationsService.listOrganizations({}),
  })

  const organization = orgsData?.data?.[0]

  const [formData, setFormData] = useState({
    name: "",
    base_currency: "MYR",
    timezone: "Asia/Kuala_Lumpur",
    fx_provider: "frankfurter",
  })

  // Update form when org loads
  useState(() => {
    if (organization) {
      setFormData({
        name: organization.name,
        base_currency: organization.base_currency,
        timezone: organization.timezone,
        fx_provider: organization.fx_provider,
      })
    }
  })

  const updateMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      if (!organization?.id) throw new Error("No organization found")
      return OrganizationsService.updateOrganization({
        organizationId: organization.id,
        requestBody: data,
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["organizations"] })
      setSuccess(true)
      setSaving(false)
      setTimeout(() => setSuccess(false), 3000)
    },
    onError: () => {
      setSaving(false)
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setSuccess(false)
    updateMutation.mutate(formData)
  }

  if (!user?.is_superuser) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <div className="bg-yellow-900/20 border border-yellow-700 rounded-lg px-4 py-3 text-yellow-300">
          ⚠ Only administrators can access organization settings.
        </div>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <p className="text-gray-400">Loading...</p>
      </div>
    )
  }

  if (!organization) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <div className="bg-red-900/20 border border-red-700 rounded-lg px-4 py-3 text-red-300">
          No organization found. Please contact support.
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Organization Settings</h1>
        <p className="text-gray-500 text-sm mt-1">
          Configure your organization's base currency and regional settings
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Organization Name */}
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
          <h2 className="text-lg font-semibold mb-4">Organization Details</h2>

          <div className="space-y-4">
            <div>
              <label
                htmlFor="org-name"
                className="block text-sm font-medium text-gray-300 mb-2"
              >
                Organization Name
              </label>
              <input
                id="org-name"
                type="text"
                value={formData.name}
                onChange={(e) =>
                  setFormData({ ...formData, name: e.target.value })
                }
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>
          </div>
        </div>

        {/* Multi-Currency Settings */}
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
          <h2 className="text-lg font-semibold mb-2">
            Multi-Currency Settings
          </h2>
          <p className="text-sm text-gray-400 mb-4">
            Configure your base operating currency for reconciliation
          </p>

          <div className="space-y-4">
            <div>
              <label
                htmlFor="base-currency"
                className="block text-sm font-medium text-gray-300 mb-2"
              >
                Base Currency
              </label>
              <select
                id="base-currency"
                value={formData.base_currency}
                onChange={(e) =>
                  setFormData({ ...formData, base_currency: e.target.value })
                }
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="MYR">MYR - Malaysian Ringgit</option>
                <option value="USD">USD - US Dollar</option>
                <option value="SGD">SGD - Singapore Dollar</option>
                <option value="EUR">EUR - Euro</option>
                <option value="GBP">GBP - British Pound</option>
                <option value="JPY">JPY - Japanese Yen</option>
                <option value="CNY">CNY - Chinese Yuan</option>
                <option value="AUD">AUD - Australian Dollar</option>
                <option value="CAD">CAD - Canadian Dollar</option>
                <option value="HKD">HKD - Hong Kong Dollar</option>
                <option value="THB">THB - Thai Baht</option>
                <option value="IDR">IDR - Indonesian Rupiah</option>
              </select>
              <p className="text-xs text-gray-500 mt-1">
                All transactions will be normalized to this currency for
                reconciliation
              </p>
            </div>

            <div className="bg-blue-950/30 border border-blue-800/50 rounded-lg px-4 py-3">
              <p className="text-xs text-blue-300 mb-1 font-semibold">
                💡 How Base Currency Works
              </p>
              <ul className="text-xs text-gray-300 space-y-1">
                <li>
                  • Original transaction amounts are preserved for audit trails
                </li>
                <li>
                  • All amounts are converted to base currency using historical
                  FX rates
                </li>
                <li>• Reconciliation comparisons use base currency amounts</li>
                <li>• Changing this affects future transactions only</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Regional Settings */}
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
          <h2 className="text-lg font-semibold mb-4">Regional Settings</h2>

          <div className="space-y-4">
            <div>
              <label
                htmlFor="timezone"
                className="block text-sm font-medium text-gray-300 mb-2"
              >
                Timezone
              </label>
              <select
                id="timezone"
                value={formData.timezone}
                onChange={(e) =>
                  setFormData({ ...formData, timezone: e.target.value })
                }
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="Asia/Kuala_Lumpur">
                  Asia/Kuala_Lumpur (MYT, GMT+8)
                </option>
                <option value="Asia/Singapore">
                  Asia/Singapore (SGT, GMT+8)
                </option>
                <option value="America/New_York">
                  America/New_York (EST/EDT)
                </option>
                <option value="Europe/London">Europe/London (GMT/BST)</option>
                <option value="Asia/Tokyo">Asia/Tokyo (JST, GMT+9)</option>
                <option value="Asia/Shanghai">
                  Asia/Shanghai (CST, GMT+8)
                </option>
                <option value="Australia/Sydney">
                  Australia/Sydney (AEDT/AEST)
                </option>
                <option value="Asia/Hong_Kong">
                  Asia/Hong_Kong (HKT, GMT+8)
                </option>
              </select>
            </div>

            <div>
              <label
                htmlFor="fx-provider"
                className="block text-sm font-medium text-gray-300 mb-2"
              >
                FX Provider
              </label>
              <select
                id="fx-provider"
                value={formData.fx_provider}
                onChange={(e) =>
                  setFormData({ ...formData, fx_provider: e.target.value })
                }
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="frankfurter">
                  Frankfurter (Free, Historical back to 1948)
                </option>
              </select>
              <p className="text-xs text-gray-500 mt-1">
                Source for foreign exchange rates
              </p>
            </div>
          </div>
        </div>

        {/* Save Button */}
        <div className="flex items-center gap-4">
          <button
            type="submit"
            disabled={saving}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium transition-colors"
          >
            {saving ? "Saving..." : "Save Changes"}
          </button>

          {success && (
            <span className="text-green-400 text-sm flex items-center gap-2">
              ✓ Settings saved successfully
            </span>
          )}

          {updateMutation.isError && (
            <span className="text-red-400 text-sm flex items-center gap-2">
              ✗ Failed to save settings
            </span>
          )}
        </div>
      </form>

      {/* Info Box */}
      <div className="mt-8 bg-gray-900 border border-gray-800 rounded-lg p-6">
        <h3 className="text-sm font-semibold mb-2 text-gray-300">
          Current Configuration
        </h3>
        <dl className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <dt className="text-gray-500">Organization ID</dt>
            <dd className="text-gray-300 font-mono text-xs mt-1">
              {organization.id}
            </dd>
          </div>
          <div>
            <dt className="text-gray-500">Created At</dt>
            <dd className="text-gray-300 text-xs mt-1">
              {new Date(organization.created_at).toLocaleString()}
            </dd>
          </div>
          <div>
            <dt className="text-gray-500">Base Currency</dt>
            <dd className="text-gray-300 font-semibold mt-1">
              {organization.base_currency}
            </dd>
          </div>
          <div>
            <dt className="text-gray-500">Timezone</dt>
            <dd className="text-gray-300 mt-1">{organization.timezone}</dd>
          </div>
        </dl>
      </div>
    </div>
  )
}

export default OrganizationSettings
