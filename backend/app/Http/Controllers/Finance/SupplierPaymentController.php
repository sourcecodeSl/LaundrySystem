<?php

namespace App\Http\Controllers\Finance;

use App\Http\Controllers\Controller;
use App\Models\Grn;
use App\Models\Supplier;
use App\Models\SupplierPayment;
use App\Services\OrderService;
use App\Services\SupplierPayments;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class SupplierPaymentController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $this->authorize('suppliers.payments');
        $q = SupplierPayment::visibleTo($request->user(), $request->integer('branch_id') ?: null)
            ->with(['supplier:id,name', 'grn:id,ref_no,invoice_no', 'user:id,name']);
        if ($request->filled('supplier_id')) {
            $q->where('supplier_id', $request->integer('supplier_id'));
        }
        if ($s = mb_substr(trim((string) $request->query('q')), 0, 100)) {
            $q->where(fn ($w) => $w->where('ref_no', 'like', "%$s%")->orWhere('reference', 'like', "%$s%")->orWhereHas('supplier', fn ($x) => $x->where('name', 'like', "%$s%")));
        }
        if ($from = $request->date('from')) {
            $q->whereDate('date', '>=', $from);
        }
        if ($to = $request->date('to')) {
            $q->whereDate('date', '<=', $to);
        }

        return response()->json($request->boolean('all') ? ['data' => $q->latest('id')->limit(10000)->get()]
            : $q->latest('id')->paginate(min(max($request->integer('per_page', 20), 1), 100)));
    }

    public function store(Request $request): JsonResponse
    {
        $this->authorize('suppliers.payments');
        $data = $request->validate([
            'branch_id' => ['nullable', 'integer'],
            'supplier_id' => ['required', 'integer', 'exists:suppliers,id'],
            'grn_id' => ['nullable', 'integer'],
            'date' => ['required', 'date', 'before_or_equal:today'],
            'amount' => ['required', 'numeric', 'min:0.01', 'max:99999999'],
            'method' => ['required', Rule::in(['cash', 'card', 'bank_transfer', 'cheque'])],
            'reference' => ['nullable', 'string', 'max:100'],
            'bank' => ['nullable', 'string', 'max:100'],
            'cheque_no' => ['nullable', 'required_if:method,cheque', 'string', 'max:50'],
            'cheque_date' => ['nullable', 'date'],
            'notes' => ['nullable', 'string', 'max:500'],
        ]);
        $branch = OrderService::resolveBranch($request->user(), $data['branch_id'] ?? null);
        $supplier = Supplier::findOrFail($data['supplier_id']);
        $grn = null;
        if (! empty($data['grn_id'])) {
            $grn = Grn::visibleTo($request->user())->where('supplier_id', $supplier->id)->findOrFail($data['grn_id']);
            if ($data['amount'] > $grn->total - $grn->paid + 0.001) {
                throw ValidationException::withMessages(['amount' => 'Amount exceeds the GRN outstanding ('.number_format($grn->total - $grn->paid, 2).').']);
            }
        }

        $payment = DB::transaction(fn () => SupplierPayments::post($supplier, $branch, (float) $data['amount'], $data, $grn));

        return response()->json($payment->load('supplier:id,name'), 201);
    }
}
