<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /** Stock documents => their line table foreign key. */
    private array $documents = [
        'grn' => 'grns',
        'supplier_return' => 'supplier_returns',
        'stock_adjustment' => 'stock_adjustments',
        'stock_transfer' => 'stock_transfers',
        'stock_count' => 'stock_counts',
        'opening_stock' => 'opening_stocks',
    ];

    public function up(): void
    {
        Schema::create('items', function (Blueprint $table) {
            $table->id();
            $table->string('code', 30)->unique();
            $table->string('name');
            $table->string('unit', 20)->default('pcs');
            $table->decimal('cost_price', 12, 2)->default(0);
            $table->decimal('reorder_level', 12, 2)->default(0);
            $table->boolean('is_active')->default(true);
            $table->timestamps();
            $table->softDeletes();
        });

        Schema::create('item_stocks', function (Blueprint $table) {
            $table->id();
            $table->foreignId('item_id')->constrained('items')->cascadeOnDelete();
            $table->foreignId('branch_id')->constrained('branches')->cascadeOnDelete();
            $table->decimal('quantity', 14, 3)->default(0);
            $table->timestamps();
            $table->unique(['item_id', 'branch_id']);
        });

        Schema::create('stock_movements', function (Blueprint $table) {
            $table->id();
            $table->foreignId('item_id')->constrained('items');
            $table->foreignId('branch_id')->constrained('branches');
            $table->string('type', 30); // opening | grn | supplier_return | adjustment | transfer_in | transfer_out | count
            $table->nullableMorphs('source');
            $table->string('reference')->nullable();
            $table->decimal('quantity', 14, 3); // signed
            $table->decimal('unit_cost', 12, 2)->default(0);
            $table->decimal('balance', 14, 3)->default(0);
            $table->foreignId('user_id')->nullable()->constrained('users');
            $table->string('notes')->nullable();
            $table->timestamps();
            $table->index(['item_id', 'branch_id', 'created_at']);
        });

        $header = function (Blueprint $table) {
            $table->id();
            $table->string('ref_no', 30)->unique();
            $table->foreignId('branch_id')->constrained('branches');
            $table->foreignId('user_id')->constrained('users');
            $table->date('date');
        };

        Schema::create('grns', function (Blueprint $t) use ($header) {
            $header($t);
            $t->foreignId('supplier_id')->constrained('suppliers');
            $t->string('invoice_no', 50);
            $t->decimal('total', 12, 2)->default(0);
            $t->decimal('paid', 12, 2)->default(0);
            $t->text('notes')->nullable();
            $t->timestamps();
        });
        Schema::create('supplier_returns', function (Blueprint $t) use ($header) {
            $header($t);
            $t->foreignId('supplier_id')->constrained('suppliers');
            $t->foreignId('grn_id')->nullable()->constrained('grns');
            $t->decimal('total', 12, 2)->default(0);
            $t->text('notes')->nullable();
            $t->timestamps();
        });
        Schema::create('stock_adjustments', function (Blueprint $t) use ($header) {
            $header($t);
            $t->string('reason')->nullable();
            $t->decimal('total', 12, 2)->default(0);
            $t->text('notes')->nullable();
            $t->timestamps();
        });
        Schema::create('stock_transfers', function (Blueprint $t) use ($header) {
            $header($t);
            $t->foreignId('to_branch_id')->constrained('branches');
            $t->decimal('total', 12, 2)->default(0);
            $t->text('notes')->nullable();
            $t->timestamps();
        });
        Schema::create('stock_counts', function (Blueprint $t) use ($header) {
            $header($t);
            $t->string('status', 20)->default('draft'); // draft | applied
            $t->decimal('total', 12, 2)->default(0);
            $t->text('notes')->nullable();
            $t->timestamps();
        });
        Schema::create('opening_stocks', function (Blueprint $t) use ($header) {
            $header($t);
            $t->decimal('total', 12, 2)->default(0);
            $t->text('notes')->nullable();
            $t->timestamps();
        });

        foreach ($this->documents as $fk => $parent) {
            Schema::create($fk.'_items', function (Blueprint $table) use ($fk, $parent) {
                $table->id();
                $table->foreignId($fk.'_id')->constrained($parent)->cascadeOnDelete();
                $table->foreignId('item_id')->constrained('items');
                $table->decimal('quantity', 14, 3); // counts: counted qty; adjustments: signed
                $table->decimal('system_quantity', 14, 3)->nullable();
                $table->decimal('unit_cost', 12, 2)->default(0);
                $table->decimal('total', 12, 2)->default(0);
                $table->timestamps();
            });
        }

        Schema::create('supplier_payments', function (Blueprint $table) {
            $table->id();
            $table->string('ref_no', 30)->unique();
            $table->foreignId('branch_id')->constrained('branches');
            $table->foreignId('supplier_id')->constrained('suppliers');
            $table->foreignId('grn_id')->nullable()->constrained('grns');
            $table->foreignId('user_id')->constrained('users');
            $table->date('date');
            $table->decimal('amount', 12, 2);
            $table->string('method', 20);
            $table->string('reference')->nullable();
            $table->string('bank')->nullable();
            $table->string('cheque_no', 50)->nullable();
            $table->date('cheque_date')->nullable();
            $table->text('notes')->nullable();
            $table->timestamps();
        });

        Schema::create('transaction_categories', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->string('type', 10); // income | expense
            $table->boolean('is_active')->default(true);
            $table->timestamps();
            $table->unique(['name', 'type']);
        });

        Schema::create('transactions', function (Blueprint $table) {
            $table->id();
            $table->string('ref_no', 30)->unique();
            $table->foreignId('branch_id')->constrained('branches');
            $table->foreignId('category_id')->constrained('transaction_categories');
            $table->foreignId('user_id')->constrained('users');
            $table->foreignId('shift_id')->nullable()->constrained('shifts');
            $table->string('type', 10);
            $table->date('date');
            $table->decimal('amount', 12, 2);
            $table->string('method', 20)->default('cash');
            $table->string('reference')->nullable();
            $table->string('description')->nullable();
            $table->timestamps();
        });

        Schema::create('cash_book', function (Blueprint $table) {
            $table->id();
            $table->foreignId('branch_id')->constrained('branches');
            $table->foreignId('shift_id')->nullable()->constrained('shifts');
            $table->foreignId('user_id')->nullable()->constrained('users');
            $table->date('date')->index();
            $table->string('direction', 3); // in | out
            $table->string('source', 30); // sale | refund | expense | income | supplier_payment | plan
            $table->nullableMorphs('sourceable');
            $table->string('method', 20);
            $table->decimal('amount', 12, 2);
            $table->string('reference')->nullable();
            $table->string('description')->nullable();
            $table->timestamps();
        });

        Schema::create('cheques', function (Blueprint $table) {
            $table->id();
            $table->foreignId('branch_id')->constrained('branches');
            $table->foreignId('user_id')->constrained('users');
            $table->string('payee');
            $table->decimal('amount', 12, 2);
            $table->date('cheque_date');
            $table->string('cheque_no', 50)->nullable();
            $table->string('bank')->nullable();
            $table->boolean('ac_payee')->default(true);
            $table->foreignId('supplier_payment_id')->nullable()->constrained('supplier_payments');
            $table->timestamps();
        });
    }

    public function down(): void
    {
        foreach (['cheques', 'cash_book', 'transactions', 'transaction_categories', 'supplier_payments'] as $t) {
            Schema::dropIfExists($t);
        }
        foreach (array_reverse($this->documents) as $fk => $parent) {
            Schema::dropIfExists($fk.'_items');
        }
        foreach (array_reverse(array_values($this->documents)) as $parent) {
            Schema::dropIfExists($parent);
        }
        foreach (['stock_movements', 'item_stocks', 'items'] as $t) {
            Schema::dropIfExists($t);
        }
    }
};
