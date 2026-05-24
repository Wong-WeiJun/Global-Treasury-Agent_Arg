import { useQuery } from "@tanstack/react-query"
import { OrganizationsService } from "@/client"
import useAuth from "./useAuth"

/**
 * Hook to get currency formatting for the current user's organization
 */
const useCurrency = () => {
  const { user } = useAuth()

  const { data: orgsData } = useQuery({
    queryKey: ["organizations"],
    queryFn: () => OrganizationsService.listOrganizations({}),
    enabled: !!user?.organization_id,
  })

  const organization = orgsData?.data?.[0]
  const baseCurrency = organization?.base_currency || "MYR"
  const displayCurrency = user?.display_currency || baseCurrency

  // Currency symbol mapping
  const currencySymbols: Record<string, string> = {
    MYR: "RM",
    SGD: "S$",
    USD: "$",
    EUR: "€",
    GBP: "£",
    JPY: "¥",
    CNY: "¥",
    AUD: "A$",
    CAD: "C$",
    CHF: "CHF",
    HKD: "HK$",
    INR: "₹",
    KRW: "₩",
    THB: "฿",
    IDR: "Rp",
    PHP: "₱",
    VND: "₫",
  }

  const getSymbol = (currency?: string | null) => {
    const code = (currency || baseCurrency).toUpperCase()
    return currencySymbols[code] || code
  }

  const formatAmount = (amount: number, currency?: string | null) => {
    const symbol = getSymbol(currency)
    return `${symbol} ${amount.toFixed(2)}`
  }

  const formatAmountCompact = (amount: number, currency?: string | null) => {
    const symbol = getSymbol(currency)
    if (amount >= 1000000) {
      return `${symbol} ${(amount / 1000000).toFixed(1)}M`
    }
    if (amount >= 1000) {
      return `${symbol} ${(amount / 1000).toFixed(1)}k`
    }
    return `${symbol} ${amount.toFixed(0)}`
  }

  return {
    baseCurrency,
    displayCurrency,
    organization,
    getSymbol,
    formatAmount,
    formatAmountCompact,
  }
}

export default useCurrency
