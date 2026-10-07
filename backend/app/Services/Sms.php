<?php

namespace App\Services;

use App\Models\Customer;
use App\Models\Order;
use App\Models\SmsLog;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Throwable;

/**
 * SMS gateway wrapper. Driver "log" writes to the Laravel log (development);
 * driver "http" posts to the gateway configured in .env (SMS_API_URL / SMS_API_KEY).
 * Gateway credentials live only in .env, never in the database or the frontend.
 */
class Sms
{
    public static function send(string $mobile, string $message, string $type = 'custom', ?Customer $customer = null, ?Order $order = null): SmsLog
    {
        $log = SmsLog::create([
            'customer_id' => $customer?->id,
            'order_id' => $order?->id,
            'mobile' => $mobile,
            'type' => $type,
            'message' => $message,
            'status' => 'queued',
            'user_id' => auth()->id(),
        ]);

        if (Settings::get('sms', 'enabled') !== '1') {
            $log->update(['status' => 'skipped', 'response' => 'SMS disabled in settings']);

            return $log;
        }

        try {
            if (Settings::get('sms', 'driver') === 'http' && config('services.sms.url')) {
                $res = Http::timeout(10)->withToken((string) config('services.sms.key'))->post(config('services.sms.url'), [
                    'to' => $mobile,
                    'message' => $message,
                    'sender_id' => Settings::get('sms', 'sender_id'),
                ]);
                $log->update(['status' => $res->successful() ? 'sent' : 'failed', 'response' => mb_substr($res->body(), 0, 1000)]);
            } else {
                Log::info("[SMS to $mobile] $message");
                $log->update(['status' => 'sent', 'response' => 'log driver']);
            }
        } catch (Throwable $e) {
            $log->update(['status' => 'failed', 'response' => mb_substr($e->getMessage(), 0, 1000)]);
        }

        return $log;
    }

    public static function render(string $template, ?Order $order = null, ?Customer $customer = null): string
    {
        $customer ??= $order?->customer;
        $vars = [
            '{name}' => $customer?->name ?? 'Customer',
            '{order_no}' => $order?->order_no ?? '',
            '{queue_no}' => $order?->queue_no ?? '',
            '{total}' => $order ? number_format($order->total, 2) : '',
            '{balance}' => number_format($order ? $order->balance : (float) $customer?->balance, 2),
            '{currency}' => Settings::get('general', 'currency', ''),
            '{business}' => Settings::get('general', 'business_name', ''),
            '{ebill_link}' => $order ? static::ebillUrl($order) : '',
        ];

        return strtr($template, $vars);
    }

    public static function forOrder(Order $order, string $type): ?SmsLog
    {
        $customer = $order->customer;
        if (! $customer || ! $customer->sms_opt_in || ! $customer->mobile) {
            return null;
        }
        $tpl = Settings::get('sms', 'tpl_'.$type);

        return $tpl ? static::send($customer->mobile, static::render($tpl, $order), $type, $customer, $order) : null;
    }

    public static function ebillUrl(Order $order): string
    {
        return rtrim((string) config('app.frontend_url'), '/').'/ebill/'.$order->ebill_token;
    }
}
