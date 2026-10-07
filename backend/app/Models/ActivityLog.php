<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Str;

class ActivityLog extends Model
{
    public const UPDATED_AT = null;

    protected $guarded = ['id'];

    protected function casts(): array
    {
        return ['changes' => 'array', 'created_at' => 'datetime'];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public static function record(string $action, ?Model $subject = null, ?array $changes = null, ?string $description = null): void
    {
        $user = auth()->user();
        $request = app()->runningInConsole() ? null : request();

        static::create([
            'user_id' => $user?->id,
            'branch_id' => ($subject?->getAttributes()['branch_id'] ?? null) ?? $user?->branch_id,
            'action' => $action,
            'subject_type' => $subject ? class_basename($subject) : null,
            'subject_id' => $subject?->getKey(),
            'description' => $description ?? ($subject ? Str::headline(class_basename($subject)).' '.$action : $action),
            'changes' => $changes,
            'ip_address' => $request?->ip(),
            'user_agent' => $request ? Str::limit((string) $request->userAgent(), 250, '') : null,
        ]);
    }
}
