<?php

/*
| Permission catalogue. Each module lists its actions; a permission string is
| "module.action". Roles store a list of granted permission strings.
*/

$modules = [
    'dashboard' => ['view'],
    'pos' => ['access', 'edit_price', 'discount', 'temporary_item', 'hold'],
    'orders' => ['view', 'update', 'status', 'payment', 'cancel', 'export'],
    'quotations' => ['view', 'create', 'update', 'delete', 'convert'],
    'customers' => ['view', 'create', 'update', 'delete', 'ledger', 'export'],
    'branches' => ['view', 'create', 'update', 'delete', 'all'],
    'services' => ['view', 'create', 'update', 'delete', 'prices', 'bulk_price'],
    'promotions' => ['view', 'create', 'update', 'delete'],
    'suppliers' => ['view', 'create', 'update', 'delete', 'ledger', 'payments'],
    'inventory' => ['view', 'manage_items', 'grn', 'supplier_return', 'adjustment', 'transfer', 'count', 'opening'],
    'complaints' => ['view', 'create', 'update'],
    'sales_returns' => ['view', 'create'],
    'damage_lost' => ['view', 'create', 'update'],
    'finance' => ['cashbook', 'transactions', 'categories', 'cheques'],
    'shifts' => ['manage', 'view_all'],
    'sms' => ['view', 'send'],
    'billing' => ['plans', 'transactions'],
    'reports' => ['view', 'profit'],
    'users' => ['view', 'create', 'update', 'delete', 'reset_password'],
    'roles' => ['view', 'manage'],
    'settings' => ['manage'],
    'activity_logs' => ['view'],
];

$all = [];
foreach ($modules as $module => $actions) {
    foreach ($actions as $action) {
        $all[] = "$module.$action";
    }
}

return [
    'modules' => $modules,
    'all' => $all,
];
