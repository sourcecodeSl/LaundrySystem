<?php

namespace Tests\Feature;

use App\Models\Customer;
use App\Models\Item;
use App\Models\Service;
use App\Models\ServiceVariant;
use App\Models\Supplier;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class LaundryFlowTest extends TestCase
{
    use RefreshDatabase;

    protected bool $seed = true;

    private function admin(): User
    {
        $u = User::where('username', 'admin')->first();
        $u->forceFill(['must_change_password' => false])->save();

        return $u;
    }

    private function cashier(): User
    {
        $u = User::where('username', 'cashier')->first();
        $u->forceFill(['must_change_password' => false])->save();

        return $u;
    }

    public function test_login_lockout_and_password_change_gate(): void
    {
        $this->withHeaders(["Referer" => "http://localhost:5173/"]);
        $this->postJson('/api/auth/login', ['username' => 'cashier', 'password' => 'wrong'])->assertStatus(422);
        $this->postJson('/api/auth/login', ['username' => 'cashier', 'password' => 'Cashier@12345'])->assertOk()
            ->assertJsonPath('user.must_change_password', true);

        // Forced password change blocks other endpoints
        $this->getJson('/api/orders')->assertStatus(423);
        $this->postJson('/api/auth/change-password', [
            'current_password' => 'Cashier@12345', 'password' => 'weak', 'password_confirmation' => 'weak',
        ])->assertStatus(422);
        $this->postJson('/api/auth/change-password', [
            'current_password' => 'Cashier@12345', 'password' => 'N3w!Passw0rd', 'password_confirmation' => 'N3w!Passw0rd',
        ])->assertOk();
        $this->getJson('/api/orders')->assertOk();
    }

    public function test_account_locks_after_repeated_failures(): void
    {
        $this->withHeaders(["Referer" => "http://localhost:5173/"]);
        for ($i = 0; $i < 5; $i++) {
            $this->postJson('/api/auth/login', ['username' => 'manager', 'password' => 'bad'.$i]);
        }
        $this->assertTrue(User::where('username', 'manager')->first()->isLocked());
    }

    public function test_unauthenticated_and_permission_denied(): void
    {
        $this->getJson('/api/customers')->assertStatus(401);
        $this->actingAs($this->cashier());
        $this->getJson('/api/users')->assertForbidden();
        $this->getJson('/api/reports/profit')->assertForbidden();
        $this->postJson('/api/roles', ['name' => 'x'])->assertForbidden();
    }

    public function test_full_order_lifecycle(): void
    {
        $cashier = $this->cashier();
        $this->actingAs($cashier);
        $customer = Customer::first();
        $kg = ServiceVariant::where('name', 'Up to 5 kg')->first();
        $shirt = ServiceVariant::where('name', 'Shirt / T-Shirt')->first();
        $wd = Service::where('code', 'WD')->first();
        $irn = Service::where('code', 'IRN')->first();

        $order = [
            'customer_id' => $customer->id, 'delivery_type' => 'pickup',
            'items' => [
                ['service_id' => $wd->id, 'variant_id' => $kg->id, 'weight' => 4, 'quantity' => 12, 'unit_price' => 1], // price override ignored (no permission)
                ['service_id' => $irn->id, 'variant_id' => $shirt->id, 'quantity' => 3, 'notes' => 'Collar stain'],
            ],
            'payments' => [['method' => 'cash', 'amount' => 500]],
        ];

        // Shift required
        $this->postJson('/api/orders', $order)->assertStatus(422)->assertJsonValidationErrors('shift');
        $this->postJson('/api/shifts/open', ['opening_cash' => 1000])->assertCreated();

        $res = $this->postJson('/api/orders', $order)->assertCreated();
        $id = $res->json('id');
        // 4kg x 300 + 3 x 60 = 1380
        $res->assertJsonPath('total', 1380)->assertJsonPath('paid', 500)->assertJsonPath('balance', 880)->assertJsonPath('queue_no', 1);
        $this->assertEquals(880, $customer->fresh()->balance);

        // Overpayment rejected, then settle
        $this->postJson("/api/orders/$id/payments", ['method' => 'card', 'amount' => 5000])->assertStatus(422);
        $this->postJson("/api/orders/$id/status", ['status' => 'ready'])->assertOk()->assertJsonPath('status', 'ready');
        $this->postJson("/api/orders/$id/payments", ['method' => 'card', 'amount' => 880])->assertOk()->assertJsonPath('payment_status', 'paid');
        $this->postJson("/api/orders/$id/status", ['status' => 'delivered'])->assertOk();
        $this->postJson("/api/orders/$id/status", ['status' => 'washing'])->assertStatus(422);
        $this->assertEquals(0, $customer->fresh()->balance);

        // Shift close reconciles cash: 1000 opening + 500 cash
        $this->postJson('/api/shifts/close', ['closing_cash' => 1500])->assertOk()->assertJsonPath('expected_cash', 1500)->assertJsonPath('difference', 0);

        // Public e-bill
        $token = \App\Models\Order::find($id)->ebill_token;
        $this->app['auth']->forgetGuards();
        $this->getJson("/api/public/ebill/$token")->assertOk()->assertJsonPath('order.total', 1380)->assertJsonMissingPath('order.id');
        $this->getJson('/api/public/ebill/invalid')->assertNotFound();
    }

    public function test_walk_in_must_pay_in_full_and_sales_return(): void
    {
        $admin = $this->admin();
        $this->actingAs($admin);
        $this->postJson('/api/shifts/open', ['opening_cash' => 0, 'branch_id' => 1])->assertCreated();
        $shirt = ServiceVariant::where('name', 'Shirt / T-Shirt')->first();
        $irn = Service::where('code', 'IRN')->first();
        $items = [['service_id' => $irn->id, 'variant_id' => $shirt->id, 'quantity' => 4]];

        $this->postJson('/api/orders', ['branch_id' => 1, 'delivery_type' => 'pickup', 'items' => $items, 'payments' => []])
            ->assertStatus(422)->assertJsonValidationErrors('customer_id');
        $id = $this->postJson('/api/orders', ['branch_id' => 1, 'delivery_type' => 'pickup', 'items' => $items,
            'payments' => [['method' => 'cash', 'amount' => 240]]])->assertCreated()->json('id');
        $itemId = \App\Models\Order::find($id)->items()->first()->id;

        $this->postJson('/api/sales-returns', ['order_id' => $id, 'refund_method' => 'cash',
            'items' => [['order_item_id' => $itemId, 'quantity' => 1]]])->assertCreated()->assertJsonPath('amount', 60);
        $this->getJson("/api/orders/$id")->assertJsonPath('paid', 180)->assertJsonPath('returned', 60)->assertJsonPath('payment_status', 'paid');
        $this->postJson('/api/sales-returns', ['order_id' => $id, 'refund_method' => 'cash',
            'items' => [['order_item_id' => $itemId, 'quantity' => 5]]])->assertStatus(422);
    }

    public function test_inventory_grn_transfer_and_count(): void
    {
        $this->actingAs($this->admin());
        $item = Item::first();
        $supplier = Supplier::first();

        $this->postJson('/api/stock/grns', ['branch_id' => 1, 'supplier_id' => $supplier->id, 'invoice_no' => 'INV-77', 'date' => today()->toDateString(),
            'items' => [['item_id' => $item->id, 'quantity' => 10, 'unit_cost' => 100]], 'paid' => 400, 'payment_method' => 'cash'])
            ->assertCreated()->assertJsonPath('total', 1000);
        $this->assertEquals(600, $supplier->fresh()->balance);

        $this->postJson('/api/stock/transfers', ['branch_id' => 1, 'to_branch_id' => 2, 'date' => today()->toDateString(),
            'items' => [['item_id' => $item->id, 'quantity' => 50]]])->assertStatus(422); // insufficient
        $this->postJson('/api/stock/transfers', ['branch_id' => 1, 'to_branch_id' => 2, 'date' => today()->toDateString(),
            'items' => [['item_id' => $item->id, 'quantity' => 4]]])->assertCreated();

        $this->postJson('/api/stock/counts', ['branch_id' => 1, 'date' => today()->toDateString(), 'apply' => true,
            'items' => [['item_id' => $item->id, 'quantity' => 5]]])->assertCreated()->assertJsonPath('status', 'applied');

        $levels = $this->getJson('/api/stock/levels?branch_id=1')->assertOk()->json('data');
        $this->assertEquals(5, collect($levels)->firstWhere('id', $item->id)['quantity']);
        $this->getJson('/api/stock/branch')->assertOk();
        $this->getJson('/api/stock/movements')->assertOk()->assertJsonPath('total', 4);
    }

    public function test_reports_dashboard_and_branch_isolation(): void
    {
        $this->actingAs($this->admin());
        foreach (['sales-by-service', 'sales-by-branch', 'sales-by-cashier', 'daily-sales', 'outstanding', 'customer-balances', 'payments', 'profit'] as $r) {
            $this->getJson("/api/reports/$r")->assertOk();
        }
        $this->getJson('/api/dashboard')->assertOk()->assertJsonStructure(['kpis' => ['sales', 'orders']]);
        $this->getJson('/api/cash-book')->assertOk();
        $this->getJson('/api/activity-logs')->assertOk();
        $this->getJson('/api/lookups')->assertOk();
        $this->getJson('/api/pos/catalog')->assertOk();

        // Cashier at MAIN cannot see a CITY expense
        $this->postJson('/api/transactions', ['branch_id' => 2, 'type' => 'expense', 'category_id' => \App\Models\TransactionCategory::where('type', 'expense')->value('id'),
            'date' => today()->toDateString(), 'amount' => 100, 'method' => 'cash'])->assertCreated();
        $this->actingAs($this->cashier());
        $this->getJson('/api/transactions')->assertOk()->assertJsonPath('total', 0);
    }

    public function test_bulk_price_update_and_privilege_escalation_guard(): void
    {
        $this->actingAs($this->admin());
        $this->postJson('/api/prices/bulk', ['mode' => 'percent', 'value' => 10, 'preview' => true])->assertOk()->assertJsonPath('applied', false);
        $this->postJson('/api/prices/bulk', ['mode' => 'percent', 'value' => 10, 'round_to' => 5])->assertOk()->assertJsonPath('applied', true);

        $manager = User::where('username', 'manager')->first();
        $manager->forceFill(['must_change_password' => false])->save();
        $this->actingAs($manager);
        $superRole = \App\Models\Role::where('is_super', true)->value('id');
        $this->postJson('/api/users', ['name' => 'X', 'username' => 'xuser', 'role_id' => $superRole,
            'password' => 'Aa1!aaaa', 'password_confirmation' => 'Aa1!aaaa'])->assertStatus(422)->assertJsonValidationErrors('role_id');
    }
}
