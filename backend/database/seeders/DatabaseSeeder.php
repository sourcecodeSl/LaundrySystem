<?php

namespace Database\Seeders;

use App\Models\BillingPlan;
use App\Models\Branch;
use App\Models\Customer;
use App\Models\FinancialRate;
use App\Models\Item;
use App\Models\Promotion;
use App\Models\Role;
use App\Models\Service;
use App\Models\ServiceCategory;
use App\Models\ServiceVariant;
use App\Models\Supplier;
use App\Models\TransactionCategory;
use App\Models\User;
use App\Models\VariantPrice;
use Illuminate\Database\Seeder;

/**
 * Development seed data.
 * Default logins (all must change password at first sign-in):
 *   admin / Admin@12345   manager / Manager@12345   cashier / Cashier@12345
 * Override the admin password with SEED_ADMIN_PASSWORD in .env for any shared environment.
 */
class DatabaseSeeder extends Seeder
{
    public function run(): void
    {
        $main = Branch::create(['code' => 'MAIN', 'name' => 'Main Branch', 'address' => '12 Galle Road, Colombo 03', 'phone' => '0112345678']);
        $city = Branch::create(['code' => 'CITY', 'name' => 'City Branch', 'address' => '45 Kandy Road, Kiribathgoda', 'phone' => '0119876543']);

        $all = config('permissions.all');
        $pick = fn (array $modules, array $extra = []) => array_values(array_merge(
            array_filter($all, fn ($p) => in_array(explode('.', $p)[0], $modules, true)), $extra));

        $super = Role::create(['name' => 'Super Admin', 'description' => 'Full access to everything', 'is_super' => true, 'permissions' => []]);
        $manager = Role::create(['name' => 'Branch Manager', 'description' => 'Manages a single branch',
            'permissions' => array_values(array_diff($pick(['dashboard', 'pos', 'orders', 'quotations', 'customers', 'services', 'promotions', 'suppliers',
                'inventory', 'complaints', 'sales_returns', 'damage_lost', 'finance', 'shifts', 'sms', 'billing', 'reports', 'users', 'activity_logs'],
                ['branches.view', 'roles.view']), ['branches.all']))]);
        $cashier = Role::create(['name' => 'Cashier', 'description' => 'Front counter',
            'permissions' => ['dashboard.view', 'pos.access', 'pos.temporary_item', 'pos.hold', 'orders.view', 'orders.status', 'orders.payment',
                'quotations.view', 'quotations.create', 'quotations.convert', 'customers.view', 'customers.create', 'customers.update', 'customers.ledger',
                'services.view', 'complaints.view', 'complaints.create', 'damage_lost.view', 'damage_lost.create', 'shifts.manage', 'sms.send', 'sms.view',
                'billing.transactions', 'finance.transactions']]);
        Role::create(['name' => 'Production Staff', 'description' => 'Washing / ironing floor', 'permissions' => ['orders.view', 'orders.status', 'complaints.view']]);

        User::create(['name' => 'System Administrator', 'username' => 'admin', 'email' => 'admin@example.test', 'role_id' => $super->id,
            'branch_id' => null, 'password' => env('SEED_ADMIN_PASSWORD', 'Admin@12345'), 'must_change_password' => true]);
        User::create(['name' => 'Main Manager', 'username' => 'manager', 'role_id' => $manager->id, 'branch_id' => $main->id,
            'password' => 'Manager@12345', 'must_change_password' => true]);
        User::create(['name' => 'Main Cashier', 'username' => 'cashier', 'role_id' => $cashier->id, 'branch_id' => $main->id,
            'password' => 'Cashier@12345', 'must_change_password' => true]);

        // Service master
        $services = collect([
            ['DRY', 'Only Dry', 6], ['WD', 'Wash & Dry', 24], ['IRN', 'Ironing', 12], ['DC', 'Dry Cleaning', 72],
        ])->map(fn ($s) => Service::create(['code' => $s[0], 'name' => $s[1], 'processing_hours' => $s[2]]));

        $cats = collect(['All', 'Ironing', 'Dry Cleaning', 'Wash & Dry', 'Temporary'])->mapWithKeys(fn ($n) => [$n => ServiceCategory::create(['name' => $n])]);

        // Variants: [name, category, type, min, max, unit, prices per service code]
        $variants = [
            ['Up to 5 kg', 'Wash & Dry', 'weight_range', 0.1, 5, 'kg', ['DRY' => 150, 'WD' => 300]],
            ['5 - 10 kg', 'Wash & Dry', 'weight_range', 5.01, 10, 'kg', ['DRY' => 130, 'WD' => 260]],
            ['Above 10 kg', 'Wash & Dry', 'weight_range', 10.01, 100, 'kg', ['DRY' => 110, 'WD' => 220]],
            ['Shirt / T-Shirt', 'All', 'per_piece', null, null, 'pcs', ['WD' => 120, 'IRN' => 60, 'DC' => 350]],
            ['Trouser', 'All', 'per_piece', null, null, 'pcs', ['WD' => 140, 'IRN' => 70, 'DC' => 400]],
            ['Saree', 'All', 'per_piece', null, null, 'pcs', ['WD' => 300, 'IRN' => 200, 'DC' => 900]],
            ['Suit (2 pc)', 'Dry Cleaning', 'per_piece', null, null, 'pcs', ['DC' => 1500, 'IRN' => 300]],
            ['Dress / Frock', 'All', 'per_piece', null, null, 'pcs', ['WD' => 200, 'IRN' => 100, 'DC' => 650]],
            ['Bed Sheet', 'Wash & Dry', 'per_item', null, null, 'item', ['WD' => 250, 'IRN' => 150]],
            ['Curtain (per panel)', 'Wash & Dry', 'per_item', null, null, 'item', ['WD' => 450, 'DC' => 900]],
            ['Blanket / Comforter', 'Wash & Dry', 'per_item', null, null, 'item', ['WD' => 900, 'DC' => 1800]],
        ];
        $byCode = $services->keyBy('code');
        foreach ($variants as [$name, $cat, $type, $min, $max, $unit, $prices]) {
            $v = ServiceVariant::create(['category_id' => $cats[$cat]->id, 'name' => $name, 'pricing_type' => $type,
                'min_weight' => $min, 'max_weight' => $max, 'unit' => $unit]);
            foreach ($prices as $code => $price) {
                VariantPrice::create(['variant_id' => $v->id, 'service_id' => $byCode[$code]->id, 'price' => $price]);
            }
        }

        FinancialRate::create(['name' => 'Service Charge', 'type' => 'service_charge', 'rate' => 5, 'is_active' => false]);
        FinancialRate::create(['name' => 'VAT', 'type' => 'tax', 'rate' => 18, 'is_active' => false]);

        foreach (['Laundry Services', 'Delivery Charges', 'Other Income'] as $n) {
            TransactionCategory::create(['name' => $n, 'type' => 'income']);
        }
        foreach (['Electricity', 'Water', 'Rent', 'Salaries', 'Transport', 'Maintenance', 'Other Expenses'] as $n) {
            TransactionCategory::create(['name' => $n, 'type' => 'expense']);
        }

        foreach ([['DET-01', 'Liquid Detergent', 'ltr', 950, 10], ['SOFT-01', 'Fabric Softener', 'ltr', 780, 5],
            ['BLC-01', 'Stain Remover', 'ltr', 1200, 3], ['HNG-01', 'Hangers', 'pcs', 25, 100], ['BAG-01', 'Poly Bags', 'pcs', 8, 200]] as $i) {
            Item::create(['code' => $i[0], 'name' => $i[1], 'unit' => $i[2], 'cost_price' => $i[3], 'reorder_level' => $i[4]]);
        }

        Supplier::create(['code' => 'SUP-0001', 'name' => 'CleanChem Distributors', 'contact_person' => 'Nimal Perera', 'mobile' => '0771234567']);
        Customer::create(['code' => 'CUS-00001', 'name' => 'Kasun Silva', 'mobile' => '0712345678', 'branch_id' => $main->id, 'credit_limit' => 5000]);
        Customer::create(['code' => 'CUS-00002', 'name' => 'Dilini Fernando', 'mobile' => '0759876543', 'branch_id' => $city->id]);

        BillingPlan::create(['name' => 'Monthly 20 kg', 'description' => 'Up to 20 kg wash & dry per month', 'price' => 4500,
            'duration_days' => 30, 'weight_limit' => 20, 'discount_percent' => 10]);
        Promotion::create(['name' => 'Weekend 10% off', 'code' => 'WEEKEND10', 'type' => 'percentage', 'value' => 10, 'min_amount' => 1000]);
        Promotion::create(['name' => '5 Shirts for 500', 'type' => 'package', 'variant_id' => ServiceVariant::where('name', 'Shirt / T-Shirt')->value('id'),
            'package_qty' => 5, 'package_price' => 500]);
    }
}
