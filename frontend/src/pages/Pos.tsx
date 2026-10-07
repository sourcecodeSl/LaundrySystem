import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import dayjs from 'dayjs'
import {
  Banknote, CheckCircle2, CreditCard, FileText, Home, Minus, PackagePlus, Pause, Play, Plus, Printer, Scale, ShoppingBag,
  StickyNote, Store, Tag, Trash2, X, Landmark, ReceiptText,
} from 'lucide-react'
import { toast } from 'sonner'
import { api, errorMessage } from '../lib/api'
import { useAuth } from '../lib/auth'
import { useCatalog, type Variant } from '../lib/catalog'
import { label, money, num, qty } from '../lib/format'
import { printReceipt, printTags } from '../lib/print'
import { CustomerPicker, type CustomerLite } from '../components/CustomerPicker'
import { useShift } from '../components/Layout'
import { Empty, Field, Input, Modal, Select, Spinner, Textarea, cx } from '../components/ui'

type Line = {
  uid: string; service_id: number | null; variant_id: number | null; description: string; pricing_type: string
  weight: number | null; quantity: number; unit_price: number; discount: number; notes: string; is_temporary: boolean
}
type Pay = { method: string; amount: string; reference?: string; bank?: string; cheque_no?: string; cheque_date?: string }

const uid = () => Math.random().toString(36).slice(2, 10)
const PAY_ICONS: Record<string, any> = { cash: Banknote, card: CreditCard, bank_transfer: Landmark, cheque: ReceiptText }

export default function Pos() {
  const [params] = useSearchParams()
  const quotationMode = params.get('mode') === 'quotation'
  const editQuotationId = params.get('quotation')
  const { can, lookups, branchId, me } = useAuth()
  const nav = useNavigate()
  const qc = useQueryClient()
  const cat = useCatalog()
  const shift = useShift()

  const [serviceId, setServiceId] = useState<number | null>(null)
  const [categoryId, setCategoryId] = useState<number | null>(null)
  const [lines, setLines] = useState<Line[]>([])
  const [customer, setCustomer] = useState<CustomerLite | null>(null)
  const [promotionId, setPromotionId] = useState('')
  const [discount, setDiscount] = useState('')
  const [delivery, setDelivery] = useState({ type: 'pickup', address: '', at: '' })
  const [notes, setNotes] = useState('')
  const [heldId, setHeldId] = useState<number | null>(null)
  const [weightFor, setWeightFor] = useState<Variant | null>(null)
  const [weightInput, setWeightInput] = useState('')
  const [quickOpen, setQuickOpen] = useState(false)
  const [quick, setQuick] = useState({ description: '', price: '', quantity: '1' })
  const [noteLine, setNoteLine] = useState<Line | null>(null)
  const [checkout, setCheckout] = useState(false)
  const [pays, setPays] = useState<Pay[]>([{ method: 'cash', amount: '' }])
  const [tendered, setTendered] = useState('')
  const [done, setDone] = useState<any>(null)
  const [heldOpen, setHeldOpen] = useState(false)
  const [quoteMeta, setQuoteMeta] = useState({ customer_name: '', customer_mobile: '', valid_until: dayjs().add(14, 'day').format('YYYY-MM-DD') })

  const workingBranch = branchId ?? me?.user.branch_id ?? lookups?.branches[0]?.id ?? null
  const needsBranch = !workingBranch

  useEffect(() => {
    if (cat.data && serviceId === null) setServiceId(cat.data.services[0]?.id ?? null)
  }, [cat.data, serviceId])

  // Load quotation for editing
  useEffect(() => {
    if (!editQuotationId) return
    api.get(`quotations/${editQuotationId}`).then(({ data }) => {
      setLines(data.items.map((i: any) => ({ uid: uid(), service_id: i.service_id, variant_id: i.variant_id, description: i.description, pricing_type: i.pricing_type,
        weight: i.weight, quantity: Number(i.quantity), unit_price: Number(i.unit_price), discount: 0, notes: i.notes ?? '', is_temporary: !i.variant_id })))
      if (data.customer) setCustomer(data.customer)
      setDiscount(data.discount ? String(data.discount) : '')
      setNotes(data.notes ?? '')
      setQuoteMeta({ customer_name: data.customer_name ?? '', customer_mobile: data.customer_mobile ?? '', valid_until: data.valid_until ?? '' })
    }).catch((e) => toast.error(errorMessage(e)))
  }, [editQuotationId])

  const payloadItems = lines.map((l) => ({
    service_id: l.service_id, variant_id: l.variant_id, weight: l.weight, quantity: l.quantity,
    unit_price: l.unit_price, discount: l.discount || 0, notes: l.notes || null, is_temporary: l.is_temporary, description: l.description,
  }))

  // Server-side totals (authoritative: promotions, tax, permissions applied)
  const calcKey = JSON.stringify([payloadItems, promotionId, discount, customer?.id])
  const calc = useQuery({
    queryKey: ['pos-calc', calcKey],
    queryFn: async () => (await api.post('pos/calculate', { items: payloadItems, promotion_id: promotionId || null, discount: Number(discount) || 0, customer_id: customer?.id })).data,
    enabled: lines.length > 0,
    retry: false,
  })
  const totals = lines.length ? calc.data : null
  const total = Number(totals?.total ?? 0)

  const variants = useMemo(() => {
    if (!cat.data || !serviceId) return []
    return cat.data.variants.filter((v) => cat.data.priceOf(v.id, serviceId) !== null && (!categoryId || v.category_id === categoryId))
  }, [cat.data, serviceId, categoryId])

  const service = cat.data?.services.find((s) => s.id === serviceId)

  const addVariant = (v: Variant, weight?: number) => {
    if (!cat.data || !serviceId || !service) return
    const price = cat.data.priceOf(v.id, serviceId) ?? 0
    if (v.pricing_type === 'weight_range' && weight === undefined) {
      setWeightFor(v)
      setWeightInput('')
      return
    }
    setLines((ls) => {
      if (v.pricing_type !== 'weight_range') {
        const ex = ls.find((l) => l.variant_id === v.id && l.service_id === serviceId && !l.notes)
        if (ex) return ls.map((l) => (l === ex ? { ...l, quantity: l.quantity + 1 } : l))
      }
      return [...ls, { uid: uid(), service_id: serviceId, variant_id: v.id, description: `${v.name} - ${service.name}`, pricing_type: v.pricing_type,
        weight: weight ?? null, quantity: 1, unit_price: price, discount: 0, notes: '', is_temporary: false }]
    })
  }

  const addByWeight = () => {
    const kg = Number(weightInput)
    if (!kg || kg <= 0 || !serviceId || !cat.data) return
    const v = weightFor ?? cat.data.variantForWeight(serviceId, kg)
    if (!v) return toast.error(`No weight range price for ${kg} kg on ${service?.name}`)
    if (weightFor && ((v.min_weight != null && kg < Number(v.min_weight)) || (v.max_weight != null && kg > Number(v.max_weight)))) {
      const alt = cat.data.variantForWeight(serviceId, kg)
      if (!alt) return toast.error('Weight is outside every configured range')
      addVariant(alt, kg)
    } else addVariant(v, kg)
    setWeightFor(null)
    setWeightInput('')
  }

  const update = (u: string, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.uid === u ? { ...l, ...patch } : l)))
  const remove = (u: string) => setLines((ls) => ls.filter((l) => l.uid !== u))

  const reset = () => {
    setLines([]); setCustomer(null); setPromotionId(''); setDiscount(''); setNotes(''); setHeldId(null)
    setDelivery({ type: 'pickup', address: '', at: '' }); setPays([{ method: 'cash', amount: '' }]); setTendered('')
  }

  const held = useQuery({ queryKey: ['held'], queryFn: async () => (await api.get('pos/held')).data, enabled: can('pos.hold') && !quotationMode })

  const hold = async () => {
    try {
      await api.post('pos/held', {
        branch_id: workingBranch, customer_id: customer?.id ?? null, label: customer?.name ?? `Bill ${dayjs().format('HH:mm')}`, total,
        cart: { items: lines, promotionId, discount, delivery, notes, customer },
      })
      if (heldId) await api.delete(`pos/held/${heldId}`)
      toast.success('Bill held')
      reset()
      qc.invalidateQueries({ queryKey: ['held'] })
    } catch (e) {
      toast.error(errorMessage(e))
    }
  }

  const recall = async (h: any) => {
    const { data } = await api.get(`pos/held/${h.id}`)
    const c = data.cart
    setLines(c.items ?? []); setCustomer(c.customer ?? data.customer ?? null); setPromotionId(c.promotionId ?? ''); setDiscount(c.discount ?? '')
    setDelivery(c.delivery ?? { type: 'pickup', address: '', at: '' }); setNotes(c.notes ?? ''); setHeldId(data.id); setHeldOpen(false)
    toast.success('Bill recalled')
  }

  const paid = pays.reduce((s, p) => s + (Number(p.amount) || 0), 0)
  const change = Math.max(0, (Number(tendered) || 0) - (Number(pays.find((p) => p.method === 'cash')?.amount) || 0))

  const placeOrder = useMutation({
    mutationFn: async () => (await api.post('orders', {
      branch_id: workingBranch, customer_id: customer?.id ?? null, promotion_id: promotionId || null, discount: Number(discount) || 0,
      held_bill_id: heldId, delivery_type: delivery.type, delivery_address: delivery.address || customer?.address || null,
      delivery_at: delivery.at ? dayjs(delivery.at).format('YYYY-MM-DD HH:mm:ss') : null, notes: notes || null, items: payloadItems,
      payments: pays.filter((p) => Number(p.amount) > 0).map((p) => ({ ...p, amount: Number(p.amount) })),
    })).data,
    onSuccess: (order) => {
      setCheckout(false)
      setDone(order)
      reset()
      qc.invalidateQueries({ queryKey: ['held'] })
      qc.invalidateQueries({ queryKey: ['shift-current'] })
      toast.success(`Order ${order.order_no} created`)
    },
    onError: (e) => toast.error(errorMessage(e)),
  })

  const saveQuotation = useMutation({
    mutationFn: async () => {
      const body = { branch_id: workingBranch, customer_id: customer?.id ?? null, discount: Number(discount) || 0, notes, items: payloadItems, ...quoteMeta }
      return (editQuotationId ? await api.put(`quotations/${editQuotationId}`, body) : await api.post('quotations', body)).data
    },
    onSuccess: (q) => {
      toast.success(`Quotation ${q.quotation_no} saved`)
      qc.invalidateQueries({ queryKey: ['quotations'] })
      nav('/quotations')
    },
    onError: (e) => toast.error(errorMessage(e)),
  })

  const openCheckout = () => {
    if (!totals) return
    setPays([{ method: 'cash', amount: String(total) }])
    setTendered('')
    setCheckout(true)
  }

  if (cat.isLoading) return <div className="grid h-96 place-items-center"><Spinner className="h-7 w-7 text-brand-500" /></div>
  if (!cat.data?.services.length) return <Empty title="No services configured" text="Add services, variants and prices first." />

  const shiftRequired = !quotationMode && lookups?.settings.general.require_shift === '1' && shift.isFetched && !shift.data

  return (
    <div className="grid gap-5 xl:grid-cols-[1fr_440px]">
      {/* Catalog */}
      <div className="min-w-0 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 text-xl font-bold">{quotationMode ? <><FileText className="h-5 w-5 text-brand-500" />{editQuotationId ? 'Edit quotation' : 'New quotation'}</> : <><ShoppingBag className="h-5 w-5 text-brand-500" />New order</>}</h1>
            {needsBranch && <p className="text-sm text-rose-600">Select a branch from the top bar first.</p>}
          </div>
          <div className="flex gap-2">
            {can('pos.temporary_item') && <button className="btn-secondary" onClick={() => { setQuick({ description: '', price: '', quantity: '1' }); setQuickOpen(true) }}><PackagePlus className="h-4 w-4" />Quick item</button>}
            {!quotationMode && can('pos.hold') && (
              <button className="btn-secondary relative" onClick={() => setHeldOpen(true)}><Play className="h-4 w-4" />Recall
                {held.data?.length > 0 && <span className="absolute -right-1.5 -top-1.5 grid h-5 min-w-5 place-items-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">{held.data.length}</span>}
              </button>
            )}
          </div>
        </div>

        {shiftRequired && (
          <div className="flex items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
            <span>No cashier shift is open. You must open a shift before taking orders.</span>
            <button className="btn-secondary btn-sm" onClick={() => nav('/shifts')}>Open shift</button>
          </div>
        )}

        {/* Services */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {cat.data.services.map((s) => (
            <button key={s.id} onClick={() => setServiceId(s.id)}
              className={cx('rounded-2xl border p-4 text-left transition', serviceId === s.id
                ? 'border-transparent bg-gradient-to-br from-brand-600 to-accent-500 text-white shadow-lg shadow-brand-500/30'
                : 'border-slate-200 bg-white hover:border-brand-300 dark:border-slate-800 dark:bg-slate-900')}>
              <p className="text-xs font-bold uppercase tracking-wider opacity-70">{s.code}</p>
              <p className="mt-1 font-bold">{s.name}</p>
              <p className="mt-1 text-xs opacity-70">~{s.processing_hours}h turnaround</p>
            </button>
          ))}
        </div>

        {/* Weight entry */}
        <div className="card flex flex-wrap items-end gap-3 p-4">
          <Field label={`Weigh & add · ${service?.name ?? ''}`} className="min-w-[180px] flex-1">
            <div className="relative">
              <Scale className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input className="input pl-9" type="number" step="0.01" min="0" placeholder="Weight in kg" value={weightFor ? '' : weightInput}
                onChange={(e) => { setWeightFor(null); setWeightInput(e.target.value) }} onKeyDown={(e) => e.key === 'Enter' && addByWeight()} />
            </div>
          </Field>
          <button className="btn-primary" onClick={addByWeight} disabled={!weightInput || !!weightFor}><Plus className="h-4 w-4" />Add by weight</button>
          <p className="w-full text-xs text-slate-500">Auto-selects the matching weight-range rate (per kg).</p>
        </div>

        {/* Category chips */}
        <div className="flex flex-wrap gap-2">
          {[{ id: null, name: 'All' }, ...cat.data.categories.filter((c) => c.name !== 'All')].map((c) => (
            <button key={String(c.id)} onClick={() => setCategoryId(c.id)}
              className={cx('rounded-full px-4 py-1.5 text-sm font-semibold transition', categoryId === c.id ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900' : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:ring-slate-300 dark:bg-slate-900 dark:text-slate-300 dark:ring-slate-700')}>
              {c.name}
            </button>
          ))}
        </div>

        {/* Variants */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 2xl:grid-cols-4">
          {variants.map((v) => {
            const price = cat.data.priceOf(v.id, serviceId!)
            return (
              <button key={v.id} onClick={() => addVariant(v)}
                className="group card flex flex-col items-start p-4 text-left transition hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-lg">
                <span className={cx('chip mb-2', v.pricing_type === 'weight_range' ? 'bg-cyan-100 text-cyan-700 dark:bg-cyan-500/15 dark:text-cyan-300' : v.pricing_type === 'per_item' ? 'bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300' : 'bg-brand-100 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300')}>
                  {v.pricing_type === 'weight_range' ? <Scale className="h-3 w-3" /> : <Tag className="h-3 w-3" />}{label(v.pricing_type)}
                </span>
                <span className="font-semibold leading-tight">{v.name}</span>
                <span className="mt-auto pt-2 text-lg font-extrabold text-brand-600 dark:text-brand-300">{money(price)}<span className="text-xs font-medium text-slate-400">{v.pricing_type === 'weight_range' ? ' /kg' : ` /${v.unit}`}</span></span>
              </button>
            )
          })}
          {!variants.length && <div className="col-span-full"><Empty title="No priced variants for this service" /></div>}
        </div>
      </div>

      {/* Cart */}
      <div className="xl:sticky xl:top-20 xl:h-[calc(100vh-6rem)]">
        <div className="card flex h-full flex-col">
          <div className="space-y-3 border-b border-slate-100 p-4 dark:border-slate-800">
            <CustomerPicker value={customer} onChange={setCustomer} />
            {quotationMode && !customer && (
              <div className="grid grid-cols-2 gap-2">
                <Input placeholder="Prospect name" value={quoteMeta.customer_name} onChange={(e) => setQuoteMeta({ ...quoteMeta, customer_name: e.target.value })} />
                <Input placeholder="Mobile" value={quoteMeta.customer_mobile} onChange={(e) => setQuoteMeta({ ...quoteMeta, customer_mobile: e.target.value })} />
              </div>
            )}
          </div>

          <div className="flex-1 space-y-2 overflow-y-auto p-4">
            {!lines.length && <Empty icon={<ShoppingBag className="h-7 w-7" />} title="Cart is empty" text="Pick a service and tap items to add them." />}
            {lines.map((l) => {
              const lineTotal = (l.pricing_type === 'weight_range' ? Number(l.weight) : l.quantity) * l.unit_price - (l.discount || 0)
              return (
                <div key={l.uid} className="rounded-2xl border border-slate-100 bg-slate-50/60 p-3 dark:border-slate-800 dark:bg-slate-800/40">
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{l.description}{l.is_temporary && <span className="chip ml-1 bg-amber-100 text-amber-700">Quick</span>}</p>
                      {l.notes && <p className="truncate text-xs italic text-amber-600">↳ {l.notes}</p>}
                    </div>
                    <p className="text-sm font-bold tabular-nums">{money(lineTotal)}</p>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    {l.pricing_type === 'weight_range' ? (
                      <div className="flex items-center gap-1"><input type="number" step="0.01" className="input w-20 px-2 py-1 text-sm" value={l.weight ?? ''} onChange={(e) => update(l.uid, { weight: Number(e.target.value) })} /><span className="text-xs text-slate-500">kg</span>
                        <input type="number" min="1" title="Pieces" className="input w-16 px-2 py-1 text-sm" value={l.quantity} onChange={(e) => update(l.uid, { quantity: Math.max(1, Number(e.target.value)) })} /><span className="text-xs text-slate-500">pcs</span></div>
                    ) : (
                      <div className="flex items-center rounded-xl bg-white ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-700">
                        <button className="p-1.5" onClick={() => l.quantity > 1 ? update(l.uid, { quantity: l.quantity - 1 }) : remove(l.uid)}><Minus className="h-3.5 w-3.5" /></button>
                        <input className="w-10 bg-transparent text-center text-sm font-semibold outline-none" value={l.quantity} onChange={(e) => update(l.uid, { quantity: Math.max(0.01, Number(e.target.value) || 1) })} />
                        <button className="p-1.5" onClick={() => update(l.uid, { quantity: l.quantity + 1 })}><Plus className="h-3.5 w-3.5" /></button>
                      </div>
                    )}
                    <span className="text-xs text-slate-400">×</span>
                    {can('pos.edit_price') || l.is_temporary
                      ? <input type="number" step="0.01" className="input w-24 px-2 py-1 text-sm" value={l.unit_price} onChange={(e) => update(l.uid, { unit_price: Number(e.target.value) })} />
                      : <span className="text-sm">{money(l.unit_price)}</span>}
                    {can('pos.discount') && <input type="number" step="0.01" placeholder="Disc." className="input w-20 px-2 py-1 text-sm" value={l.discount || ''} onChange={(e) => update(l.uid, { discount: Number(e.target.value) })} />}
                    <div className="ml-auto flex">
                      <button className="btn-icon" title="Notes (stains, damage…)" onClick={() => setNoteLine(l)}><StickyNote className={cx('h-4 w-4', l.notes && 'text-amber-500')} /></button>
                      <button className="btn-icon hover:!text-rose-600" onClick={() => remove(l.uid)}><Trash2 className="h-4 w-4" /></button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          <div className="space-y-3 border-t border-slate-100 p-4 dark:border-slate-800">
            {lines.length > 0 && (
              <div className="grid grid-cols-2 gap-2">
                {!quotationMode && (
                  <select className="input py-2 text-sm" value={promotionId} onChange={(e) => setPromotionId(e.target.value)}>
                    <option value="">No promotion</option>
                    {cat.data.promotions.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                )}
                {can('pos.discount') && <input className="input py-2 text-sm" type="number" step="0.01" placeholder="Bill discount" value={discount} onChange={(e) => setDiscount(e.target.value)} />}
              </div>
            )}
            {!quotationMode && lines.length > 0 && (
              <div className="grid grid-cols-2 gap-2">
                <div className="col-span-2 grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1 dark:bg-slate-800">
                  {[['pickup', 'Pickup', Store], ['home_delivery', 'Home delivery', Home]].map(([v, t, I]: any) => (
                    <button key={v} onClick={() => setDelivery({ ...delivery, type: v })}
                      className={cx('flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-semibold', delivery.type === v ? 'bg-white shadow-sm dark:bg-slate-900' : 'text-slate-500')}><I className="h-3.5 w-3.5" />{t}</button>
                  ))}
                </div>
                <input type="datetime-local" className="input col-span-2 py-2 text-sm" value={delivery.at} min={dayjs().format('YYYY-MM-DDTHH:mm')}
                  onChange={(e) => setDelivery({ ...delivery, at: e.target.value })} title="Delivery / pickup date & time" />
                {delivery.type === 'home_delivery' && <input className="input col-span-2 py-2 text-sm" placeholder="Delivery address" value={delivery.address || customer?.address || ''} onChange={(e) => setDelivery({ ...delivery, address: e.target.value })} />}
              </div>
            )}
            {quotationMode && <Field label="Valid until"><Input type="date" value={quoteMeta.valid_until} onChange={(e) => setQuoteMeta({ ...quoteMeta, valid_until: e.target.value })} /></Field>}
            {lines.length > 0 && <Textarea className="min-h-0 py-2 text-sm" rows={1} placeholder="Order notes / special instructions" value={notes} onChange={(e) => setNotes(e.target.value)} />}

            <div className="space-y-1 rounded-2xl bg-slate-50 p-3 text-sm dark:bg-slate-800/50">
              {calc.isError && <p className="text-xs font-medium text-rose-600">{errorMessage(calc.error)}</p>}
              <Row k="Subtotal" v={money(totals?.subtotal)} />
              {Number(totals?.discount) > 0 && <Row k="Discount" v={`- ${money(totals?.discount)}`} accent />}
              {Number(totals?.service_charge) > 0 && <Row k="Service charge" v={money(totals?.service_charge)} />}
              {Number(totals?.tax) > 0 && <Row k="Tax" v={money(totals?.tax)} />}
              <div className="flex items-end justify-between pt-1">
                <span className="font-semibold">Total {calc.isFetching && <Spinner className="ml-1 inline h-3 w-3" />}</span>
                <span className="text-2xl font-extrabold tracking-tight">{money(total)}</span>
              </div>
              {totals && <p className="text-xs text-slate-500">{qty(totals.total_weight)} kg · {totals.total_pieces} pcs</p>}
            </div>

            <div className="flex gap-2">
              <button className="btn-secondary px-3" title="Clear cart" disabled={!lines.length} onClick={reset}><X className="h-4 w-4" /></button>
              {!quotationMode && can('pos.hold') && <button className="btn-secondary" disabled={!lines.length || needsBranch} onClick={hold}><Pause className="h-4 w-4" />Hold</button>}
              {quotationMode
                ? <button className="btn-primary flex-1 py-3" disabled={!totals || saveQuotation.isPending || needsBranch} onClick={() => saveQuotation.mutate()}>{saveQuotation.isPending && <Spinner className="h-4 w-4" />}Save quotation</button>
                : <button className="btn-primary flex-1 py-3 text-base" disabled={!totals || calc.isFetching || needsBranch || shiftRequired} onClick={openCheckout}>Charge {money(total)}</button>}
            </div>
          </div>
        </div>
      </div>

      {/* Weight modal for a specific variant */}
      <Modal open={!!weightFor} onClose={() => setWeightFor(null)} title={`Weight · ${weightFor?.name}`} size="sm" footer={<>
        <button className="btn-secondary" onClick={() => setWeightFor(null)}>Cancel</button>
        <button className="btn-primary" onClick={addByWeight}>Add</button>
      </>}>
        <Field label="Weight (kg)" hint={weightFor ? `Range ${qty(weightFor.min_weight)} – ${weightFor.max_weight ? qty(weightFor.max_weight) : '∞'} kg` : ''}>
          <Input autoFocus type="number" step="0.01" value={weightInput} onChange={(e) => setWeightInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addByWeight()} />
        </Field>
      </Modal>

      {/* Quick sale item */}
      <Modal open={quickOpen} onClose={() => setQuickOpen(false)} title="Quick sale item" size="sm" footer={<>
        <button className="btn-secondary" onClick={() => setQuickOpen(false)}>Cancel</button>
        <button className="btn-primary" disabled={!quick.description || quick.price === ''} onClick={() => {
          setLines((ls) => [...ls, { uid: uid(), service_id: serviceId, variant_id: null, description: quick.description, pricing_type: 'per_item', weight: null,
            quantity: Number(quick.quantity) || 1, unit_price: Number(quick.price), discount: 0, notes: '', is_temporary: true }])
          setQuickOpen(false)
        }}>Add</button>
      </>}>
        <div className="space-y-4">
          <Field label="Description"><Input autoFocus value={quick.description} onChange={(e) => setQuick({ ...quick, description: e.target.value })} placeholder="e.g. Shoe cleaning" /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Price"><Input type="number" step="0.01" value={quick.price} onChange={(e) => setQuick({ ...quick, price: e.target.value })} /></Field>
            <Field label="Qty"><Input type="number" value={quick.quantity} onChange={(e) => setQuick({ ...quick, quantity: e.target.value })} /></Field>
          </div>
        </div>
      </Modal>

      {/* Line notes */}
      <Modal open={!!noteLine} onClose={() => setNoteLine(null)} title="Item notes" size="sm" footer={<button className="btn-primary" onClick={() => setNoteLine(null)}>Done</button>}>
        {noteLine && <>
          <div className="mb-3 flex flex-wrap gap-2">
            {['Stain', 'Torn', 'Button missing', 'Colour bleed risk', 'Delicate', 'Starch', 'No fold - hang'].map((t) => (
              <button key={t} className="chip cursor-pointer bg-slate-100 py-1 hover:bg-brand-100 dark:bg-slate-800" onClick={() => {
                const v = noteLine.notes ? `${noteLine.notes}, ${t}` : t
                update(noteLine.uid, { notes: v }); setNoteLine({ ...noteLine, notes: v })
              }}>{t}</button>
            ))}
          </div>
          <Textarea autoFocus value={noteLine.notes} maxLength={250} placeholder="Stains, damage, special instructions…"
            onChange={(e) => { update(noteLine.uid, { notes: e.target.value }); setNoteLine({ ...noteLine, notes: e.target.value }) }} />
        </>}
      </Modal>

      {/* Held bills */}
      <Modal open={heldOpen} onClose={() => setHeldOpen(false)} title="Held bills">
        {!held.data?.length ? <Empty title="No held bills" /> : (
          <div className="space-y-2">
            {held.data.map((h: any) => (
              <div key={h.id} className="flex items-center gap-3 rounded-2xl border border-slate-100 p-3 dark:border-slate-800">
                <div className="flex-1"><p className="font-semibold">{h.label}</p><p className="text-xs text-slate-500">{dayjs(h.created_at).format('DD MMM, hh:mm A')} · {h.user?.name}</p></div>
                <b>{money(h.total)}</b>
                <button className="btn-primary btn-sm" onClick={() => recall(h)}>Recall</button>
                <button className="btn-icon" onClick={async () => { await api.delete(`pos/held/${h.id}`); held.refetch() }}><Trash2 className="h-4 w-4" /></button>
              </div>
            ))}
          </div>
        )}
      </Modal>

      {/* Checkout */}
      <Modal open={checkout} onClose={() => setCheckout(false)} title="Payment" size="md" footer={<>
        <button className="btn-secondary" onClick={() => setCheckout(false)}>Back</button>
        <button className="btn-success" disabled={placeOrder.isPending || paid > total + 0.001 || (paid < total - 0.001 && !customer)} onClick={() => placeOrder.mutate()}>
          {placeOrder.isPending && <Spinner className="h-4 w-4" />}{paid >= total ? 'Complete order' : paid > 0 ? 'Save with advance' : 'Save as unpaid'}
        </button>
      </>}>
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3 text-center">
            <Box k="Total" v={money(total)} />
            <Box k="Paying" v={money(paid)} tone="text-emerald-600" />
            <Box k="Balance" v={money(Math.max(0, total - paid))} tone={total - paid > 0 ? 'text-rose-600' : ''} />
          </div>
          {paid < total - 0.001 && !customer && <p className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">Select a customer to keep a pending balance (advance payment).</p>}
          {pays.map((p, idx) => {
            const I = PAY_ICONS[p.method] ?? Banknote
            return (
              <div key={idx} className="space-y-2 rounded-2xl border border-slate-100 p-3 dark:border-slate-800">
                <div className="flex gap-2">
                  <div className="relative w-44">
                    <I className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <Select className="pl-9" value={p.method} options={(lookups?.payment_methods ?? ['cash']).map((m) => ({ value: m, label: label(m) }))}
                      onChange={(e) => setPays(pays.map((x, i) => (i === idx ? { ...x, method: e.target.value } : x)))} />
                  </div>
                  <Input type="number" step="0.01" placeholder="Amount" value={p.amount} onChange={(e) => setPays(pays.map((x, i) => (i === idx ? { ...x, amount: e.target.value } : x)))} />
                  {pays.length > 1 && <button className="btn-icon" onClick={() => setPays(pays.filter((_, i) => i !== idx))}><X className="h-4 w-4" /></button>}
                </div>
                {p.method !== 'cash' && (
                  <div className="grid grid-cols-2 gap-2">
                    <Input placeholder={p.method === 'card' ? 'Card ref / last 4' : 'Reference'} value={p.reference ?? ''} onChange={(e) => setPays(pays.map((x, i) => (i === idx ? { ...x, reference: e.target.value } : x)))} />
                    <Input placeholder="Bank" value={p.bank ?? ''} onChange={(e) => setPays(pays.map((x, i) => (i === idx ? { ...x, bank: e.target.value } : x)))} />
                    {p.method === 'cheque' && <>
                      <Input placeholder="Cheque no *" value={p.cheque_no ?? ''} onChange={(e) => setPays(pays.map((x, i) => (i === idx ? { ...x, cheque_no: e.target.value } : x)))} />
                      <Input type="date" value={p.cheque_date ?? ''} onChange={(e) => setPays(pays.map((x, i) => (i === idx ? { ...x, cheque_date: e.target.value } : x)))} />
                    </>}
                  </div>
                )}
              </div>
            )
          })}
          <div className="flex flex-wrap gap-2">
            <button className="btn-secondary btn-sm" onClick={() => setPays([...pays, { method: 'card', amount: String(num(Math.max(0, total - paid))) }])}><Plus className="h-3.5 w-3.5" />Split payment</button>
            <button className="btn-secondary btn-sm" onClick={() => setPays([{ method: 'cash', amount: '' }])}>Pay later</button>
            <button className="btn-secondary btn-sm" onClick={() => setPays([{ method: 'cash', amount: String(num(total / 2)) }])}>50% advance</button>
          </div>
          {pays.some((p) => p.method === 'cash') && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Cash tendered"><Input type="number" step="0.01" value={tendered} onChange={(e) => setTendered(e.target.value)} /></Field>
              <div><span className="label">Change</span><p className="text-2xl font-extrabold text-emerald-600">{money(change)}</p></div>
            </div>
          )}
        </div>
      </Modal>

      {/* Done */}
      <Modal open={!!done} onClose={() => setDone(null)} title="Order created" size="sm">
        {done && (
          <div className="text-center">
            <CheckCircle2 className="mx-auto h-14 w-14 text-emerald-500" />
            <p className="mt-3 text-sm text-slate-500">Order {done.order_no}</p>
            <p className="text-5xl font-extrabold tracking-tight">#{done.queue_no}</p>
            <p className="mt-1 text-sm text-slate-500">Queue number · Balance {money(done.balance)}</p>
            <div className="mt-6 grid grid-cols-2 gap-2">
              <button className="btn-primary" onClick={() => lookups && printReceipt(done, lookups.settings)}><Printer className="h-4 w-4" />Receipt</button>
              <button className="btn-secondary" onClick={() => lookups && printTags(done, lookups.settings)}><Tag className="h-4 w-4" />Tags</button>
              <button className="btn-secondary" onClick={() => nav(`/orders/${done.id}`)}>View order</button>
              <button className="btn-secondary" onClick={() => setDone(null)}>New order</button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}

const Row = ({ k, v, accent }: { k: string; v: string; accent?: boolean }) => (
  <div className="flex justify-between"><span className="text-slate-500">{k}</span><span className={cx('tabular-nums', accent && 'font-semibold text-emerald-600')}>{v}</span></div>
)
const Box = ({ k, v, tone }: { k: string; v: string; tone?: string }) => (
  <div className="rounded-2xl bg-slate-50 p-3 dark:bg-slate-800/60"><p className="text-xs font-semibold uppercase text-slate-500">{k}</p><p className={cx('mt-1 text-lg font-extrabold', tone)}>{v}</p></div>
)
