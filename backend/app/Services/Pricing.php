<?php

namespace App\Services;

use App\Models\BillingTransaction;
use App\Models\FinancialRate;
use App\Models\Promotion;
use App\Models\Service;
use App\Models\ServiceVariant;
use App\Models\User;
use App\Models\VariantPrice;
use Illuminate\Validation\ValidationException;

/**
 * Server-side price calculation. Client-sent totals are never trusted: every
 * line is re-priced from the price list, and overrides (edited price, discounts,
 * temporary items) are only honoured when the user holds the matching permission.
 */
class Pricing
{
    public static function calculate(array $lines, User $user, ?int $promotionId = null, float $orderDiscount = 0, ?int $customerId = null): array
    {
        if (! $lines) {
            throw ValidationException::withMessages(['items' => 'The cart is empty.']);
        }

        $canEditPrice = $user->hasPermission('pos.edit_price');
        $canDiscount = $user->hasPermission('pos.discount');
        $items = [];

        foreach (array_values($lines) as $i => $line) {
            $qty = round((float) ($line['quantity'] ?? 1), 2);
            if ($qty <= 0) {
                throw ValidationException::withMessages(["items.$i.quantity" => 'Quantity must be greater than zero.']);
            }

            if (! empty($line['is_temporary'])) {
                if (! $user->hasPermission('pos.temporary_item')) {
                    throw ValidationException::withMessages(["items.$i" => 'You are not allowed to add quick sale items.']);
                }
                $price = round((float) ($line['unit_price'] ?? 0), 2);
                if ($price < 0 || empty($line['description'])) {
                    throw ValidationException::withMessages(["items.$i" => 'Quick sale items need a description and price.']);
                }
                $item = [
                    'service_id' => $line['service_id'] ?? null, 'variant_id' => null,
                    'description' => mb_substr(trim($line['description']), 0, 200),
                    'pricing_type' => 'per_item', 'weight' => null, 'quantity' => $qty,
                    'unit_price' => $price, 'is_temporary' => true,
                ];
                $gross = $qty * $price;
            } else {
                $variant = ServiceVariant::where('is_active', true)->find($line['variant_id'] ?? 0);
                $service = Service::where('is_active', true)->find($line['service_id'] ?? 0);
                if (! $variant || ! $service) {
                    throw ValidationException::withMessages(["items.$i" => 'Invalid or inactive service / variant.']);
                }
                $listPrice = VariantPrice::where(['variant_id' => $variant->id, 'service_id' => $service->id])->value('price');
                if ($listPrice === null) {
                    throw ValidationException::withMessages(["items.$i" => "No price set for {$variant->name} ({$service->name})."]);
                }
                $price = (float) $listPrice;
                if ($canEditPrice && isset($line['unit_price']) && $line['unit_price'] !== '' && (float) $line['unit_price'] >= 0) {
                    $price = round((float) $line['unit_price'], 2);
                }

                $weight = null;
                if ($variant->pricing_type === 'weight_range') {
                    $weight = round((float) ($line['weight'] ?? 0), 2);
                    if ($weight <= 0) {
                        throw ValidationException::withMessages(["items.$i.weight" => "Weight is required for {$variant->name}."]);
                    }
                    if (($variant->min_weight !== null && $weight < $variant->min_weight) || ($variant->max_weight !== null && $weight > $variant->max_weight)) {
                        throw ValidationException::withMessages(["items.$i.weight" => "Weight {$weight}kg is outside the {$variant->name} range."]);
                    }
                    $gross = $weight * $price; // weight-range rates are per kg
                } else {
                    $gross = $qty * $price;
                }

                $item = [
                    'service_id' => $service->id, 'variant_id' => $variant->id,
                    'description' => "{$variant->name} - {$service->name}",
                    'pricing_type' => $variant->pricing_type, 'weight' => $weight, 'quantity' => $qty,
                    'unit_price' => $price, 'is_temporary' => false,
                ];
            }

            $gross = round($gross, 2);
            $lineDiscount = $canDiscount ? min($gross, max(0, round((float) ($line['discount'] ?? 0), 2))) : 0;
            $item['discount'] = $lineDiscount;
            $item['gross'] = $gross;
            $item['total'] = round($gross - $lineDiscount, 2);
            $item['notes'] = isset($line['notes']) ? mb_substr(strip_tags((string) $line['notes']), 0, 250) : null;
            $items[] = $item;
        }

        $subtotal = round(array_sum(array_column($items, 'total')), 2);

        // Promotion
        $promoDiscount = 0;
        $promotion = null;
        if ($promotionId) {
            $promotion = static::activePromotions()->firstWhere('id', $promotionId);
            if (! $promotion) {
                throw ValidationException::withMessages(['promotion_id' => 'The selected promotion is not available.']);
            }
            $promoDiscount = static::promotionDiscount($promotion, $items, $subtotal);
        }

        // Active billing plan (membership) discount
        $planDiscount = 0;
        $plan = $customerId ? static::activePlan($customerId) : null;
        if ($plan && $plan->plan?->discount_percent > 0) {
            $planDiscount = round(($subtotal - $promoDiscount) * $plan->plan->discount_percent / 100, 2);
        }

        $manual = $canDiscount ? max(0, round($orderDiscount, 2)) : 0;
        $discount = min($subtotal, round($promoDiscount + $planDiscount + $manual, 2));
        $net = $subtotal - $discount;

        $rates = FinancialRate::where('is_active', true)->get();
        $serviceCharge = round($net * $rates->where('type', 'service_charge')->sum('rate') / 100, 2);
        $tax = round(($net + $serviceCharge) * $rates->where('type', 'tax')->sum('rate') / 100, 2);

        return [
            'items' => $items,
            'subtotal' => $subtotal,
            'discount' => $discount,
            'promotion_discount' => $promoDiscount,
            'plan_discount' => $planDiscount,
            'service_charge' => $serviceCharge,
            'tax' => $tax,
            'total' => round($net + $serviceCharge + $tax, 2),
            'total_weight' => round(array_sum(array_map(fn ($i) => (float) $i['weight'], $items)), 2),
            'total_pieces' => (int) array_sum(array_column($items, 'quantity')),
            'promotion_id' => $promotion?->id,
            'billing_transaction_id' => $plan?->id,
        ];
    }

    public static function activePromotions()
    {
        $today = now()->toDateString();

        return Promotion::where('is_active', true)
            ->where(fn ($q) => $q->whereNull('starts_at')->orWhere('starts_at', '<=', $today))
            ->where(fn ($q) => $q->whereNull('ends_at')->orWhere('ends_at', '>=', $today))
            ->get();
    }

    public static function activePlan(int $customerId): ?BillingTransaction
    {
        $today = now()->toDateString();

        return BillingTransaction::with('plan')->where('customer_id', $customerId)->where('status', 'active')
            ->where('starts_on', '<=', $today)->where('ends_on', '>=', $today)->latest('id')->first();
    }

    protected static function promotionDiscount(Promotion $p, array $items, float $subtotal): float
    {
        if ($subtotal < $p->min_amount) {
            throw ValidationException::withMessages(['promotion_id' => "Minimum bill of {$p->min_amount} required for this promotion."]);
        }
        $eligible = array_filter($items, fn ($i) => (! $p->service_id || $i['service_id'] == $p->service_id)
            && (! $p->variant_id || $i['variant_id'] == $p->variant_id));
        $eligibleTotal = array_sum(array_column($eligible, 'total'));

        $discount = match ($p->type) {
            'percentage' => $eligibleTotal * min(100, $p->value) / 100,
            'fixed' => min($p->value, $eligibleTotal),
            'package' => static::packageDiscount($p, $eligible),
            default => 0,
        };

        return round(max(0, $discount), 2);
    }

    /** Package offer: every N eligible pieces are charged the package price. */
    protected static function packageDiscount(Promotion $p, array $eligible): float
    {
        if (! $p->package_qty || $p->package_price === null) {
            return 0;
        }
        $pieces = array_sum(array_column($eligible, 'quantity'));
        $groups = intdiv((int) $pieces, $p->package_qty);
        if ($groups < 1) {
            return 0;
        }
        $avgPrice = array_sum(array_column($eligible, 'total')) / max(1, $pieces);

        return max(0, $groups * ($p->package_qty * $avgPrice - $p->package_price));
    }
}
