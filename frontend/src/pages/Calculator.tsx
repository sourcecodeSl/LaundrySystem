import { useMemo, useState } from 'react'
import { Calculator as CalcIcon, Scale } from 'lucide-react'
import { useCatalog } from '../lib/catalog'
import { money, qty } from '../lib/format'
import { Card, Empty, Field, Input, PageHeader, Select, Spinner } from '../components/ui'

/** Weight / price calculator (module 26) — quick estimate without creating an order. */
export default function Calculator() {
  const cat = useCatalog()
  const [serviceId, setServiceId] = useState('')
  const [kg, setKg] = useState('')
  const [pieces, setPieces] = useState<Record<number, string>>({})

  const sid = Number(serviceId || cat.data?.services[0]?.id)
  const kgNum = Number(kg) || 0
  const weightVariant = kgNum > 0 && cat.data ? cat.data.variantForWeight(sid, kgNum) : undefined
  const weightRate = weightVariant ? cat.data!.priceOf(weightVariant.id, sid) ?? 0 : 0
  const pieceVariants = useMemo(() => cat.data?.variants.filter((v) => v.pricing_type !== 'weight_range' && cat.data!.priceOf(v.id, sid) !== null) ?? [], [cat.data, sid])
  const piecesTotal = pieceVariants.reduce((s, v) => s + (Number(pieces[v.id]) || 0) * (cat.data!.priceOf(v.id, sid) ?? 0), 0)
  const weightTotal = kgNum * weightRate
  const rates = cat.data?.rates ?? []
  const sub = weightTotal + piecesTotal
  const sc = sub * rates.filter((r) => r.type === 'service_charge').reduce((a, r) => a + Number(r.rate), 0) / 100
  const tax = (sub + sc) * rates.filter((r) => r.type === 'tax').reduce((a, r) => a + Number(r.rate), 0) / 100

  if (cat.isLoading) return <Spinner />
  if (!cat.data?.services.length) return <Empty title="No services configured" />

  return (
    <div>
      <PageHeader title="Weight & Price Calculator" subtitle="Instant estimate from the current price list" icon={<CalcIcon className="h-5 w-5" />} />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Service"><Select value={String(sid)} onChange={(e) => setServiceId(e.target.value)} options={cat.data.services.map((s) => ({ value: s.id, label: s.name }))} /></Field>
              <Field label="Weight (kg)" hint={weightVariant ? `Rate: ${weightVariant.name} @ ${money(weightRate)}/kg` : kgNum > 0 ? 'No weight rate for this service/weight' : ''}>
                <div className="relative"><Scale className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <Input className="pl-9" type="number" step="0.01" value={kg} onChange={(e) => setKg(e.target.value)} /></div>
              </Field>
            </div>
          </Card>
          <Card title="Per piece / per item">
            {pieceVariants.length ? (
              <div className="grid gap-3 sm:grid-cols-2">
                {pieceVariants.map((v) => (
                  <div key={v.id} className="flex items-center gap-3 rounded-xl border border-slate-100 p-3 dark:border-slate-800">
                    <div className="flex-1"><p className="text-sm font-semibold">{v.name}</p><p className="text-xs text-slate-500">{money(cat.data!.priceOf(v.id, sid))} / {v.unit}</p></div>
                    <input type="number" min="0" className="input w-20 py-1.5" value={pieces[v.id] ?? ''} onChange={(e) => setPieces({ ...pieces, [v.id]: e.target.value })} />
                  </div>
                ))}
              </div>
            ) : <Empty title="No piece prices for this service" />}
          </Card>
        </div>
        <Card className="h-fit lg:sticky lg:top-20" title="Estimate">
          <div className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-slate-500">Weight ({qty(kgNum)} kg)</span><span>{money(weightTotal)}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">Pieces</span><span>{money(piecesTotal)}</span></div>
            {sc > 0 && <div className="flex justify-between"><span className="text-slate-500">Service charge</span><span>{money(sc)}</span></div>}
            {tax > 0 && <div className="flex justify-between"><span className="text-slate-500">Tax</span><span>{money(tax)}</span></div>}
            <div className="flex items-end justify-between border-t border-dashed border-slate-200 pt-3 dark:border-slate-700">
              <span className="font-semibold">Estimated total</span><span className="text-3xl font-extrabold text-brand-600">{money(sub + sc + tax)}</span>
            </div>
            <p className="pt-2 text-xs text-slate-400">Promotions and membership discounts are applied at billing.</p>
          </div>
        </Card>
      </div>
    </div>
  )
}
