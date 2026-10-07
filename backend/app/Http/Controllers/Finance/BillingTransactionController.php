<?php

namespace App\Http\Controllers\Finance;

use App\Http\Controllers\Controller;
use App\Models\BillingPlan;
use App\Models\BillingTransaction;
use App\Models\Customer;
use App\Services\CashBook;
use App\Services\Ledger;
use App\Services\Numbering;
use App\Services\OrderService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

/** Customer subscriptions to billing plans (memberships / monthly packages). */
class BillingTransactionController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $this->authorize('billing.transactions');
        BillingTransaction::where('status', 'active')->where('ends_on', '<', today()->toDateString())->update(['status' => 'expired']);

        $q = BillingTransaction::visibleTo($request->user(), $request->integer('branch_id') ?: null)
            ->with(['customer:id,name,mobile', 'plan:id,name,weight_limit,piece_limit', 'user:id,name']);
        foreach (['status', 'customer_id', 'billing_plan_id'] as $f) {
            if ($request->filled($f)) {
                $q->where($f, $request->query($f));
            }
        }
        if ($s = mb_substr(trim((string) $request->query('q')), 0, 100)) {
            $q->where(fn ($w) => $w->where('ref_no', 'like', "%$s%")->orWhereHas('customer', fn ($c) => $c->where('name', 'like', "%$s%")->orWhere('mobile', 'like', "%$s%")));
        }

        return response()->json($request->boolean('all') ? ['data' => $q->latest('id')->limit(10000)->get()]
            : $q->latest('id')->paginate(min(max($request->integer('per_page', 20), 1), 100)));
    }

    public function store(Request $request): JsonResponse
    {
        $this->authorize('billing.transactions');
        $data = $request->validate([
            'branch_id' => ['nullable', 'integer'],
            'customer_id' => ['required', 'integer', 'exists:customers,id'],
            'billing_plan_id' => ['required', 'integer', Rule::exists('billing_plans', 'id')->where('is_active', true)],
            'starts_on' => ['required', 'date'],
            'paid' => ['required', 'numeric', 'min:0'],
            'method' => ['required', Rule::in(['cash', 'card', 'bank_transfer', 'cheque'])],
            'notes' => ['nullable', 'string', 'max:255'],
        ]);
        $user = $request->user();
        $branch = OrderService::resolveBranch($user, $data['branch_id'] ?? null);
        $plan = BillingPlan::findOrFail($data['billing_plan_id']);
        $customer = Customer::findOrFail($data['customer_id']);
        if ($data['paid'] > $plan->price) {
            throw ValidationException::withMessages(['paid' => 'Paid amount exceeds plan price.']);
        }
        if ($data['paid'] > 0) {
            OrderService::requireShift($user, $branch);
        }

        $tx = DB::transaction(function () use ($data, $plan, $customer, $branch, $user) {
            $start = \Illuminate\Support\Carbon::parse($data['starts_on']);
            $tx = BillingTransaction::create([
                'ref_no' => Numbering::next('BP', $branch->code, 4),
                'branch_id' => $branch->id, 'customer_id' => $customer->id, 'billing_plan_id' => $plan->id, 'user_id' => $user->id,
                'starts_on' => $start->toDateString(), 'ends_on' => $start->copy()->addDays($plan->duration_days - 1)->toDateString(),
                'amount' => $plan->price, 'paid' => $data['paid'], 'method' => $data['method'], 'status' => 'active',
                'notes' => $data['notes'] ?? null,
            ]);
            Ledger::customer($customer, 'plan', $plan->price, 0, $tx->ref_no, $tx, 'Billing plan: '.$plan->name);
            if ($data['paid'] > 0) {
                Ledger::customer($customer, 'payment', 0, $data['paid'], $tx->ref_no, $tx, 'Plan payment ('.$data['method'].')');
                CashBook::record('in', 'plan', $data['method'], $data['paid'], $branch->id, $tx, $tx->ref_no, 'Plan - '.$plan->name);
            }

            return $tx;
        });

        return response()->json($tx->load(['customer:id,name', 'plan:id,name']), 201);
    }

    public function cancel(Request $request, int $id): JsonResponse
    {
        $this->authorize('billing.transactions');
        $tx = BillingTransaction::visibleTo($request->user())->findOrFail($id);
        if ($tx->status !== 'active') {
            throw ValidationException::withMessages(['status' => 'Only active plans can be cancelled.']);
        }
        $tx->update(['status' => 'cancelled']);

        return response()->json($tx);
    }
}
