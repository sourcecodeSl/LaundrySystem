<?php

namespace App\Http\Controllers\System;

use App\Http\Controllers\Controller;
use App\Models\CashBookEntry;
use App\Models\Customer;
use App\Models\Grn;
use App\Models\Order;
use App\Models\Transaction;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ReportController extends Controller
{
    public function __invoke(Request $request, string $type): JsonResponse
    {
        $this->authorize('reports.view');
        $user = $request->user();
        $from = ($request->date('from') ?? today()->startOfMonth())->toDateString();
        $to = ($request->date('to') ?? today())->toDateString();
        $branchId = $request->integer('branch_id') ?: null;

        $orders = fn () => Order::visibleTo($user, $branchId)->where('orders.status', '!=', 'cancelled')
            ->whereDate('orders.created_at', '>=', $from)->whereDate('orders.created_at', '<=', $to);

        $rows = match ($type) {
            'sales-by-service' => $orders()->join('order_items', 'order_items.order_id', '=', 'orders.id')
                ->leftJoin('services', 'services.id', '=', 'order_items.service_id')
                ->selectRaw("COALESCE(services.name, 'Quick sale') as service, COUNT(DISTINCT orders.id) as orders, SUM(order_items.quantity) as pieces,
                    SUM(COALESCE(order_items.weight, 0)) as weight, SUM(order_items.total) as amount")
                ->groupBy('service')->orderByDesc('amount')->get(),

            'sales-by-branch' => $orders()->join('branches', 'branches.id', '=', 'orders.branch_id')
                ->selectRaw('branches.name as branch, COUNT(*) as orders, SUM(orders.subtotal) as gross, SUM(orders.discount) as discount,
                    SUM(orders.tax) as tax, SUM(orders.service_charge) as service_charge, SUM(orders.total) as total, SUM(orders.returned) as returned,
                    SUM(orders.paid) as collected, SUM(orders.balance) as outstanding')
                ->groupBy('branches.name')->orderByDesc('total')->get(),

            'sales-by-cashier' => $orders()->join('users', 'users.id', '=', 'orders.user_id')
                ->selectRaw('users.name as cashier, COUNT(*) as orders, SUM(orders.total) as total, SUM(orders.paid) as collected,
                    SUM(orders.discount) as discount, AVG(orders.total) as avg_order')
                ->groupBy('users.name')->orderByDesc('total')->get(),

            'daily-sales' => $orders()->selectRaw('DATE(orders.created_at) as date, COUNT(*) as orders, SUM(total_weight) as weight,
                    SUM(total_pieces) as pieces, SUM(total) as total, SUM(paid) as collected, SUM(balance) as outstanding')
                ->groupBy('date')->orderBy('date')->get(),

            'outstanding' => Order::visibleTo($user, $branchId)->where('balance', '>', 0)->whereNot('status', 'cancelled')
                ->with(['customer:id,name,mobile', 'branch:id,name'])->orderBy('created_at')
                ->get(['id', 'order_no', 'customer_id', 'branch_id', 'created_at', 'status', 'total', 'paid', 'balance'])
                ->map(fn ($o) => [
                    'order_no' => $o->order_no, 'date' => $o->created_at->toDateString(), 'customer' => $o->customer?->name,
                    'mobile' => $o->customer?->mobile, 'branch' => $o->branch?->name, 'status' => $o->status,
                    'total' => $o->total, 'paid' => $o->paid, 'balance' => $o->balance, 'age_days' => (int) $o->created_at->diffInDays(now()),
                ]),

            'customer-balances' => Customer::where('balance', '!=', 0)
                ->when(! $user->canAccessAllBranches(), fn ($q) => $q->where('branch_id', $user->branch_id))
                ->orderByDesc('balance')->get(['code', 'name', 'mobile', 'credit_limit', 'balance']),

            'payments' => CashBookEntry::visibleTo($user, $branchId)->whereBetween('date', [$from, $to])
                ->selectRaw('source, method, direction, COUNT(*) as entries, SUM(amount) as amount')
                ->groupBy('source', 'method', 'direction')->orderBy('source')->get(),

            'profit' => $this->profit($request, $user, $branchId, $from, $to, $orders),

            default => abort(404),
        };

        return response()->json(['type' => $type, 'from' => $from, 'to' => $to, 'rows' => $rows]);
    }

    private function profit(Request $request, $user, $branchId, string $from, string $to, callable $orders): array
    {
        $this->authorize('reports.profit');
        $sales = (float) $orders()->sum('total');
        $tax = (float) $orders()->sum('tax');
        $returns = (float) $orders()->sum('returned');
        $tx = Transaction::visibleTo($user, $branchId)->whereBetween('date', [$from, $to])
            ->join('transaction_categories as c', 'c.id', '=', 'transactions.category_id')
            ->selectRaw('transactions.type, c.name as category, SUM(transactions.amount) as amount')
            ->groupBy('transactions.type', 'c.name')->get();
        $consumables = (float) Grn::visibleTo($user, $branchId)->whereBetween('date', [$from, $to])->sum('total');
        $otherIncome = (float) $tx->where('type', 'income')->sum('amount');
        $expenses = (float) $tx->where('type', 'expense')->sum('amount');
        $netSales = $sales - $tax - $returns;
        $net = $netSales + $otherIncome - $expenses - $consumables;

        $line = fn ($label, $amount, $kind = 'item') => ['label' => $label, 'amount' => round($amount, 2), 'kind' => $kind];

        return array_merge(
            [$line('Gross sales (incl. tax)', $sales), $line('Less: tax collected', -$tax), $line('Less: sales returns', -$returns),
                $line('Net sales', $netSales, 'subtotal')],
            $tx->where('type', 'income')->map(fn ($r) => $line('Other income - '.$r->category, $r->amount))->values()->all(),
            [$line('Consumables purchased (GRN)', -$consumables)],
            $tx->where('type', 'expense')->map(fn ($r) => $line('Expense - '.$r->category, -$r->amount))->values()->all(),
            [$line('Net profit', $net, 'total')],
        );
    }
}
