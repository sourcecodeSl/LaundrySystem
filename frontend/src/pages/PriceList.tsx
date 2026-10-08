import { useEffect, useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Download, ListChecks, Percent, Save } from 'lucide-react'
import { toast } from 'sonner'
import { api, errorMessage } from '../lib/api'
import { useAuth } from '../lib/auth'
import { exportExcel } from '../lib/exportExcel'
import { label, money } from '../lib/format'
import { Card, Field, Input, Modal, PageHeader, Select, Spinner, cx } from '../components/ui'
import { AsyncButton, ErrorState, PageLoader, useConfirm } from '../components/feedback'

/** Variant × Service price matrix (module 4) with bulk price update (module 56). */
export default function PriceList() {
  const { can } = useAuth()
  const qc = useQueryClient()
  const data = useQuery({
    queryKey: ['price-matrix'],
    queryFn: async () => {
      const [s, v, p] = await Promise.all([api.get('services', { params: { all: 1 } }), api.get('service-variants', { params: { all: 1 } }), api.get('prices')])
      return { services: s.data.data, variants: v.data.data, prices: p.data }
    },
  })
  const [cells, setCells] = useState<Record<string, string>>({})
  const [dirty, setDirty] = useState<Set<string>>(new Set())
  const [saving, setSaving] = useState(false)
  const [bulk, setBulk] = useState<any>(null)
  const [preview, setPreview] = useState<any>(null)
  const confirm = useConfirm()
  const editable = can('services.prices')

  useEffect(() => {
    if (!data.data) return
    setCells(Object.fromEntries(data.data.prices.map((p: any) => [`${p.variant_id}:${p.service_id}`, String(p.price)])))
    setDirty(new Set())
  }, [data.data])

  const services = data.data?.services ?? []
  const variants = useMemo(() => [...(data.data?.variants ?? [])].sort((a: any, b: any) => a.pricing_type.localeCompare(b.pricing_type) || a.name.localeCompare(b.name)), [data.data])

  const save = async () => {
    setSaving(true)
    try {
      await api.put('prices', { prices: [...dirty].map((k) => { const [variant_id, service_id] = k.split(':').map(Number); return { variant_id, service_id, price: cells[k] === '' ? null : Number(cells[k]) } }) })
      toast.success('Price list saved')
      qc.invalidateQueries({ queryKey: ['price-matrix'] })
      qc.invalidateQueries({ queryKey: ['pos-catalog'] })
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setSaving(false)
    }
  }

  const runBulk = async (apply: boolean) => {
    try {
      const { data: r } = await api.post('prices/bulk', { ...bulk, value: Number(bulk.value), round_to: Number(bulk.round_to) || 0,
        service_ids: bulk.service_id ? [Number(bulk.service_id)] : [], pricing_type: bulk.pricing_type || null, preview: !apply })
      if (apply) {
        toast.success(`${r.affected} prices updated`)
        setBulk(null); setPreview(null)
        qc.invalidateQueries({ queryKey: ['price-matrix'] })
        qc.invalidateQueries({ queryKey: ['pos-catalog'] })
      } else setPreview(r)
    } catch (e) {
      toast.error(errorMessage(e))
    }
  }

  if (data.isError) return <ErrorState error={data.error} onRetry={() => data.refetch()} />
  if (data.isLoading) return <PageLoader />

  return (
    <div>
      <PageHeader title="Price List" subtitle="Separate price per variant for each service. Weight-range prices are per kg." icon={<ListChecks className="h-5 w-5" />} actions={<>
        <button className="btn-secondary" onClick={() => exportExcel<any>(variants, [
          { header: 'Variant', value: (v) => v.name }, { header: 'Pricing', value: (v) => label(v.pricing_type) },
          ...services.map((s: any) => ({ header: s.name, value: (v: any) => cells[`${v.id}:${s.id}`] ?? '' })),
        ], 'price-list')}><Download className="h-4 w-4" />Excel</button>
        {can('services.bulk_price') && <button className="btn-secondary" onClick={() => { setPreview(null); setBulk({ mode: 'percent', value: '', service_id: '', pricing_type: '', round_to: '' }) }}><Percent className="h-4 w-4" />Bulk update</button>}
        {editable && <button className="btn-primary" disabled={!dirty.size || saving} onClick={save}>{saving ? <Spinner className="h-4 w-4" /> : <Save className="h-4 w-4" />}Save {dirty.size ? `(${dirty.size})` : ''}</button>}
      </>} />
      <Card padded={false}>
        <div className="overflow-x-auto">
          <table className="table-base">
            <thead><tr><th>Variant</th><th>Pricing</th>{services.map((s: any) => <th key={s.id} className="text-right">{s.name}</th>)}</tr></thead>
            <tbody>
              {variants.map((v: any) => (
                <tr key={v.id}>
                  <td className="font-semibold">{v.name}</td>
                  <td className="text-xs text-slate-500">{label(v.pricing_type)}{v.pricing_type === 'weight_range' && ' /kg'}</td>
                  {services.map((s: any) => {
                    const k = `${v.id}:${s.id}`
                    return (
                      <td key={s.id} className="text-right">
                        {editable ? (
                          <input type="number" step="0.01" min="0" placeholder="—" value={cells[k] ?? ''}
                            className={cx('input ml-auto w-28 py-1.5 text-right', dirty.has(k) && 'border-amber-400 bg-amber-50 dark:bg-amber-500/10')}
                            onChange={(e) => { setCells({ ...cells, [k]: e.target.value }); setDirty(new Set(dirty).add(k)) }} />
                        ) : cells[k] ? money(cells[k]) : '—'}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Modal open={!!bulk} onClose={() => setBulk(null)} title="Bulk price update" size="lg" footer={<>
        <button className="btn-secondary" onClick={() => setBulk(null)}>Cancel</button>
        <AsyncButton className="btn-secondary" disabled={bulk?.value === ''} onClick={() => runBulk(false)}>Preview</AsyncButton>
        <AsyncButton disabled={!preview} onClick={async () => {
          if (await confirm({ title: `Update ${preview.affected} prices?`, message: 'New prices apply to all branches immediately for new orders. This cannot be undone automatically.', confirmText: 'Apply prices', danger: false })) await runBulk(true)
        }}>Apply to {preview?.affected ?? 0} prices</AsyncButton>
      </>}>
        {bulk && <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Change by"><Select value={bulk.mode} onChange={(e) => setBulk({ ...bulk, mode: e.target.value })}
              options={[{ value: 'percent', label: 'Percentage (%)' }, { value: 'amount', label: 'Fixed amount (+/-)' }, { value: 'set', label: 'Set exact price' }]} /></Field>
            <Field label="Value" hint="Use negative values to reduce"><Input type="number" step="0.01" value={bulk.value} onChange={(e) => { setBulk({ ...bulk, value: e.target.value }); setPreview(null) }} /></Field>
            <Field label="Service"><Select placeholder="All services" value={bulk.service_id} onChange={(e) => { setBulk({ ...bulk, service_id: e.target.value }); setPreview(null) }} options={services.map((s: any) => ({ value: s.id, label: s.name }))} /></Field>
            <Field label="Pricing type"><Select placeholder="All types" value={bulk.pricing_type} onChange={(e) => { setBulk({ ...bulk, pricing_type: e.target.value }); setPreview(null) }} options={['weight_range', 'per_piece', 'per_item'].map((t) => ({ value: t, label: label(t) }))} /></Field>
            <Field label="Round to nearest" hint="e.g. 5 or 10 (optional)"><Input type="number" value={bulk.round_to} onChange={(e) => { setBulk({ ...bulk, round_to: e.target.value }); setPreview(null) }} /></Field>
          </div>
          {preview && (
            <div className="max-h-72 overflow-y-auto rounded-xl border border-slate-100 dark:border-slate-800">
              <table className="table-base"><thead><tr><th>Variant</th><th>Service</th><th className="text-right">Old</th><th className="text-right">New</th></tr></thead>
                <tbody>{preview.rows.map((r: any) => <tr key={r.id}><td>{r.variant}</td><td>{r.service}</td><td className="text-right text-slate-400">{money(r.old)}</td><td className="text-right font-bold">{money(r.new)}</td></tr>)}</tbody>
              </table>
            </div>
          )}
          <p className="text-xs text-slate-500">Always preview first. Applied changes are recorded in the activity log.</p>
        </div>}
      </Modal>
    </div>
  )
}
