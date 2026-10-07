<?php

namespace App\Models\Concerns;

use App\Models\ActivityLog;
use Illuminate\Database\Eloquent\Model;

/**
 * Records create / update / delete events into the activity log.
 * Hidden attributes (passwords, tokens) are never written to the log.
 */
trait LogsActivity
{
    public static function bootLogsActivity(): void
    {
        static::created(fn (Model $m) => ActivityLog::record('created', $m, $m->loggableAttributes($m->getAttributes())));

        static::updated(function (Model $m) {
            $changes = $m->loggableAttributes($m->getChanges());
            unset($changes['updated_at']);
            if (! $changes) {
                return;
            }
            $old = array_intersect_key($m->getOriginal(), $changes);
            ActivityLog::record('updated', $m, ['old' => $m->loggableAttributes($old), 'new' => $changes]);
        });

        static::deleted(fn (Model $m) => ActivityLog::record('deleted', $m));
    }

    protected function loggableAttributes(array $attributes): array
    {
        $hidden = array_merge($this->getHidden(), ['password', 'remember_token']);

        return array_diff_key($attributes, array_flip($hidden));
    }
}
