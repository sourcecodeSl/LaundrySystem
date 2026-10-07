<?php

namespace App\Services;

use Illuminate\Support\Facades\DB;

/** Gap-free, concurrency-safe document numbers (row lock per sequence key). */
class Numbering
{
    public static function nextValue(string $key): int
    {
        return DB::transaction(function () use ($key) {
            $row = DB::table('sequences')->where('key', $key)->lockForUpdate()->first();
            if (! $row) {
                DB::table('sequences')->insertOrIgnore(['key' => $key, 'value' => 0]);
                $row = DB::table('sequences')->where('key', $key)->lockForUpdate()->first();
            }
            $next = $row->value + 1;
            DB::table('sequences')->where('key', $key)->update(['value' => $next]);

            return $next;
        });
    }

    /** e.g. ORD-MAIN-2610-00042 (monthly running number per branch). */
    public static function next(string $prefix, ?string $branchCode = null, int $pad = 5): string
    {
        $period = now()->format('ym');
        $scope = $branchCode ? "$prefix-$branchCode-$period" : "$prefix-$period";

        return $scope.'-'.str_pad((string) static::nextValue($scope), $pad, '0', STR_PAD_LEFT);
    }

    /** Daily queue number per branch, restarting at 1 every day. */
    public static function queue(int $branchId): int
    {
        return static::nextValue('Q-'.$branchId.'-'.now()->format('Ymd'));
    }
}
