<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('shifts', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained('users');
            $table->foreignId('branch_id')->constrained('branches');
            $table->timestamp('opened_at');
            $table->decimal('opening_cash', 12, 2)->default(0);
            $table->timestamp('closed_at')->nullable();
            $table->decimal('closing_cash', 12, 2)->nullable();
            $table->decimal('expected_cash', 12, 2)->nullable();
            $table->decimal('difference', 12, 2)->nullable();
            $table->string('status', 10)->default('open');
            $table->text('notes')->nullable();
            $table->timestamps();
        });

        Schema::create('orders', function (Blueprint $table) {
            $table->id();
            $table->string('order_no', 30)->unique();
            $table->string('receipt_no', 30)->unique();
            $table->unsignedInteger('queue_no');
            $table->foreignId('branch_id')->constrained('branches');
            $table->foreignId('customer_id')->nullable()->constrained('customers');
            $table->foreignId('user_id')->constrained('users');
            $table->foreignId('shift_id')->nullable()->constrained('shifts');
            $table->foreignId('promotion_id')->nullable()->constrained('promotions');
            $table->unsignedBigInteger('quotation_id')->nullable();
            $table->string('status', 20)->default('received');
            $table->string('payment_status', 20)->default('unpaid');
            $table->decimal('subtotal', 12, 2)->default(0);
            $table->decimal('discount', 12, 2)->default(0);
            $table->decimal('tax', 12, 2)->default(0);
            $table->decimal('service_charge', 12, 2)->default(0);
            $table->decimal('total', 12, 2)->default(0);
            $table->decimal('paid', 12, 2)->default(0);
            $table->decimal('balance', 12, 2)->default(0);
            $table->decimal('returned', 12, 2)->default(0);
            $table->decimal('total_weight', 10, 2)->default(0);
            $table->unsignedInteger('total_pieces')->default(0);
            $table->string('delivery_type', 20)->default('pickup'); // pickup | home_delivery
            $table->string('delivery_address')->nullable();
            $table->timestamp('delivery_at')->nullable();
            $table->timestamp('delivered_at')->nullable();
            $table->text('notes')->nullable();
            $table->string('ebill_token', 64)->unique();
            $table->timestamps();
            $table->softDeletes();
            $table->index(['branch_id', 'created_at']);
            $table->index(['status', 'payment_status']);
        });

        Schema::create('order_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('order_id')->constrained('orders')->cascadeOnDelete();
            $table->foreignId('service_id')->nullable()->constrained('services');
            $table->foreignId('variant_id')->nullable()->constrained('service_variants');
            $table->string('description');
            $table->string('pricing_type', 20);
            $table->decimal('weight', 10, 2)->nullable();
            $table->decimal('quantity', 10, 2)->default(1);
            $table->decimal('unit_price', 12, 2);
            $table->decimal('discount', 12, 2)->default(0);
            $table->decimal('total', 12, 2);
            $table->decimal('returned_qty', 10, 2)->default(0);
            $table->boolean('is_temporary')->default(false);
            $table->string('tag_code', 40)->nullable()->index();
            $table->string('notes')->nullable(); // stains, damage, special instructions
            $table->timestamps();
        });

        Schema::create('order_status_histories', function (Blueprint $table) {
            $table->id();
            $table->foreignId('order_id')->constrained('orders')->cascadeOnDelete();
            $table->string('status', 20);
            $table->string('note')->nullable();
            $table->foreignId('user_id')->nullable()->constrained('users');
            $table->timestamps();
        });

        Schema::create('payments', function (Blueprint $table) {
            $table->id();
            $table->string('payment_no', 30)->unique();
            $table->foreignId('branch_id')->constrained('branches');
            $table->foreignId('order_id')->nullable()->constrained('orders');
            $table->foreignId('customer_id')->nullable()->constrained('customers');
            $table->foreignId('shift_id')->nullable()->constrained('shifts');
            $table->foreignId('user_id')->constrained('users');
            $table->string('method', 20); // cash | card | bank_transfer | cheque
            $table->decimal('amount', 12, 2);
            $table->string('reference')->nullable();
            $table->string('bank')->nullable();
            $table->string('cheque_no', 50)->nullable();
            $table->date('cheque_date')->nullable();
            $table->boolean('is_advance')->default(false);
            $table->timestamps();
        });

        Schema::create('held_bills', function (Blueprint $table) {
            $table->id();
            $table->foreignId('branch_id')->constrained('branches');
            $table->foreignId('user_id')->constrained('users');
            $table->foreignId('customer_id')->nullable()->constrained('customers');
            $table->string('label')->nullable();
            $table->json('cart');
            $table->decimal('total', 12, 2)->default(0);
            $table->timestamps();
        });

        Schema::create('quotations', function (Blueprint $table) {
            $table->id();
            $table->string('quotation_no', 30)->unique();
            $table->foreignId('branch_id')->constrained('branches');
            $table->foreignId('customer_id')->nullable()->constrained('customers');
            $table->foreignId('user_id')->constrained('users');
            $table->string('customer_name')->nullable();
            $table->string('customer_mobile', 30)->nullable();
            $table->date('valid_until')->nullable();
            $table->string('status', 20)->default('draft'); // draft | sent | accepted | converted | expired
            $table->decimal('subtotal', 12, 2)->default(0);
            $table->decimal('discount', 12, 2)->default(0);
            $table->decimal('tax', 12, 2)->default(0);
            $table->decimal('service_charge', 12, 2)->default(0);
            $table->decimal('total', 12, 2)->default(0);
            $table->text('notes')->nullable();
            $table->foreignId('order_id')->nullable()->constrained('orders');
            $table->timestamps();
            $table->softDeletes();
        });

        Schema::create('quotation_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('quotation_id')->constrained('quotations')->cascadeOnDelete();
            $table->foreignId('service_id')->nullable()->constrained('services');
            $table->foreignId('variant_id')->nullable()->constrained('service_variants');
            $table->string('description');
            $table->string('pricing_type', 20);
            $table->decimal('weight', 10, 2)->nullable();
            $table->decimal('quantity', 10, 2)->default(1);
            $table->decimal('unit_price', 12, 2);
            $table->decimal('total', 12, 2);
            $table->string('notes')->nullable();
            $table->timestamps();
        });

        Schema::create('complaints', function (Blueprint $table) {
            $table->id();
            $table->string('ref_no', 30)->unique();
            $table->foreignId('branch_id')->constrained('branches');
            $table->foreignId('order_id')->nullable()->constrained('orders');
            $table->foreignId('customer_id')->nullable()->constrained('customers');
            $table->foreignId('user_id')->constrained('users');
            $table->string('type', 20); // rewash | complaint
            $table->text('description');
            $table->string('status', 20)->default('open'); // open | in_progress | resolved | rejected
            $table->text('resolution')->nullable();
            $table->timestamp('resolved_at')->nullable();
            $table->timestamps();
        });

        Schema::create('sales_returns', function (Blueprint $table) {
            $table->id();
            $table->string('ref_no', 30)->unique();
            $table->foreignId('branch_id')->constrained('branches');
            $table->foreignId('order_id')->constrained('orders');
            $table->foreignId('customer_id')->nullable()->constrained('customers');
            $table->foreignId('user_id')->constrained('users');
            $table->foreignId('shift_id')->nullable()->constrained('shifts');
            $table->decimal('amount', 12, 2);
            $table->string('refund_method', 20); // cash | card | bank_transfer | credit_note
            $table->string('reason')->nullable();
            $table->timestamps();
        });

        Schema::create('sales_return_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('sales_return_id')->constrained('sales_returns')->cascadeOnDelete();
            $table->foreignId('order_item_id')->constrained('order_items');
            $table->decimal('quantity', 10, 2);
            $table->decimal('amount', 12, 2);
            $table->timestamps();
        });

        Schema::create('damage_lost_items', function (Blueprint $table) {
            $table->id();
            $table->string('ref_no', 30)->unique();
            $table->foreignId('branch_id')->constrained('branches');
            $table->foreignId('order_id')->nullable()->constrained('orders');
            $table->foreignId('order_item_id')->nullable()->constrained('order_items');
            $table->foreignId('customer_id')->nullable()->constrained('customers');
            $table->foreignId('user_id')->constrained('users');
            $table->string('type', 10); // damage | lost
            $table->string('item_description');
            $table->text('description')->nullable();
            $table->decimal('compensation', 12, 2)->default(0);
            $table->string('status', 20)->default('reported'); // reported | investigating | compensated | closed
            $table->date('reported_on');
            $table->timestamps();
        });

        Schema::create('sms_logs', function (Blueprint $table) {
            $table->id();
            $table->foreignId('customer_id')->nullable()->constrained('customers')->nullOnDelete();
            $table->foreignId('order_id')->nullable()->constrained('orders')->nullOnDelete();
            $table->string('mobile', 30);
            $table->string('type', 30); // order_ready | delivered | payment_reminder | ebill | custom
            $table->text('message');
            $table->string('status', 20)->default('queued');
            $table->text('response')->nullable();
            $table->foreignId('user_id')->nullable()->constrained('users');
            $table->timestamps();
        });

        Schema::create('billing_transactions', function (Blueprint $table) {
            $table->id();
            $table->string('ref_no', 30)->unique();
            $table->foreignId('branch_id')->constrained('branches');
            $table->foreignId('customer_id')->constrained('customers');
            $table->foreignId('billing_plan_id')->constrained('billing_plans');
            $table->foreignId('user_id')->constrained('users');
            $table->date('starts_on');
            $table->date('ends_on');
            $table->decimal('amount', 12, 2);
            $table->decimal('paid', 12, 2)->default(0);
            $table->string('method', 20)->nullable();
            $table->string('status', 20)->default('active'); // active | expired | cancelled
            $table->decimal('weight_used', 8, 2)->default(0);
            $table->unsignedInteger('pieces_used')->default(0);
            $table->string('notes')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        foreach (['billing_transactions', 'sms_logs', 'damage_lost_items', 'sales_return_items', 'sales_returns', 'complaints',
            'quotation_items', 'quotations', 'held_bills', 'payments', 'order_status_histories', 'order_items', 'orders', 'shifts'] as $t) {
            Schema::dropIfExists($t);
        }
    }
};
