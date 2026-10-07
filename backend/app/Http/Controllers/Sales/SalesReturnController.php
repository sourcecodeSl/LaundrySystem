<?php

namespace App\Http\Controllers\Sales;

use App\Http\Controllers\Controller;
use App\Models\Order;
use App\Models\SalesReturn;
use App\Services\OrderService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class SalesReturnController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $this->authorize('sales_returns.view');
        $q = SalesReturn::visibleTo($request->user(), $request->integer('branch_id') ?: null)
            ->with(['order:id,order_no', 'customer:id,name,mobile', 'user:id,name']);
        if ($s = mb_substr(trim((string) $request->query('q')), 0, 100)) {
            $q->where(fn ($w) => $w->where('ref_no', 'like', "%$s%")->orWhereHas('order', fn ($o) => $o->where('order_no', 'like', "%$s%")));
        }
        if ($from = $request->date('from')) {
            $q->whereDate('created_at', '>=', $from);
        }
        if ($to = $request->date('to')) {
            $q->whereDate('created_at', '<=', $to);
        }

        return response()->json($request->boolean('all') ? ['data' => $q->latest('id')->limit(10000)->get()]
            : $q->latest('id')->paginate(min(max($request->integer('per_page', 20), 1), 100)));
    }

    public function show(Request $request, int $id): JsonResponse
    {
        $this->authorize('sales_returns.view');

        return response()->json(SalesReturn::visibleTo($request->user())->with(['items.orderItem', 'order', 'customer', 'user:id,name'])->findOrFail($id));
    }

    public function store(Request $request): JsonResponse
    {
        $this->authorize('sales_returns.create');
        $data = $request->validate([
            'order_id' => ['required', 'integer'],
            'refund_method' => ['required', Rule::in(['cash', 'card', 'bank_transfer', 'credit_note'])],
            'reason' => ['nullable', 'string', 'max:255'],
            'items' => ['required', 'array', 'min:1'],
            'items.*.order_item_id' => ['required', 'integer'],
            'items.*.quantity' => ['required', 'numeric', 'min:0.01'],
        ]);
        $order = Order::visibleTo($request->user())->findOrFail($data['order_id']);

        return response()->json(OrderService::salesReturn($order, $data, $request->user()), 201);
    }
}
