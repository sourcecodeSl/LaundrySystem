<?php

use App\Http\Controllers\AuthController;
use App\Http\Controllers\Finance\BillingTransactionController;
use App\Http\Controllers\Finance\CashBookController;
use App\Http\Controllers\Finance\ChequeController;
use App\Http\Controllers\Finance\LedgerController;
use App\Http\Controllers\Finance\ShiftController;
use App\Http\Controllers\Finance\SupplierPaymentController;
use App\Http\Controllers\Finance\TransactionController;
use App\Http\Controllers\Inventory\InventoryController;
use App\Http\Controllers\Masters;
use App\Http\Controllers\Operations\ComplaintController;
use App\Http\Controllers\Operations\DamageLostController;
use App\Http\Controllers\Operations\SmsController;
use App\Http\Controllers\PublicEbillController;
use App\Http\Controllers\Sales\OrderController;
use App\Http\Controllers\Sales\PosController;
use App\Http\Controllers\Sales\QuotationController;
use App\Http\Controllers\Sales\SalesReturnController;
use App\Http\Controllers\System\ActivityLogController;
use App\Http\Controllers\System\DashboardController;
use App\Http\Controllers\System\LookupController;
use App\Http\Controllers\System\ReportController;
use App\Http\Controllers\System\SettingsController;
use Illuminate\Support\Facades\Route;

// ---- Public -------------------------------------------------------------
Route::post('auth/login', [AuthController::class, 'login'])->middleware('throttle:login')->name('auth.login');
Route::get('public/ebill/{token}', PublicEbillController::class)->middleware('throttle:public');

// ---- Authenticated (Sanctum SPA session) -------------------------------
Route::middleware(['auth:sanctum', 'account.usable', 'throttle:api'])->group(function () {
    Route::get('auth/me', [AuthController::class, 'me'])->name('auth.me');
    Route::post('auth/logout', [AuthController::class, 'logout'])->name('auth.logout');
    Route::post('auth/change-password', [AuthController::class, 'changePassword'])->middleware('throttle:sensitive')->name('auth.password');

    Route::get('lookups', LookupController::class);
    Route::get('dashboard', DashboardController::class);
    Route::get('reports/{type}', ReportController::class);
    Route::get('activity-logs', [ActivityLogController::class, 'index']);
    Route::get('settings', [SettingsController::class, 'index']);
    Route::put('settings/{group}', [SettingsController::class, 'update']);

    // Masters
    Route::apiResource('branches', Masters\BranchController::class);
    Route::apiResource('services', Masters\ServiceController::class);
    Route::apiResource('service-categories', Masters\ServiceCategoryController::class);
    Route::apiResource('service-variants', Masters\ServiceVariantController::class);
    Route::get('prices', [Masters\PriceController::class, 'index']);
    Route::put('prices', [Masters\PriceController::class, 'save']);
    Route::post('prices/bulk', [Masters\PriceController::class, 'bulk']);
    Route::apiResource('customers', Masters\CustomerController::class);
    Route::apiResource('suppliers', Masters\SupplierController::class);
    Route::apiResource('promotions', Masters\PromotionController::class);
    Route::apiResource('items', Masters\ItemController::class);
    Route::apiResource('financial-rates', Masters\FinancialRateController::class);
    Route::apiResource('transaction-categories', Masters\TransactionCategoryController::class);
    Route::apiResource('billing-plans', Masters\BillingPlanController::class);
    Route::apiResource('roles', Masters\RoleController::class);
    Route::apiResource('users', Masters\UserController::class);
    Route::post('users/{id}/reset-password', [Masters\UserController::class, 'resetPassword'])->middleware('throttle:sensitive');
    Route::post('users/{id}/unlock', [Masters\UserController::class, 'unlock']);

    // POS & orders
    Route::get('pos/catalog', [PosController::class, 'catalog']);
    Route::post('pos/calculate', [PosController::class, 'calculate']);
    Route::get('pos/held', [PosController::class, 'held']);
    Route::post('pos/held', [PosController::class, 'hold']);
    Route::get('pos/held/{id}', [PosController::class, 'recall']);
    Route::delete('pos/held/{id}', [PosController::class, 'discard']);

    Route::get('orders', [OrderController::class, 'index']);
    Route::post('orders', [OrderController::class, 'store']);
    Route::post('orders/bulk-status', [OrderController::class, 'bulkStatus']);
    Route::get('orders/tag/{tag}', [OrderController::class, 'byTag']);
    Route::get('orders/{id}', [OrderController::class, 'show']);
    Route::put('orders/{id}', [OrderController::class, 'update']);
    Route::post('orders/{id}/status', [OrderController::class, 'status']);
    Route::post('orders/{id}/payments', [OrderController::class, 'payment']);
    Route::post('orders/{id}/cancel', [OrderController::class, 'cancel']);
    Route::post('orders/{id}/sms', [OrderController::class, 'sendSms']);

    Route::apiResource('quotations', QuotationController::class);
    Route::post('quotations/{id}/convert', [QuotationController::class, 'convert']);
    Route::get('sales-returns', [SalesReturnController::class, 'index']);
    Route::post('sales-returns', [SalesReturnController::class, 'store']);
    Route::get('sales-returns/{id}', [SalesReturnController::class, 'show']);

    // Operations
    Route::apiResource('complaints', ComplaintController::class);
    Route::apiResource('damage-lost', DamageLostController::class);
    Route::get('sms', [SmsController::class, 'index']);
    Route::post('sms', [SmsController::class, 'send']);
    Route::post('sms/reminders', [SmsController::class, 'reminders']);

    // Inventory
    Route::get('stock/levels', [InventoryController::class, 'levels']);
    Route::get('stock/branch', [InventoryController::class, 'branchStock']);
    Route::get('stock/movements', [InventoryController::class, 'movements']);
    Route::post('stock/counts/{id}/apply', [InventoryController::class, 'applyCountRequest']);
    Route::get('stock/{type}', [InventoryController::class, 'index']);
    Route::post('stock/{type}', [InventoryController::class, 'store']);
    Route::get('stock/{type}/{id}', [InventoryController::class, 'show']);

    // Finance
    Route::get('ledger/customers/{id}', [LedgerController::class, 'customer']);
    Route::post('ledger/customers/{id}/settle', [LedgerController::class, 'settle']);
    Route::post('ledger/customers/{id}/adjust', [LedgerController::class, 'adjustCustomer']);
    Route::get('ledger/suppliers/{id}', [LedgerController::class, 'supplier']);
    Route::get('supplier-payments', [SupplierPaymentController::class, 'index']);
    Route::post('supplier-payments', [SupplierPaymentController::class, 'store']);
    Route::apiResource('transactions', TransactionController::class)->except('update');
    Route::apiResource('cheques', ChequeController::class);
    Route::get('cash-book', [CashBookController::class, 'index']);
    Route::get('shifts', [ShiftController::class, 'index']);
    Route::get('shifts/current', [ShiftController::class, 'current']);
    Route::post('shifts/open', [ShiftController::class, 'open']);
    Route::post('shifts/close', [ShiftController::class, 'close']);
    Route::get('shifts/{id}', [ShiftController::class, 'show']);
    Route::get('billing-transactions', [BillingTransactionController::class, 'index']);
    Route::post('billing-transactions', [BillingTransactionController::class, 'store']);
    Route::post('billing-transactions/{id}/cancel', [BillingTransactionController::class, 'cancel']);
});
