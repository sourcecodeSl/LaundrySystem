<?php

namespace App\Http\Controllers\Finance;

use App\Http\Controllers\Controller;
use App\Models\Customer;
use App\Models\CustomerLedger;
use App\Models\Order;
use App\Models\Supplier;
use App\Models\SupplierLedger;
use App\Services\Ledger;
use App\Services\OrderService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class LedgerController extends Controller
{
    public function customer(Request $request, int $id): JsonResponse
    {
        $this->authorize('customers.ledger');
        $customer = Customer::findOrFail($id);
        $q = CustomerLedger::where('customer_id', $id)->with('user:id,name');
        if ($from = $request->date('from')) {
            $q->whereDate('date', '>=', $from);
        }
        if ($to = $request->date('to')) {
            $q->whereDate('date', '<=', $to);
        }

        return response()->json([
            'customer' => $customer,
            'entries' => $q->orderBy('id')->limit(5000)->get(),
            'open_orders' => Order::where('customer_id', $id)->where('balance', '>', 0)->whereNot('status', 'cancelled')
                ->orderBy('id')->get(['id', 'order_no', 'created_at', 'total', 'paid', 'balance', 'status']),
            'credit_available' => round(max(0, $customer->credit_limit - $customer->balance), 2),
        ]);
    }

    /** Receive a payment on account and allocate it to the oldest unpaid orders (FIFO). */
    public function settle(Request $request, int $id): JsonResponse
    {
        $this->authorize('orders.payment');
        $customer = Customer::findOrFail($id);
        $data = $request->validate([
            'amount' => ['required', 'numeric', 'min:0.01', 'max:99999999'],
            'method' => ['required', Rule::in(Order::PAYMENT_METHODS)],
            'reference' => ['nullable', 'string', 'max:100'],
            'cheque_no' => ['nullable', 'required_if:method,cheque', 'string', 'max:50'],
            'bank' => ['nullable', 'string', 'max:100'],
        ]);

        $orders = Order::visibleTo($request->user())->where('customer_id', $customer->id)->where('balance', '>', 0)
            ->whereNot('status', 'cancelled')->orderBy('id')->get();
        if ($data['amount'] > $orders->sum('balance') + 0.001) {
            throw ValidationException::withMessages(['amount' => 'Amount exceeds total outstanding on visible orders ('.number_format($orders->sum('balance'), 2).').']);
        }

        DB::transaction(function () use ($orders, $data, $request) {
            $left = (float) $data['amount'];
            foreach ($orders as $order) {
                if ($left <= 0) {
                    break;
                }
                $pay = min($left, $order->balance);
                OrderService::addPayment($order, ['amount' => $pay] + $data, $request->user());
                $left = round($left - $pay, 2);
            }
        });

        return $this->customer($request, $id);
    }

    /** Manual ledger adjustment (e.g. write-off or correction). */
    public function adjustCustomer(Request $request, int $id): JsonResponse
    {
        $this->authorize('customers.ledger');
        $abort = ! $request->user()->hasPermission('customers.update');
        abort_if($abort, 403);
        $customer = Customer::findOrFail($id);
        $data = $request->validate([
            'direction' => ['required', Rule::in(['debit', 'credit'])],
            'amount' => ['required', 'numeric', 'min:0.01', 'max:99999999'],
            'description' => ['required', 'string', 'max:255'],
        ]);
        DB::transaction(fn () => Ledger::customer($customer, 'adjustment', $data['direction'] === 'debit' ? $data['amount'] : 0,
            $data['direction'] === 'credit' ? $data['amount'] : 0, 'ADJ', null, $data['description']));

        return $this->customer($request, $id);
    }

    public function supplier(Request $request, int $id): JsonResponse
    {
        $this->authorize('suppliers.ledger');
        $supplier = Supplier::findOrFail($id);
        $q = SupplierLedger::where('supplier_id', $id)->with('user:id,name');
        if ($from = $request->date('from')) {
            $q->whereDate('date', '>=', $from);
        }
        if ($to = $request->date('to')) {
            $q->whereDate('date', '<=', $to);
        }

        return response()->json([
            'supplier' => $supplier,
            'entries' => $q->orderBy('id')->limit(5000)->get(),
            'open_grns' => $supplier->grns()->whereColumn('paid', '<', 'total')->orderBy('id')->get(['id', 'ref_no', 'invoice_no', 'date', 'total', 'paid']),
        ]);
    }
}
