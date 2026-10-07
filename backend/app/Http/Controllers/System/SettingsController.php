<?php

namespace App\Http\Controllers\System;

use App\Http\Controllers\Controller;
use App\Models\ActivityLog;
use App\Services\Settings;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class SettingsController extends Controller
{
    /** Public-safe settings every signed-in user needs (business name, receipt layout). */
    public function index(Request $request): JsonResponse
    {
        $all = Settings::all();
        if (! $request->user()->hasPermission('settings.manage')) {
            unset($all['sms']);
        }

        return response()->json($all);
    }

    public function update(Request $request, string $group): JsonResponse
    {
        $this->authorize('settings.manage');
        abort_unless(array_key_exists($group, Settings::DEFAULTS), 404);

        $rules = [];
        foreach (Settings::DEFAULTS[$group] as $key => $default) {
            $rules[$key] = ['nullable', 'string', 'max:1000'];
        }
        if ($group === 'receipt') {
            $rules['paper_width'] = ['nullable', Rule::in(['58', '80', 'A4'])];
        }
        if ($group === 'sms') {
            $rules['driver'] = ['nullable', Rule::in(['log', 'http'])];
            $rules['sender_id'] = ['nullable', 'string', 'max:11', 'alpha_num'];
        }
        $data = $request->validate($rules);
        Settings::put($group, array_map(fn ($v) => $v ?? '', $data));
        ActivityLog::record('settings_updated', null, ['group' => $group], "Settings updated: $group");

        return response()->json(Settings::all()[$group]);
    }
}
