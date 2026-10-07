<?php

namespace App\Http\Controllers\Operations;

use App\Http\Controllers\Controller;
use App\Models\Customer;
use App\Models\SmsLog;
use App\Services\Settings;
use App\Services\Sms;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Validation\Rule;

class SmsController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $this->authorize('sms.view');
        $q = SmsLog::with(['customer:id,name', 'order:id,order_no', 'user:id,name']);
        if ($s = mb_substr(trim((string) $request->query('q')), 0, 100)) {
            $q->where(fn ($w) => $w->where('mobile', 'like', "%$s%")->orWhere('message', 'like', "%$s%"));
        }
        foreach (['type', 'status'] as $f) {
            if ($request->filled($f)) {
                $q->where($f, (string) $request->query($f));
            }
        }
        if ($from = $request->date('from')) {
            $q->whereDate('created_at', '>=', $from);
        }
        if ($to = $request->date('to')) {
            $q->whereDate('created_at', '<=', $to);
        }
        if (! $request->user()->canAccessAllBranches()) {
            $q->where(fn ($w) => $w->whereHas('order', fn ($o) => $o->where('branch_id', $request->user()->branch_id))
                ->orWhere('user_id', $request->user()->id));
        }

        return response()->json($q->latest('id')->paginate(min(max($request->integer('per_page', 25), 1), 100)));
    }

    public function send(Request $request): JsonResponse
    {
        $this->authorize('sms.send');
        $data = $request->validate([
            'customer_id' => ['required_without:mobile', 'nullable', 'integer', 'exists:customers,id'],
            'mobile' => ['required_without:customer_id', 'nullable', 'string', 'regex:/^\+?[0-9]{7,15}$/'],
            'message' => ['required', 'string', 'max:480'],
        ]);
        $this->throttle($request, 1);
        $customer = ! empty($data['customer_id']) ? Customer::find($data['customer_id']) : null;

        return response()->json(Sms::send($data['mobile'] ?? $customer->mobile, strip_tags($data['message']), 'custom', $customer), 201);
    }

    /** Payment reminders to every opted-in customer with an outstanding balance. */
    public function reminders(Request $request): JsonResponse
    {
        $this->authorize('sms.send');
        $data = $request->validate([
            'customer_ids' => ['nullable', 'array', 'max:500'],
            'customer_ids.*' => ['integer'],
            'min_balance' => ['nullable', 'numeric', 'min:0'],
        ]);
        $customers = Customer::where('balance', '>', $data['min_balance'] ?? 0)->where('sms_opt_in', true)->where('is_active', true)
            ->when($data['customer_ids'] ?? null, fn ($q, $ids) => $q->whereIn('id', $ids))
            ->when(! $request->user()->canAccessAllBranches(), fn ($q) => $q->where('branch_id', $request->user()->branch_id))
            ->limit(500)->get();
        $this->throttle($request, max(1, $customers->count()));

        $tpl = Settings::get('sms', 'tpl_payment_reminder');
        foreach ($customers as $c) {
            Sms::send($c->mobile, Sms::render($tpl, null, $c), 'payment_reminder', $c);
        }

        return response()->json(['sent' => $customers->count()]);
    }

    /** Anti-abuse: cap SMS volume per user per hour. */
    private function throttle(Request $request, int $count): void
    {
        $key = 'sms:'.$request->user()->id;
        abort_if(RateLimiter::remaining($key, 1000) < $count, 429, 'SMS hourly limit reached.');
        for ($i = 0; $i < $count; $i++) {
            RateLimiter::hit($key, 3600);
        }
    }
}
