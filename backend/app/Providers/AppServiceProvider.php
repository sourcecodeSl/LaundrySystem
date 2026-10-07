<?php

namespace App\Providers;

use App\Models\User;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\ServiceProvider;
use Illuminate\Support\Str;
use Illuminate\Validation\Rules\Password;

class AppServiceProvider extends ServiceProvider
{
    public function register(): void {}

    public function boot(): void
    {
        // Catch lazy-loading / silently discarded attributes during development.
        Model::shouldBeStrict(! $this->app->isProduction());
        Model::preventLazyLoading(false);

        // Every "module.action" ability maps onto the role's permission list.
        Gate::before(function (User $user, string $ability) {
            if (str_contains($ability, '.')) {
                return $user->hasPermission($ability) ?: null;
            }

            return null;
        });

        // Strong password policy (checked against known breaches in production).
        Password::defaults(function () {
            $rule = Password::min(8)->letters()->mixedCase()->numbers()->symbols();

            return $this->app->isProduction() ? $rule->uncompromised() : $rule;
        });

        RateLimiter::for('login', fn (Request $r) => [
            Limit::perMinute(5)->by(Str::lower((string) $r->input('username')).'|'.$r->ip()),
            Limit::perMinute(20)->by('ip:'.$r->ip()),
        ]);
        RateLimiter::for('api', fn (Request $r) => Limit::perMinute(300)->by($r->user()?->id ?: $r->ip()));
        RateLimiter::for('sensitive', fn (Request $r) => Limit::perMinute(5)->by($r->user()?->id ?: $r->ip()));
        RateLimiter::for('public', fn (Request $r) => Limit::perMinute(30)->by($r->ip()));
    }
}
