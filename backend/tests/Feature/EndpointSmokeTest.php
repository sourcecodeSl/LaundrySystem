<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class EndpointSmokeTest extends TestCase
{
    use RefreshDatabase;

    protected bool $seed = true;

    public function test_every_list_endpoint_responds(): void
    {
        $admin = User::where('username', 'admin')->first();
        $admin->forceFill(['must_change_password' => false])->save();
        $this->actingAs($admin);

        $endpoints = ['branches', 'services', 'service-categories', 'service-variants', 'prices', 'customers', 'suppliers', 'promotions',
            'items', 'financial-rates', 'transaction-categories', 'billing-plans', 'roles', 'users', 'orders', 'quotations', 'sales-returns',
            'complaints', 'damage-lost', 'sms', 'stock/grns', 'stock/supplier-returns', 'stock/adjustments', 'stock/transfers', 'stock/counts',
            'stock/opening', 'supplier-payments', 'transactions', 'cheques', 'shifts', 'shifts/current', 'billing-transactions', 'pos/held',
            'settings', 'alerts', 'ledger/customers/1', 'ledger/suppliers/1', 'customers?all=1&q=kas', 'orders?q=0712&status=received'];

        foreach ($endpoints as $e) {
            $this->getJson("/api/$e")->assertOk();
        }

        $this->getJson('/api/stock/unknown')->assertNotFound();
        $this->getJson('/api/customers/999')->assertNotFound()->assertJson(['message' => 'Record not found.']);
    }

    public function test_crud_and_security_headers(): void
    {
        $admin = User::where('username', 'admin')->first();
        $admin->forceFill(['must_change_password' => false])->save();
        $this->actingAs($admin);

        $res = $this->postJson('/api/customers', ['name' => 'Test <b>User</b>', 'mobile' => '077 111 2222', 'opening_balance' => 250])->assertCreated();
        $res->assertHeader('X-Content-Type-Options', 'nosniff')->assertHeader('X-Frame-Options', 'DENY');
        $id = $res->json('id');
        $this->assertEquals(250, $res->json('balance'));
        $this->putJson("/api/customers/$id", ['name' => 'Renamed', 'mobile' => '0771112222', 'opening_balance' => 5])->assertStatus(422);
        $this->putJson("/api/customers/$id", ['name' => 'Renamed', 'mobile' => '0771112222'])->assertOk()->assertJsonPath('name', 'Renamed');
        $this->deleteJson("/api/customers/$id")->assertStatus(422); // has balance

        $this->postJson('/api/roles', ['name' => 'Auditor', 'permissions' => ['reports.view', 'not.real']])->assertStatus(422);
        $this->postJson('/api/roles', ['name' => 'Auditor', 'permissions' => ['reports.view']])->assertCreated();
        $this->getJson('/api/customers?sort=password&dir=asc')->assertOk(); // non-whitelisted sort ignored

        // All 5 seeded consumables start with zero stock, so all are low.
        $this->getJson('/api/alerts')->assertOk()->assertJsonFragment(['key' => 'low_stock', 'count' => 5]);
    }
}
