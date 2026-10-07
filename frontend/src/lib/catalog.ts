import { useQuery } from '@tanstack/react-query'
import { api } from './api'

export type Service = { id: number; code: string; name: string; processing_hours: number }
export type Variant = { id: number; category_id: number | null; name: string; pricing_type: 'weight_range' | 'per_piece' | 'per_item'; min_weight: number | null; max_weight: number | null; unit: string }
export type Catalog = {
  services: Service[]
  categories: { id: number; name: string }[]
  variants: Variant[]
  prices: { variant_id: number; service_id: number; price: number }[]
  promotions: any[]
  rates: { name: string; type: string; rate: number }[]
}

export function useCatalog() {
  return useQuery({
    queryKey: ['pos-catalog'],
    queryFn: async () => (await api.get<Catalog>('pos/catalog')).data,
    staleTime: 5 * 60_000,
    select: (c) => ({
      ...c,
      priceOf: (variantId: number, serviceId: number) => {
        const p = c.prices.find((x) => x.variant_id === variantId && x.service_id === serviceId)
        return p ? Number(p.price) : null
      },
      variantForWeight: (serviceId: number, kg: number) =>
        c.variants.find((v) => v.pricing_type === 'weight_range' && c.prices.some((p) => p.variant_id === v.id && p.service_id === serviceId)
          && (v.min_weight == null || kg >= Number(v.min_weight)) && (v.max_weight == null || kg <= Number(v.max_weight))),
    }),
  })
}
