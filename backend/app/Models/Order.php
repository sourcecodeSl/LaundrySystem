<?php

namespace App\Models;

use App\Models\Concerns\BelongsToBranch;
use App\Models\Concerns\LogsActivity;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class Order extends Model
{
    use BelongsToBranch, LogsActivity, SoftDeletes;

    public const STATUSES = ['received', 'washing', 'drying', 'ironing', 'ready', 'delivered', 'cancelled'];

    public const PAYMENT_METHODS = ['cash', 'card', 'bank_transfer', 'cheque'];

    protected $guarded = ['id', 'created_at', 'updated_at', 'deleted_at'];

    protected $hidden = ['ebill_token'];

    protected function casts(): array
    {
        return [
            'subtotal' => 'float', 'discount' => 'float', 'tax' => 'float', 'service_charge' => 'float',
            'total' => 'float', 'paid' => 'float', 'balance' => 'float', 'returned' => 'float',
            'total_weight' => 'float', 'total_pieces' => 'integer', 'queue_no' => 'integer',
            'delivery_at' => 'datetime', 'delivered_at' => 'datetime',
        ];
    }

    public function items(): HasMany
    {
        return $this->hasMany(OrderItem::class);
    }

    public function payments(): HasMany
    {
        return $this->hasMany(Payment::class);
    }

    public function histories(): HasMany
    {
        return $this->hasMany(OrderStatusHistory::class)->latest('id');
    }

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }

    public function branch(): BelongsTo
    {
        return $this->belongsTo(Branch::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function promotion(): BelongsTo
    {
        return $this->belongsTo(Promotion::class);
    }

    public function refreshPaymentStatus(): void
    {
        $this->balance = round(max(0, $this->total - $this->returned - $this->paid), 2);
        $this->payment_status = match (true) {
            $this->balance <= 0 => 'paid',
            $this->paid > 0 => 'partial',
            default => 'unpaid',
        };
    }
}
