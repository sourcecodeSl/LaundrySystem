<?php

namespace App\Services;

use App\Models\Customer;
use App\Models\CustomerLedger;
use App\Models\Supplier;
use App\Models\SupplierLedger;
use Illuminate\Database\Eloquent\Model;

/**
 * Running-balance ledgers.
 * Customer: debit = customer owes more (invoice), credit = customer paid / returned.
 * Supplier: credit = we owe more (GRN), debit = we paid / returned goods.
 */
class Ledger
{
    public static function customer(Customer $customer, string $type, float $debit, float $credit, ?string $reference = null,
        ?Model $source = null, ?string $description = null, ?string $date = null): CustomerLedger
    {
        $customer = Customer::whereKey($customer->id)->lockForUpdate()->firstOrFail();
        $customer->balance = round($customer->balance + $debit - $credit, 2);
        $customer->saveQuietly();

        return CustomerLedger::create([
            'customer_id' => $customer->id,
            'branch_id' => ($source?->getAttributes()['branch_id'] ?? null) ?? auth()->user()?->branch_id,
            'date' => $date ?? now()->toDateString(),
            'type' => $type,
            'reference' => $reference,
            'source_type' => $source ? $source::class : null,
            'source_id' => $source?->getKey(),
            'debit' => round($debit, 2),
            'credit' => round($credit, 2),
            'balance' => $customer->balance,
            'description' => $description,
            'user_id' => auth()->id(),
        ]);
    }

    public static function supplier(Supplier $supplier, string $type, float $debit, float $credit, ?string $reference = null,
        ?Model $source = null, ?string $description = null, ?string $date = null): SupplierLedger
    {
        $supplier = Supplier::whereKey($supplier->id)->lockForUpdate()->firstOrFail();
        $supplier->balance = round($supplier->balance + $credit - $debit, 2);
        $supplier->saveQuietly();

        return SupplierLedger::create([
            'supplier_id' => $supplier->id,
            'date' => $date ?? now()->toDateString(),
            'type' => $type,
            'reference' => $reference,
            'source_type' => $source ? $source::class : null,
            'source_id' => $source?->getKey(),
            'debit' => round($debit, 2),
            'credit' => round($credit, 2),
            'balance' => $supplier->balance,
            'description' => $description,
            'user_id' => auth()->id(),
        ]);
    }
}
