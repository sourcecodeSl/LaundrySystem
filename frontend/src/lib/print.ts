import JsBarcode from 'jsbarcode'
import { dateTime, label, money, qty } from './format'

/** HTML-escape anything that originates from data before putting it in print markup. */
export const esc = (v: unknown) =>
  String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

/** Print arbitrary HTML through a hidden, sandboxed iframe. */
export function printHtml(body: string, css = '', copies = 1) {
  const frame = document.createElement('iframe')
  frame.setAttribute('sandbox', 'allow-modals allow-same-origin')
  Object.assign(frame.style, { position: 'fixed', right: '0', bottom: '0', width: '0', height: '0', border: '0' })
  document.body.appendChild(frame)
  const doc = frame.contentDocument!
  const content = Array.from({ length: Math.max(1, copies) }, () => body).join('<div style="page-break-after:always"></div>')
  doc.open()
  doc.write(`<!doctype html><html><head><meta charset="utf-8"><title>Print</title><style>
    *{box-sizing:border-box} body{margin:0;font-family:'Segoe UI',Arial,sans-serif;color:#000} ${css}</style></head><body>${content}</body></html>`)
  doc.close()
  setTimeout(() => {
    frame.contentWindow?.focus()
    frame.contentWindow?.print()
    setTimeout(() => frame.remove(), 1000)
  }, 250)
}

export function barcodeSvg(value: string, opts: { height?: number; width?: number; fontSize?: number; displayValue?: boolean } = {}) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  try {
    JsBarcode(svg, value, { format: 'CODE128', height: opts.height ?? 40, width: opts.width ?? 1.4, fontSize: opts.fontSize ?? 11, margin: 0, displayValue: opts.displayValue ?? true })
  } catch {
    return ''
  }
  return svg.outerHTML
}

type Settings = { general: Record<string, string>; receipt: Record<string, string> }

export function printReceipt(order: any, settings: Settings, opts: { reprint?: boolean } = {}) {
  const r = settings.receipt
  const g = settings.general
  const width = r.paper_width === 'A4' ? '190mm' : `${Number(r.paper_width || 80) - 6}mm`
  const on = (k: string) => r[k] === '1'
  const items = (order.items ?? []).map((it: any) => `
    <tr><td colspan="3" class="b">${esc(it.description)}</td></tr>
    <tr><td>${it.pricing_type === 'weight_range' ? `${qty(it.weight)} kg × ${money(it.unit_price, false)}` : `${qty(it.quantity)} × ${money(it.unit_price, false)}`}</td>
      <td></td><td class="r">${money(it.total, false)}</td></tr>
    ${on('show_item_notes') && it.notes ? `<tr><td colspan="3" class="note">↳ ${esc(it.notes)}</td></tr>` : ''}`).join('')
  const payments = (order.payments ?? []).map((p: any) => `<tr><td>${esc(label(p.method))}</td><td></td><td class="r">${money(p.amount, false)}</td></tr>`).join('')

  const html = `<div class="rc">
    <div class="c">
      ${on('show_logo') ? '<div class="logo">🧺</div>' : ''}
      <div class="h1">${esc(g.business_name)}</div>
      <div>${esc(order.branch?.name ?? '')}</div>
      <div class="s">${esc(order.branch?.address ?? g.address)}</div>
      <div class="s">${esc(order.branch?.phone ?? g.phone)}</div>
      ${r.header_text ? `<div class="s mt">${esc(r.header_text)}</div>` : ''}
    </div>
    ${opts.reprint ? '<div class="c b mt">*** REPRINT ***</div>' : ''}
    ${on('show_queue_no') ? `<div class="queue">QUEUE #${esc(order.queue_no)}</div>` : ''}
    <table>
      <tr><td>Order</td><td colspan="2" class="r b">${esc(order.order_no)}</td></tr>
      <tr><td>Receipt</td><td colspan="2" class="r">${esc(order.receipt_no)}</td></tr>
      <tr><td>Date</td><td colspan="2" class="r">${esc(dateTime(order.created_at))}</td></tr>
      ${on('show_customer') && order.customer ? `<tr><td>Customer</td><td colspan="2" class="r">${esc(order.customer.name)}<br>${esc(order.customer.mobile)}</td></tr>` : ''}
      <tr><td>${order.delivery_type === 'home_delivery' ? 'Delivery' : 'Pickup'}</td><td colspan="2" class="r">${esc(dateTime(order.delivery_at))}</td></tr>
      ${order.user ? `<tr><td>Cashier</td><td colspan="2" class="r">${esc(order.user.name)}</td></tr>` : ''}
    </table>
    <div class="hr"></div>
    <table>${items}</table>
    <div class="hr"></div>
    <table>
      <tr><td>Subtotal</td><td></td><td class="r">${money(order.subtotal, false)}</td></tr>
      ${Number(order.discount) ? `<tr><td>Discount</td><td></td><td class="r">-${money(order.discount, false)}</td></tr>` : ''}
      ${on('show_tax_breakdown') && Number(order.service_charge) ? `<tr><td>Service charge</td><td></td><td class="r">${money(order.service_charge, false)}</td></tr>` : ''}
      ${on('show_tax_breakdown') && Number(order.tax) ? `<tr><td>Tax</td><td></td><td class="r">${money(order.tax, false)}</td></tr>` : ''}
      <tr class="tot"><td>TOTAL</td><td></td><td class="r">${money(order.total)}</td></tr>
      ${payments}
      ${Number(order.returned) ? `<tr><td>Returned</td><td></td><td class="r">-${money(order.returned, false)}</td></tr>` : ''}
      <tr class="b"><td>Balance due</td><td></td><td class="r">${money(order.balance)}</td></tr>
    </table>
    <div class="s">Weight: ${qty(order.total_weight)} kg · Pieces: ${order.total_pieces}</div>
    ${order.notes ? `<div class="s mt">Notes: ${esc(order.notes)}</div>` : ''}
    ${on('show_barcode') ? `<div class="c mt">${barcodeSvg(order.order_no, { height: 36 })}</div>` : ''}
    ${r.footer_text ? `<div class="c s mt">${esc(r.footer_text)}</div>` : ''}
  </div>`

  printHtml(html, `
    @page{margin:${r.paper_width === 'A4' ? '12mm' : '2mm'}}
    .rc{width:${width};margin:0 auto;font-size:${r.paper_width === '58' ? '10px' : '12px'}}
    table{width:100%;border-collapse:collapse} td{padding:1px 0;vertical-align:top}
    .r{text-align:right}.c{text-align:center}.b{font-weight:700}.s{font-size:.85em;color:#333}.mt{margin-top:6px}
    .note{font-size:.85em;font-style:italic;padding-left:6px}
    .h1{font-size:1.35em;font-weight:800}.logo{font-size:2em}
    .queue{margin:8px 0;text-align:center;font-size:1.6em;font-weight:800;border:2px dashed #000;padding:4px}
    .hr{border-top:1px dashed #000;margin:6px 0}.tot td{font-size:1.2em;font-weight:800;border-top:1px solid #000;padding-top:3px}
    svg{max-width:100%}`, Number(r.copies || 1))
}

/** Garment tags: one barcode tag per piece (module 48). */
export function printTags(order: any, settings: Settings) {
  const tags: string[] = []
  for (const it of order.items ?? []) {
    const pieces = Math.max(1, Math.round(Number(it.quantity)))
    for (let n = 1; n <= pieces; n++) {
      tags.push(`<div class="tag">
        <div class="top"><b>#${esc(order.queue_no)}</b><span>${esc(settings.general.business_name)}</span></div>
        <div class="desc">${esc(it.description)}</div>
        <div class="cust">${esc(order.customer?.name ?? 'Walk-in')} ${order.customer?.mobile ? '· ' + esc(order.customer.mobile) : ''}</div>
        ${barcodeSvg(it.tag_code ?? order.order_no, { height: 30, width: 1.2, fontSize: 9 })}
        <div class="foot"><span>${n}/${pieces}</span><span>Due ${esc(dateTime(order.delivery_at))}</span></div>
        ${it.notes ? `<div class="note">${esc(it.notes)}</div>` : ''}
      </div>`)
    }
  }
  printHtml(tags.join(''), `
    @page{size:50mm 35mm;margin:1mm}
    .tag{width:48mm;height:33mm;padding:1mm;overflow:hidden;font-size:8px;page-break-after:always;display:flex;flex-direction:column;gap:1px}
    .top{display:flex;justify-content:space-between;font-size:10px}.desc{font-weight:700;font-size:9px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .foot{display:flex;justify-content:space-between}.note{font-style:italic;white-space:nowrap;overflow:hidden}
    svg{width:100%;height:auto;max-height:15mm}`)
}
