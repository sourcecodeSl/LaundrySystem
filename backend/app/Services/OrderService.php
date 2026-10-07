<?php

namespace App\Services;

use App\Models\Branch;
use App\Models\Customer;
use App\Models\HeldBill;
use App\Models\Order;
use App\Models\OrderStatusHistory;
use App\Models\Payment;
use App\Models\Quotation;
use App\Models\SalesReturn;
use App\Models\Shift;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class OrderService
{
    /** Allowed forward flow; any active status may also jump to "ready" or be cancelled. */
    public const FLOW = ['received', 'washing', 'drying', 'ironing', 'ready', 'delivered'];

    public static function resolveBranch(User $user, mixed $branchId): Branch
    {
        $id = $user->canAccessAllBranches() ? ($branchId ?: $user->branch_id) : $user->branch_id;
        $branch = $id ? Branch::where('is_active', true)->find($id) : null;
        if (! $branch) {
            throw ValidationException::withMessages(['branch_id' => 'Please select a valid active branch.']);
        }

        return $branch;
    }

    public static function requireShift(User $user, Branch $branch): ?Shift
    {
        $shift = Shift::where(['user_id' => $user->id, 'branch_id' => $branch->id, 'status' => 'open'])->latest('id')->first();
        if (! $shift && Settings::get('general', 'require_shift') === '1') {
            throw ValidationException::withMessages(['shift' => 'Open a cashier shift before taking orders or payments.']);
        }

        return $shift;
    }

    public static function create(array $data, User $user): Order
    {
        return DB::transaction(function () use ($data, $user) {
            $branch = static::resolveBranch($user, $data['branch_id'] ?? null);
            $shift = static::requireShift($user, $branch);
            $customer = ! empty($data['customer_id']) ? Customer::where('is_active', true)->find($data['customer_id']) : null;
            if (! empty($data['customer_id']) && ! $customer) {
                throw ValidationException::withMessages(['customer_id' => 'Customer not found or inactive.']);
            }

            $calc = Pricing::calculate($data['items'], $user, $data['promotion_id'] ?? null, (float) ($data['discount'] ?? 0), $customer?->id);
            $payments = static::normalisePayments($data['payments'] ?? []);
            $paid = round(array_sum(array_column($payments, 'amount')), 2);

            if ($paid > $calc['total']) {
                throw ValidationException::withMessages(['payments' => 'Payment exceeds the bill total.']);
            }
            if ($paid < $calc['total'] && ! $customer) {
                throw ValidationException::withMessages(['customer_id' => 'Select a customer for orders with a pending balance.']);
            }

            $orderNo = Numbering::next('ORD', $branch->code);
            $order = Order::create([
                'order_no' => $orderNo,
                'receipt_no' => Numbering::next('RCP', $branch->code, 6),
                'queue_no' => Numbering::queue($branch->id),
                'branch_id' => $branch->id,
                'customer_id' => $customer?->id,
                'user_id' => $user->id,
                'shift_id' => $shift?->id,
                'promotion_id' => $calc['promotion_id'],
                'quotation_id' => $data['quotation_id'] ?? null,
                'status' => 'received',
                'subtotal' => $calc['subtotal'],
                'discount' => $calc['discount'],
                'tax' => $calc['tax'],
                'service_charge' => $calc['service_charge'],
                'total' => $calc['total'],
                'total_weight' => $calc['total_weight'],
                'total_pieces' => $calc['total_pieces'],
                'delivery_type' => $data['delivery_type'] ?? 'pickup',
                'delivery_address' => $data['delivery_address'] ?? null,
                'delivery_at' => $data['delivery_at'] ?? now()->addHours((int) Settings::get('general', 'default_delivery_hours', '48')),
                'notes' => $data['notes'] ?? null,
                'ebill_token' => Str::random(48),
            ]);

            foreach ($calc['items'] as $i => $item) {
                unset($item['gross']);
                $order->items()->create($item + ['tag_code' => $orderNo.'-'.str_pad((string) ($i + 1), 2, '0', STR_PAD_LEFT)]);
            }

            static::history($order, 'received', 'Order created');

            if ($customer) {
                Ledger::customer($customer, 'invoice', $order->total, 0, $order->order_no, $order, 'Laundry order');
            }

            foreach ($payments as $p) {
                static::recordPayment($order, $p, $user, true);
            }
            $order->paid = $paid;
            $order->refreshPaymentStatus();
            $order->save();

            if ($calc['billing_transaction_id']) {
                DB::table('billing_transactions')->where('id', $calc['billing_transaction_id'])->update([
                    'weight_used' => DB::raw('weight_used + '.(float) $calc['total_weight']),
                    'pieces_used' => DB::raw('pieces_used + '.(int) $calc['total_pieces']),
                ]);
            }
            if (! empty($data['held_bill_id'])) {
                HeldBill::visibleTo($user)->whereKey($data['held_bill_id'])->delete();
            }
            if (! empty($data['quotation_id'])) {
                Quotation::whereKey($data['quotation_id'])->update(['status' => 'converted', 'order_id' => $order->id]);
            }

            DB::afterCommit(function () use ($order) {
                if (Settings::get('sms', 'auto_on_order') === '1') {
                    Sms::forOrder($order->fresh('customer'), 'order_created');
                }
            });

            return $order->load(['items', 'payments', 'customer', 'branch', 'user']);
        });
    }

    public static function addPayment(Order $order, array $data, User $user): Order
    {
        return DB::transaction(function () use ($order, $data, $user) {
            $order = Order::whereKey($order->id)->lockForUpdate()->firstOrFail();
            if ($order->status === 'cancelled') {
                throw ValidationException::withMessages(['amount' => 'Cannot take payments on a cancelled order.']);
            }
            static::requireShift($user, $order->branch);
            [$p] = static::normalisePayments([$data]);
            if ($p['amount'] > $order->balance + 0.001) {
                throw ValidationException::withMessages(['amount' => 'Amount exceeds the pending balance ('.number_format($order->balance, 2).').']);
            }
            static::recordPayment($order, $p, $user, false);
            $order->paid = round($order->paid + $p['amount'], 2);
            $order->refreshPaymentStatus();
            $order->save();

            return $order;
        });
    }

    public static function updateStatus(Order $order, string $status, ?string $note, User $user): Order
    {
        return DB::transaction(function () use ($order, $status, $note) {
            $order = Order::with('customer')->whereKey($order->id)->lockForUpdate()->firstOrFail();
            if (in_array($order->status, ['delivered', 'cancelled'], true)) {
                throw ValidationException::withMessages(['status' => "Order is already {$order->status}."]);
            }
            if (! in_array($status, self::FLOW, true) || $status === $order->status) {
                throw ValidationException::withMessages(['status' => 'Invalid status change.']);
            }
            if ($status === 'delivered' && $order->balance > 0) {
                $c = $order->customer;
                if (! $c || $c->credit_limit <= 0 || $c->balance > $c->credit_limit) {
                    throw ValidationException::withMessages(['status' => 'Collect the pending balance first (customer credit limit not available).']);
                }
            }

            $order->status = $status;
            if ($status === 'delivered') {
                $order->delivered_at = now();
            }
            $order->save();
            static::history($order, $status, $note);

            DB::afterCommit(function () use ($order, $status) {
                if ($status === 'ready' && Settings::get('sms', 'auto_on_ready') === '1') {
                    Sms::forOrder($order, 'order_ready');
                }
                if ($status === 'delivered' && Settings::get('sms', 'auto_on_delivered') === '1') {
                    Sms::forOrder($order, 'delivered');
                }
            });

            return $order;
        });
    }

    public static function cancel(Order $order, string $reason, User $user): Order
    {
        return DB::transaction(function () use ($order, $reason, $user) {
            $order = Order::with('customer')->whereKey($order->id)->lockForUpdate()->firstOrFail();
            if (in_array($order->status, ['delivered', 'cancelled'], true)) {
                throw ValidationException::withMessages(['status' => "A {$order->status} order cannot be cancelled."]);
            }
            $refund = round($order->paid, 2);
            if ($refund > 0) {
                static::requireShift($user, $order->branch);
                CashBook::record('out', 'refund', 'cash', $refund, $order->branch_id, $order, $order->order_no, 'Order cancelled - refund');
            }
            if ($order->customer) {
                Ledger::customer($order->customer, 'cancel', 0, $order->total, $order->order_no, $order, 'Order cancelled');
                if ($refund > 0) {
                    Ledger::customer($order->customer, 'refund', $refund, 0, $order->order_no, $order, 'Refund on cancellation');
                }
            }
            $order->update(['status' => 'cancelled', 'paid' => 0, 'balance' => 0, 'payment_status' => $refund > 0 ? 'refunded' : 'unpaid']);
            static::history($order, 'cancelled', $reason);

            return $order;
        });
    }

    public static function salesReturn(Order $order, array $data, User $user): SalesReturn
    {
        return DB::transaction(function () use ($order, $data, $user) {
            $order = Order::with(['items', 'customer'])->whereKey($order->id)->lockForUpdate()->firstOrFail();
            if ($order->status === 'cancelled') {
                throw ValidationException::withMessages(['order_id' => 'Order is cancelled.']);
            }
            $shift = static::requireShift($user, $order->branch);

            $lines = [];
            $amount = 0;
            foreach ($data['items'] as $i => $row) {
                $item = $order->items->firstWhere('id', $row['order_item_id']);
                $qty = round((float) $row['quantity'], 2);
                if (! $item || $qty <= 0 || $qty > $item->quantity - $item->returned_qty + 0.001) {
                    throw ValidationException::withMessages(["items.$i.quantity" => 'Invalid return quantity.']);
                }
                $lineAmount = round($item->total * $qty / $item->quantity, 2);
                $lines[] = [$item, $qty, $lineAmount];
                $amount += $lineAmount;
            }
            // Pro-rate the bill-level discount, tax and service charge onto the returned value.
            $ratio = $order->subtotal > 0 ? ($order->total / $order->subtotal) : 1;
            $amount = round(min($amount * $ratio, $order->total - $order->returned), 2);

            $return = SalesReturn::create([
                'ref_no' => Numbering::next('SR', $order->branch->code),
                'branch_id' => $order->branch_id,
                'order_id' => $order->id,
                'customer_id' => $order->customer_id,
                'user_id' => $user->id,
                'shift_id' => $shift?->id,
                'amount' => $amount,
                'refund_method' => $data['refund_method'],
                'reason' => $data['reason'] ?? null,
            ]);
            foreach ($lines as [$item, $qty, $lineAmount]) {
                $return->items()->create(['order_item_id' => $item->id, 'quantity' => $qty, 'amount' => $lineAmount]);
                $item->increment('returned_qty', $qty);
            }

            $order->returned = round($order->returned + $amount, 2);
            // Money already collected above the new net total is refunded.
            $refund = round(max(0, $order->paid - ($order->total - $order->returned)), 2);
            if ($order->customer) {
                Ledger::customer($order->customer, 'return', 0, $amount, $return->ref_no, $return, 'Sales return');
            }
            if ($refund > 0 && $data['refund_method'] !== 'credit_note') {
                CashBook::record('out', 'refund', $data['refund_method'], $refund, $order->branch_id, $return, $return->ref_no, 'Sales return refund');
                $order->paid = round($order->paid - $refund, 2);
                if ($order->customer) {
                    Ledger::customer($order->customer, 'refund', $refund, 0, $return->ref_no, $return, 'Refund paid');
                }
            }
            $order->refreshPaymentStatus();
            $order->save();

            return $return->load('items');
        });
    }

    public static function history(Order $order, string $status, ?string $note = null): void
    {
        OrderStatusHistory::create(['order_id' => $order->id, 'status' => $status, 'note' => $note, 'user_id' => auth()->id()]);
    }

    protected static function recordPayment(Order $order, array $p, User $user, bool $isAdvance): Payment
    {
        $payment = Payment::create($p + [
            'payment_no' => Numbering::next('PAY', $order->branch?->code ?? (string) $order->branch_id, 6),
            'branch_id' => $order->branch_id,
            'order_id' => $order->id,
            'customer_id' => $order->customer_id,
            'shift_id' => CashBook::currentShiftId($order->branch_id),
            'user_id' => $user->id,
            'is_advance' => $isAdvance && $order->status !== 'delivered',
        ]);
        CashBook::record('in', 'sale', $p['method'], $p['amount'], $order->branch_id, $payment, $order->order_no, 'Payment for '.$order->order_no);
        if ($order->customer_id) {
            Ledger::customer($order->customer ?? Customer::find($order->customer_id), 'payment', 0, $p['amount'], $payment->payment_no, $payment, 'Payment ('.$p['method'].')');
        }

        return $payment;
    }

    protected static function normalisePayments(array $payments): array
    {
        $out = [];
        foreach ($payments as $i => $p) {
            $amount = round((float) ($p['amount'] ?? 0), 2);
            if ($amount <= 0) {
                continue;
            }
            if (! in_array($p['method'] ?? '', Order::PAYMENT_METHODS, true)) {
                throw ValidationException::withMessages(["payments.$i.method" => 'Invalid payment method.']);
            }
            if ($p['method'] === 'cheque' && empty($p['cheque_no'])) {
                throw ValidationException::withMessages(["payments.$i.cheque_no" => 'Cheque number is required.']);
            }
            $out[] = [
                'method' => $p['method'],
                'amount' => $amount,
                'reference' => $p['reference'] ?? null,
                'bank' => $p['bank'] ?? null,
                'cheque_no' => $p['cheque_no'] ?? null,
                'cheque_date' => $p['cheque_date'] ?? null,
            ];
        }

        return $out;
    }
}
