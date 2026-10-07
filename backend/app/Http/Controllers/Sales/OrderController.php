<?php

namespace App\Http\Controllers\Sales;

use App\Http\Controllers\Controller;
use App\Models\Order;
use App\Services\OrderService;
use App\Services\Sms;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class OrderController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $this->authorize('orders.view');
        $q = Order::visibleTo($request->user(), $request->integer('branch_id') ?: null)
            ->with(['customer:id,name,mobile', 'branch:id,name,code', 'user:id,name']);

        if ($s = mb_substr(trim((string) $request->query('q')), 0, 100)) {
            $q->where(function ($w) use ($s) {
                $w->where('order_no', 'like', "%$s%")->orWhere('receipt_no', 'like', "%$s%")
                    ->orWhereHas('customer', fn ($c) => $c->where('mobile', 'like', "%$s%")->orWhere('name', 'like', "%$s%"));
                if (ctype_digit($s)) {
                    $w->orWhere('queue_no', (int) $s);
                }
            });
        }
        foreach (['status', 'payment_status', 'delivery_type', 'customer_id', 'user_id'] as $f) {
            if ($request->filled($f) && is_scalar($request->query($f))) {
                $q->where($f, $request->query($f));
            }
        }
        if ($from = $request->date('from')) {
            $q->whereDate('created_at', '>=', $from);
        }
        if ($to = $request->date('to')) {
            $q->whereDate('created_at', '<=', $to);
        }
        if ($request->boolean('due_today')) {
            $q->whereDate('delivery_at', today())->whereNotIn('status', ['delivered', 'cancelled']);
        }

        $sort = in_array($request->query('sort'), ['id', 'created_at', 'total', 'balance', 'delivery_at', 'queue_no'], true) ? $request->query('sort') : 'id';
        $q->orderBy($sort, $request->query('dir') === 'asc' ? 'asc' : 'desc');

        if ($request->boolean('all')) {
            $this->authorize('orders.export');

            return response()->json(['data' => $q->limit(10000)->get()]);
        }

        return response()->json($q->paginate(min(max($request->integer('per_page', 20), 1), 100)));
    }

    public function show(Request $request, int $id): JsonResponse
    {
        $this->authorize('orders.view');
        $order = Order::visibleTo($request->user())->with([
            'items.service:id,name', 'items.variant:id,name', 'payments.user:id,name', 'customer', 'branch', 'user:id,name',
            'histories.user:id,name', 'promotion:id,name',
        ])->findOrFail($id);

        return response()->json($order->makeVisible('ebill_token')->toArray() + ['ebill_url' => Sms::ebillUrl($order)]);
    }

    public function store(Request $request): JsonResponse
    {
        $this->authorize('pos.access');
        $data = $request->validate([
            'branch_id' => ['nullable', 'integer'],
            'customer_id' => ['nullable', 'integer'],
            'promotion_id' => ['nullable', 'integer'],
            'held_bill_id' => ['nullable', 'integer'],
            'quotation_id' => ['nullable', 'integer', 'exists:quotations,id'],
            'discount' => ['nullable', 'numeric', 'min:0'],
            'delivery_type' => ['required', Rule::in(['pickup', 'home_delivery'])],
            'delivery_address' => ['nullable', 'required_if:delivery_type,home_delivery', 'string', 'max:255'],
            'delivery_at' => ['nullable', 'date', 'after:now'],
            'notes' => ['nullable', 'string', 'max:1000'],
            'items' => ['required', 'array', 'min:1', 'max:200'],
            'items.*.service_id' => ['nullable', 'integer'],
            'items.*.variant_id' => ['nullable', 'integer'],
            'items.*.weight' => ['nullable', 'numeric', 'min:0', 'max:9999'],
            'items.*.quantity' => ['required', 'numeric', 'min:0.01', 'max:9999'],
            'items.*.unit_price' => ['nullable', 'numeric', 'min:0', 'max:9999999'],
            'items.*.discount' => ['nullable', 'numeric', 'min:0'],
            'items.*.is_temporary' => ['boolean'],
            'items.*.description' => ['nullable', 'string', 'max:200'],
            'items.*.notes' => ['nullable', 'string', 'max:250'],
            'payments' => ['array', 'max:10'],
            'payments.*.method' => ['required', Rule::in(Order::PAYMENT_METHODS)],
            'payments.*.amount' => ['required', 'numeric', 'min:0', 'max:99999999'],
            'payments.*.reference' => ['nullable', 'string', 'max:100'],
            'payments.*.bank' => ['nullable', 'string', 'max:100'],
            'payments.*.cheque_no' => ['nullable', 'string', 'max:50'],
            'payments.*.cheque_date' => ['nullable', 'date'],
        ]);

        $order = OrderService::create($data, $request->user());

        return response()->json($order->makeVisible('ebill_token')->toArray() + ['ebill_url' => Sms::ebillUrl($order)], 201);
    }

    /** Edit delivery details and notes (items are locked once billed). */
    public function update(Request $request, int $id): JsonResponse
    {
        $this->authorize('orders.update');
        $order = Order::visibleTo($request->user())->findOrFail($id);
        $data = $request->validate([
            'delivery_type' => ['sometimes', Rule::in(['pickup', 'home_delivery'])],
            'delivery_address' => ['nullable', 'string', 'max:255'],
            'delivery_at' => ['nullable', 'date'],
            'notes' => ['nullable', 'string', 'max:1000'],
            'item_notes' => ['array'],
            'item_notes.*' => ['nullable', 'string', 'max:250'],
        ]);
        $order->update(collect($data)->except('item_notes')->all());
        foreach ($data['item_notes'] ?? [] as $itemId => $note) {
            $order->items()->whereKey($itemId)->update(['notes' => $note]);
        }

        return $this->show($request, $id);
    }

    public function status(Request $request, int $id): JsonResponse
    {
        $this->authorize('orders.status');
        $order = Order::visibleTo($request->user())->findOrFail($id);
        $data = $request->validate([
            'status' => ['required', Rule::in(OrderService::FLOW)],
            'note' => ['nullable', 'string', 'max:255'],
        ]);
        OrderService::updateStatus($order, $data['status'], $data['note'] ?? null, $request->user());

        return $this->show($request, $id);
    }

    /** Bulk status update from the production board. */
    public function bulkStatus(Request $request): JsonResponse
    {
        $this->authorize('orders.status');
        $data = $request->validate([
            'ids' => ['required', 'array', 'max:200'],
            'ids.*' => ['integer'],
            'status' => ['required', Rule::in(OrderService::FLOW)],
        ]);
        $errors = [];
        foreach (Order::visibleTo($request->user())->whereIn('id', $data['ids'])->get() as $order) {
            try {
                OrderService::updateStatus($order, $data['status'], 'Bulk update', $request->user());
            } catch (\Illuminate\Validation\ValidationException $e) {
                $errors[$order->order_no] = collect($e->errors())->flatten()->first();
            }
        }

        return response()->json(['message' => 'Updated', 'errors' => $errors]);
    }

    public function payment(Request $request, int $id): JsonResponse
    {
        $this->authorize('orders.payment');
        $order = Order::visibleTo($request->user())->findOrFail($id);
        $data = $request->validate([
            'method' => ['required', Rule::in(Order::PAYMENT_METHODS)],
            'amount' => ['required', 'numeric', 'min:0.01', 'max:99999999'],
            'reference' => ['nullable', 'string', 'max:100'],
            'bank' => ['nullable', 'string', 'max:100'],
            'cheque_no' => ['nullable', 'required_if:method,cheque', 'string', 'max:50'],
            'cheque_date' => ['nullable', 'date'],
        ]);
        OrderService::addPayment($order, $data, $request->user());

        return $this->show($request, $id);
    }

    public function cancel(Request $request, int $id): JsonResponse
    {
        $this->authorize('orders.cancel');
        $order = Order::visibleTo($request->user())->findOrFail($id);
        $data = $request->validate(['reason' => ['required', 'string', 'max:255']]);
        OrderService::cancel($order, $data['reason'], $request->user());

        return $this->show($request, $id);
    }

    public function sendSms(Request $request, int $id): JsonResponse
    {
        $this->authorize('sms.send');
        $order = Order::visibleTo($request->user())->with('customer')->findOrFail($id);
        $data = $request->validate(['type' => ['required', Rule::in(['order_created', 'order_ready', 'delivered', 'payment_reminder', 'ebill'])]]);
        $log = Sms::forOrder($order, $data['type']);
        abort_unless($log, 422, 'Customer has no mobile number or has opted out of SMS.');

        return response()->json($log);
    }

    /** Look up an order by garment tag barcode. */
    public function byTag(Request $request, string $tag): JsonResponse
    {
        $this->authorize('orders.view');
        $tag = mb_substr($tag, 0, 40);
        $order = Order::visibleTo($request->user())
            ->where(fn ($q) => $q->where('order_no', $tag)->orWhere('receipt_no', $tag)->orWhereHas('items', fn ($i) => $i->where('tag_code', $tag)))
            ->firstOrFail();

        return $this->show($request, $order->id);
    }
}
