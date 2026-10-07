<?php

namespace App\Services;

use App\Models\Setting;
use Illuminate\Support\Facades\Cache;

class Settings
{
    public const DEFAULTS = [
        'general' => [
            'business_name' => 'FreshFold Laundry',
            'currency' => 'Rs.',
            'phone' => '',
            'address' => '',
            'email' => '',
            'default_delivery_hours' => '48',
            'require_shift' => '1',
        ],
        'receipt' => [
            'paper_width' => '80',
            'header_text' => 'Thank you for choosing us!',
            'footer_text' => 'Items not collected within 30 days will be disposed.',
            'show_logo' => '1',
            'show_queue_no' => '1',
            'show_barcode' => '1',
            'show_tax_breakdown' => '1',
            'show_customer' => '1',
            'show_item_notes' => '1',
            'copies' => '1',
        ],
        'sms' => [
            'enabled' => '0',
            'driver' => 'log',
            'sender_id' => 'LAUNDRY',
            'auto_on_ready' => '1',
            'auto_on_delivered' => '1',
            'auto_on_order' => '0',
            'tpl_order_created' => 'Hi {name}, your order {order_no} (Queue #{queue_no}) is received. Total {currency}{total}. View bill: {ebill_link}',
            'tpl_order_ready' => 'Hi {name}, your order {order_no} is READY for collection. Balance due: {currency}{balance}.',
            'tpl_delivered' => 'Hi {name}, your order {order_no} has been delivered. Thank you!',
            'tpl_payment_reminder' => 'Hi {name}, a balance of {currency}{balance} is pending on your account. Please settle at your convenience.',
            'tpl_ebill' => 'Hi {name}, your e-bill for {order_no}: {ebill_link}',
        ],
    ];

    public static function all(): array
    {
        return Cache::remember('settings.all', 600, function () {
            $stored = [];
            foreach (Setting::all() as $s) {
                $stored[$s->group][$s->key] = $s->value;
            }
            $merged = [];
            foreach (static::DEFAULTS as $group => $values) {
                $merged[$group] = array_merge($values, $stored[$group] ?? []);
            }

            return $merged;
        });
    }

    public static function get(string $group, string $key, ?string $default = null): ?string
    {
        return static::all()[$group][$key] ?? $default;
    }

    public static function put(string $group, array $values): void
    {
        foreach ($values as $key => $value) {
            if (! array_key_exists($key, static::DEFAULTS[$group] ?? [])) {
                continue; // only known keys may be stored
            }
            Setting::updateOrCreate(['group' => $group, 'key' => $key], ['value' => is_bool($value) ? ($value ? '1' : '0') : (string) $value]);
        }
        Cache::forget('settings.all');
    }
}
