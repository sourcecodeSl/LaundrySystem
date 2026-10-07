<?php

namespace App\Http\Controllers\Finance;

use App\Http\Controllers\Controller;
use App\Models\CashBookEntry;
use App\Models\Shift;
use App\Services\OrderService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/** Cashier shift open / close with cash reconciliation. */
class ShiftController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $this->authorize('shifts.manage');
        $user = $request->user();
        $q = Shift::visibleTo($user, $request->integer('branch_id') ?: null)->with(['user:id,name', 'branch:id,name']);
        if (! $user->hasPermission('shifts.view_all')) {
            $q->where('user_id', $user->id);
        }
        if ($from = $request->date('from')) {
            $q->whereDate('opened_at', '>=', $from);
        }
        if ($to = $request->date('to')) {
            $q->whereDate('opened_at', '<=', $to);
        }

        return response()->json($q->latest('id')->paginate(min(max($request->integer('per_page', 20), 1), 100)));
    }

    public function current(Request $request): JsonResponse
    {
        $shift = Shift::with('branch:id,name')->where(['user_id' => $request->user()->id, 'status' => 'open'])->latest('id')->first();

        return response()->json(['shift' => $shift ? $shift->toArray() + ['summary' => $this->summary($shift)] : null]);
    }

    public function open(Request $request): JsonResponse
    {
        $this->authorize('shifts.manage');
        $data = $request->validate([
            'branch_id' => ['nullable', 'integer'],
            'opening_cash' => ['required', 'numeric', 'min:0', 'max:99999999'],
            'notes' => ['nullable', 'string', 'max:500'],
        ]);
        $user = $request->user();
        $branch = OrderService::resolveBranch($user, $data['branch_id'] ?? null);

        $shift = DB::transaction(function () use ($user, $branch, $data) {
            if (Shift::where(['user_id' => $user->id, 'status' => 'open'])->lockForUpdate()->exists()) {
                throw ValidationException::withMessages(['shift' => 'You already have an open shift.']);
            }

            return Shift::create([
                'user_id' => $user->id, 'branch_id' => $branch->id, 'opened_at' => now(),
                'opening_cash' => $data['opening_cash'], 'status' => 'open', 'notes' => $data['notes'] ?? null,
            ]);
        });

        return response()->json($shift, 201);
    }

    public function close(Request $request): JsonResponse
    {
        $this->authorize('shifts.manage');
        $data = $request->validate([
            'closing_cash' => ['required', 'numeric', 'min:0', 'max:99999999'],
            'notes' => ['nullable', 'string', 'max:500'],
        ]);
        $shift = Shift::where(['user_id' => $request->user()->id, 'status' => 'open'])->latest('id')->firstOrFail();
        $summary = $this->summary($shift);

        $shift->update([
            'closed_at' => now(),
            'closing_cash' => $data['closing_cash'],
            'expected_cash' => $summary['expected_cash'],
            'difference' => round($data['closing_cash'] - $summary['expected_cash'], 2),
            'status' => 'closed',
            'notes' => trim(($shift->notes ? $shift->notes."\n" : '').($data['notes'] ?? '')) ?: null,
        ]);

        return response()->json($shift->fresh(['user:id,name', 'branch:id,name'])->toArray() + ['summary' => $summary]);
    }

    public function show(Request $request, int $id): JsonResponse
    {
        $this->authorize('shifts.manage');
        $user = $request->user();
        $shift = Shift::visibleTo($user)->with(['user:id,name', 'branch:id,name'])
            ->when(! $user->hasPermission('shifts.view_all'), fn ($q) => $q->where('user_id', $user->id))->findOrFail($id);

        return response()->json($shift->toArray() + ['summary' => $this->summary($shift)]);
    }

    private function summary(Shift $shift): array
    {
        $entries = CashBookEntry::where('shift_id', $shift->id)->get();
        $byMethod = $entries->groupBy('method')->map(fn ($g) => [
            'in' => round($g->where('direction', 'in')->sum('amount'), 2),
            'out' => round($g->where('direction', 'out')->sum('amount'), 2),
        ]);
        $cashIn = $byMethod['cash']['in'] ?? 0;
        $cashOut = $byMethod['cash']['out'] ?? 0;

        return [
            'by_method' => $byMethod,
            'orders' => DB::table('orders')->where('shift_id', $shift->id)->count(),
            'sales_total' => round((float) DB::table('orders')->where('shift_id', $shift->id)->whereNot('status', 'cancelled')->sum('total'), 2),
            'cash_in' => $cashIn,
            'cash_out' => $cashOut,
            'expected_cash' => round($shift->opening_cash + $cashIn - $cashOut, 2),
        ];
    }
}
