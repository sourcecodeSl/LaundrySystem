<?php

namespace App\Http\Controllers\Finance;

use App\Http\Controllers\Controller;
use App\Models\CashBookEntry;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class CashBookController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $this->authorize('finance.cashbook');
        $from = $request->date('from') ?? today()->startOfMonth();
        $to = $request->date('to') ?? today();
        $method = $request->query('method');

        $base = fn () => CashBookEntry::visibleTo($request->user(), $request->integer('branch_id') ?: null)
            ->when(is_string($method) && $method !== '', fn ($q) => $q->where('method', $method));

        $opening = (clone $base())->whereDate('date', '<', $from)
            ->selectRaw("COALESCE(SUM(CASE WHEN direction = 'in' THEN amount ELSE -amount END), 0) as bal")->value('bal');

        $entries = $base()->with(['user:id,name', 'branch:id,name'])
            ->whereDate('date', '>=', $from)->whereDate('date', '<=', $to)
            ->when($request->query('source'), fn ($q, $s) => $q->where('source', (string) $s))
            ->orderBy('date')->orderBy('id')->limit(10000)->get();

        $running = (float) $opening;
        $entries->each(function ($e) use (&$running) {
            $running += $e->direction === 'in' ? $e->amount : -$e->amount;
            $e->running_balance = round($running, 2);
        });

        $in = $entries->where('direction', 'in')->sum('amount');
        $out = $entries->where('direction', 'out')->sum('amount');

        return response()->json([
            'from' => $from->toDateString(),
            'to' => $to->toDateString(),
            'opening_balance' => round((float) $opening, 2),
            'total_in' => round($in, 2),
            'total_out' => round($out, 2),
            'closing_balance' => round($opening + $in - $out, 2),
            'by_method' => $entries->groupBy('method')->map(fn ($g) => [
                'in' => round($g->where('direction', 'in')->sum('amount'), 2),
                'out' => round($g->where('direction', 'out')->sum('amount'), 2),
            ]),
            'entries' => $entries->values(),
        ]);
    }
}
