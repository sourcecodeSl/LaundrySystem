import { useState, type ReactNode } from 'react'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Download, Pencil, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { api, errorMessage, fieldErrors, type Paginated } from '../lib/api'
import { useAuth } from '../lib/auth'
import { exportExcel } from '../lib/exportExcel'
import { DataTable, type Column } from './DataTable'
import { Card, Confirm, Field, Input, Modal, PageHeader, Pagination, SearchInput, Select, Spinner, Textarea, Toggle, cx } from './ui'

type Option = { value: string | number; label: string }
export type FieldDef = {
  name: string
  label: string
  type?: 'text' | 'number' | 'email' | 'textarea' | 'select' | 'toggle' | 'date' | 'password' | 'tel'
  options?: Option[]
  optionsFrom?: { endpoint: string; label: (row: any) => string; params?: Record<string, unknown> }
  required?: boolean
  createOnly?: boolean
  full?: boolean
  placeholder?: string
  hint?: string
  default?: unknown
  step?: string
  visible?: (form: Record<string, any>) => boolean
}
export type FilterDef = { name: string; label: string; options: Option[] }

export type ResourceConfig<T> = {
  title: string
  subtitle?: string
  icon?: ReactNode
  endpoint: string
  permissions: { create?: string; update?: string; delete?: string }
  columns: Column<T>[]
  fields: FieldDef[]
  filters?: FilterDef[]
  exportName?: string
  exportPermission?: string
  searchPlaceholder?: string
  sendBranch?: boolean
  rowActions?: (row: T) => ReactNode
  headerActions?: ReactNode
  modalSize?: 'sm' | 'md' | 'lg'
  toPayload?: (form: Record<string, any>, editing: T | null) => Record<string, any>
  canEdit?: (row: T) => boolean
}

function useOptions(f: FieldDef) {
  const q = useQuery({
    queryKey: [f.optionsFrom?.endpoint, 'options', f.optionsFrom?.params],
    queryFn: async () => (await api.get(f.optionsFrom!.endpoint, { params: { all: 1, ...f.optionsFrom!.params } })).data.data as any[],
    enabled: !!f.optionsFrom,
    staleTime: 60_000,
  })
  if (f.options) return f.options
  return (q.data ?? []).map((r) => ({ value: r.id, label: f.optionsFrom!.label(r) }))
}

function FormField({ f, value, onChange, error }: { f: FieldDef; value: any; onChange: (v: any) => void; error?: string }) {
  const options = useOptions(f)
  const common = { placeholder: f.placeholder, required: f.required }
  let control: ReactNode
  switch (f.type) {
    case 'textarea':
      control = <Textarea {...common} value={value ?? ''} onChange={(e) => onChange(e.target.value)} />
      break
    case 'select':
      control = <Select {...common} options={options} placeholder="— Select —" value={value ?? ''} onChange={(e) => onChange(e.target.value === '' ? null : e.target.value)} />
      break
    case 'toggle':
      control = <div className="pt-1"><Toggle checked={!!value} onChange={onChange} label={value ? 'Yes' : 'No'} /></div>
      break
    default:
      control = <Input {...common} type={f.type ?? 'text'} step={f.step ?? (f.type === 'number' ? 'any' : undefined)} value={value ?? ''}
        autoComplete={f.type === 'password' ? 'new-password' : 'off'}
        onChange={(e) => onChange(f.type === 'number' ? (e.target.value === '' ? null : e.target.value) : e.target.value)} />
  }
  return <Field label={f.label + (f.required ? ' *' : '')} error={error} hint={f.hint} className={f.full || f.type === 'textarea' ? 'sm:col-span-2' : ''}>{control}</Field>
}

export function ResourcePage<T extends { id: number }>(cfg: ResourceConfig<T>) {
  const { can, branchId } = useAuth()
  const qc = useQueryClient()
  const [page, setPage] = useState(1)
  const [q, setQ] = useState('')
  const [filters, setFilters] = useState<Record<string, string>>({})
  const [editing, setEditing] = useState<T | null>(null)
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState<Record<string, any>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [deleting, setDeleting] = useState<T | null>(null)
  const [exporting, setExporting] = useState(false)

  const params = { page, q, ...filters, ...(cfg.sendBranch && branchId ? { branch_id: branchId } : {}) }
  const list = useQuery({
    queryKey: [cfg.endpoint, params],
    queryFn: async () => (await api.get<Paginated<T>>(cfg.endpoint, { params })).data,
    placeholderData: keepPreviousData,
  })

  const save = useMutation({
    mutationFn: async () => {
      const allowed = cfg.fields.filter((f) => !(editing && f.createOnly)).map((f) => f.name)
      const clean = Object.fromEntries(Object.entries(form).filter(([k]) => allowed.includes(k)))
      const payload = cfg.toPayload ? cfg.toPayload(clean, editing) : clean
      if (cfg.sendBranch && branchId && !editing) payload.branch_id ??= branchId
      return editing ? api.put(`${cfg.endpoint}/${editing.id}`, payload) : api.post(cfg.endpoint, payload)
    },
    onSuccess: () => {
      toast.success(editing ? 'Saved changes' : 'Created successfully')
      setOpen(false)
      qc.invalidateQueries({ queryKey: [cfg.endpoint] })
    },
    onError: (e) => {
      setErrors(fieldErrors(e))
      toast.error(errorMessage(e))
    },
  })

  const remove = useMutation({
    mutationFn: (row: T) => api.delete(`${cfg.endpoint}/${row.id}`),
    onSuccess: () => {
      toast.success('Deleted')
      setDeleting(null)
      qc.invalidateQueries({ queryKey: [cfg.endpoint] })
    },
    onError: (e) => toast.error(errorMessage(e)),
  })

  const openForm = (row: T | null) => {
    setEditing(row)
    setErrors({})
    const init: Record<string, any> = {}
    cfg.fields.forEach((f) => {
      const v = row ? (row as any)[f.name] : f.default ?? (f.type === 'toggle' ? true : null)
      init[f.name] = v
    })
    setForm(init)
    setOpen(true)
  }

  const doExport = async () => {
    setExporting(true)
    try {
      const { data } = await api.get(cfg.endpoint, { params: { ...params, all: 1, export: 1 } })
      exportExcel<T>(data.data, cfg.columns.filter((c) => typeof c.header === 'string' && c.key !== 'actions').map((c) => ({
        header: c.header as string,
        value: (r) => {
          const v = (r as any)[c.key]
          return v !== null && typeof v === 'object' ? v.name ?? JSON.stringify(v) : v
        },
      })), cfg.exportName ?? cfg.title.toLowerCase().replace(/\s+/g, '-'))
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setExporting(false)
    }
  }

  const canUpdate = !!cfg.permissions.update && can(cfg.permissions.update)
  const canDelete = !!cfg.permissions.delete && can(cfg.permissions.delete)
  const columns: Column<T>[] = [...cfg.columns]
  if (canUpdate || canDelete || cfg.rowActions) {
    columns.push({
      key: 'actions', header: '', align: 'right', className: 'w-1 whitespace-nowrap',
      render: (row) => (
        <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
          {cfg.rowActions?.(row)}
          {canUpdate && (cfg.canEdit?.(row) ?? true) && <button className="btn-icon" title="Edit" onClick={() => openForm(row)}><Pencil className="h-4 w-4" /></button>}
          {canDelete && <button className="btn-icon hover:!text-rose-600" title="Delete" onClick={() => setDeleting(row)}><Trash2 className="h-4 w-4" /></button>}
        </div>
      ),
    })
  }

  const visibleFields = cfg.fields.filter((f) => (!f.createOnly || !editing) && (!f.visible || f.visible(form)))

  return (
    <div>
      <PageHeader title={cfg.title} subtitle={cfg.subtitle} icon={cfg.icon} actions={<>
        {cfg.headerActions}
        {(!cfg.exportPermission || can(cfg.exportPermission)) && (
          <button className="btn-secondary" onClick={doExport} disabled={exporting}>{exporting ? <Spinner className="h-4 w-4" /> : <Download className="h-4 w-4" />}Excel</button>
        )}
        {cfg.permissions.create && can(cfg.permissions.create) && (
          <button className="btn-primary" onClick={() => openForm(null)}><Plus className="h-4 w-4" />Add new</button>
        )}
      </>} />

      <Card padded={false}>
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 p-4 dark:border-slate-800">
          <SearchInput className="min-w-[220px] flex-1" value={q} onChange={(v) => { setQ(v); setPage(1) }} placeholder={cfg.searchPlaceholder} />
          {cfg.filters?.map((f) => (
            <Select key={f.name} className="w-auto min-w-[150px]" options={f.options} placeholder={`All ${f.label}`} value={filters[f.name] ?? ''}
              onChange={(e) => { setFilters((s) => ({ ...s, [f.name]: e.target.value })); setPage(1) }} />
          ))}
        </div>
        <DataTable columns={columns} rows={list.data?.data ?? []} loading={list.isFetching} error={list.error} onRetry={() => list.refetch()} />
        {list.data && <Pagination page={list.data.current_page} last={list.data.last_page} total={list.data.total} onPage={setPage} />}
      </Card>

      <Modal open={open} onClose={() => setOpen(false)} size={cfg.modalSize ?? 'md'} title={`${editing ? 'Edit' : 'New'} ${cfg.title.replace(/s$/, '')}`}
        footer={<>
          <button className="btn-secondary" onClick={() => setOpen(false)}>Cancel</button>
          <button className="btn-primary" disabled={save.isPending} onClick={() => save.mutate()}>{save.isPending && <Spinner className="h-4 w-4" />}Save</button>
        </>}>
        <form className={cx('grid gap-4 sm:grid-cols-2')} onSubmit={(e) => { e.preventDefault(); save.mutate() }}>
          {visibleFields.map((f) => (
            <FormField key={f.name} f={f} value={form[f.name]} error={errors[f.name]} onChange={(v) => setForm((s) => ({ ...s, [f.name]: v }))} />
          ))}
          <button type="submit" className="hidden" />
        </form>
      </Modal>

      <Confirm open={!!deleting} title="Delete record?" message="This action cannot be undone." busy={remove.isPending} confirmText="Delete"
        onClose={() => setDeleting(null)} onConfirm={() => deleting && remove.mutate(deleting)} />
    </div>
  )
}

export const yesNo = (v: unknown) => (
  <span className={cx('chip', v ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300' : 'bg-slate-100 text-slate-500 dark:bg-slate-800')}>{v ? 'Active' : 'Inactive'}</span>
)
