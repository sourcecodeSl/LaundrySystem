<?php

namespace App\Services;

use App\Models\Branch;
use App\Models\Cheque;
use App\Models\Grn;
use App\Models\Supplier;
use App\Models\SupplierPayment;

class SupplierPayments
{
    public static function post(Supplier $supplier, Branch $branch, float $amount, array $data, ?Grn $grn = null): SupplierPayment
    {
        $payment = SupplierPayment::create([
            'ref_no' => Numbering::next('SP', $branch->code, 4),
            'branch_id' => $branch->id,
            'supplier_id' => $supplier->id,
            'grn_id' => $grn?->id,
            'user_id' => auth()->id(),
            'date' => $data['date'] ?? now()->toDateString(),
            'amount' => round($amount, 2),
            'method' => $data['method'],
            'reference' => $data['reference'] ?? null,
            'bank' => $data['bank'] ?? null,
            'cheque_no' => $data['cheque_no'] ?? null,
            'cheque_date' => $data['cheque_date'] ?? null,
            'notes' => $data['notes'] ?? null,
        ]);

        Ledger::supplier($supplier, 'payment', $payment->amount, 0, $payment->ref_no, $payment, 'Payment ('.$payment->method.')', $payment->date->toDateString());
        CashBook::record('out', 'supplier_payment', $payment->method, $payment->amount, $branch->id, $payment, $payment->ref_no,
            'Supplier payment - '.$supplier->name, $payment->date->toDateString());

        if ($grn) {
            $grn->increment('paid', $payment->amount);
        }
        if ($payment->method === 'cheque') {
            Cheque::create([
                'branch_id' => $branch->id, 'user_id' => auth()->id(), 'payee' => $supplier->name, 'amount' => $payment->amount,
                'cheque_date' => $payment->cheque_date ?? $payment->date, 'cheque_no' => $payment->cheque_no, 'bank' => $payment->bank,
                'ac_payee' => true, 'supplier_payment_id' => $payment->id,
            ]);
        }

        return $payment;
    }
}
