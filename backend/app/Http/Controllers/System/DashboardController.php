<?php

namespace App\Http\Controllers\System;

use App\Http\Controllers\Controller;
use App\Models\CashBookEntry;
use App\Models\Item;
use App\Models\ItemStock;
use App\Models\Order;
use App\Models\Transaction;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class DashboardController extends Controller
{
    public function __invoke(Request $request): JsonResponse
    {
        $this->authorize('dashboard.view');
        $user = $request->user();
        $from = $request->date('from') ?? today()->startOfMonth();
        $to = $request->date('to') ?? today();
        $branchId = $request->integer('branch_id') ?: null;

        $orders = fn () => Order::visibleTo($user, $branchId)->whereDate('orders.created_at', '>=', $from)->whereDate('orders.created_at', '<=', $to)
            ->where('orders.status', '!=', 'cancelled');

        $cash = fn () => CashBookEntry::visibleTo($user, $branchId)->whereDate('date', '>=', $from)->whereDate('date', '<=', $to);

        $sales = (float) $orders()->sum('total');
        $returns = (float) $orders()->sum('returned');
        $expenses = (float) Transaction::visibleTo($user, $branchId)->where('type', 'expense')->whereBetween('date', [$from->toDateString(), $to->toDateString()])->sum('amount');

        $daily = $orders()->selectRaw('DATE(orders.created_at) as day, COUNT(*) as orders, SUM(total) as sales, SUM(paid) as collected')
            ->groupBy('day')->orderBy('day')->get();

        $byService = $orders()->join('order_items', 'order_items.order_id', '=', 'orders.id')
            ->leftJoin('services', 'services.id', '=', 'order_items.service_id')
            ->selectRaw("COALESCE(services.name, 'Quick sale') as name, SUM(order_items.total) as total, COUNT(order_items.id) as line_count")
            ->groupBy('name')->orderByDesc('total')->limit(8)->get();

        $statusCounts = Order::visibleTo($user, $branchId)->whereNotIn('status', ['delivered', 'cancelled'])
            ->selectRaw('status, COUNT(*) as count')->groupBy('status')->pluck('count', 'status');

        $lowStock = Item::where('is_active', true)->get()->map(function ($item) use ($user, $branchId) {
            $qty = ItemStock::where('item_id', $item->id)
                ->when(! $user->canAccessAllBranches(), fn ($q) => $q->where('branch_id', $user->branch_id))
                ->when($user->canAccessAllBranches() && $branchId, fn ($q) => $q->where('branch_id', $branchId))->sum('quantity');

            return ['id' => $item->id, 'name' => $item->name, 'unit' => $item->unit, 'quantity' => (float) $qty, 'reorder_level' => $item->reorder_level];
        })->filter(fn ($i) => $i['quantity'] <= $i['reorder_level'])->values()->take(8);

        return response()->json([
            'range' => ['from' => $from->toDateString(), 'to' => $to->toDateString()],
            'kpis' => [
                'sales' => round($sales, 2),
                'net_sales' => round($sales - $returns, 2),
                'orders' => $orders()->count(),
                'collected' => round((float) $cash()->where('direction', 'in')->sum('amount'), 2),
                'outstanding' => round((float) Order::visibleTo($user, $branchId)->whereNot('status', 'cancelled')->sum('balance'), 2),
                'expenses' => round($expenses, 2),
                'weight' => round((float) $orders()->sum('total_weight'), 2),
                'pieces' => (int) $orders()->sum('total_pieces'),
                'avg_order' => round($sales / max(1, $orders()->count()), 2),
                'due_today' => Order::visibleTo($user, $branchId)->whereDate('delivery_at', today())->whereNotIn('status', ['delivered', 'cancelled'])->count(),
                'overdue' => Order::visibleTo($user, $branchId)->where('delivery_at', '<', now())->whereNotIn('status', ['delivered', 'cancelled'])->count(),
            ],
            'daily' => $daily,
            'by_service' => $byService,
            'by_payment_method' => $cash()->where('direction', 'in')->selectRaw('method, SUM(amount) as total')->groupBy('method')->pluck('total', 'method'),
            'status_counts' => $statusCounts,
            'recent_orders' => Order::visibleTo($user, $branchId)->with('customer:id,name,mobile')->latest('id')->limit(8)
                ->get(['id', 'order_no', 'queue_no', 'customer_id', 'status', 'payment_status', 'total', 'balance', 'created_at']),
            'low_stock' => $lowStock,
        ]);
    }
}
