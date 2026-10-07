<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Symfony\Component\HttpFoundation\Response;

/**
 * Kills sessions of deactivated / deleted / locked users immediately, and blocks
 * everything except password change while a password change is required.
 */
class EnsureAccountUsable
{
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();

        if ($user && (! $user->is_active || $user->trashed() || $user->isLocked() || ($user->branch && ! $user->branch->is_active))) {
            Auth::guard('web')->logout();
            $request->session()->invalidate();
            $request->session()->regenerateToken();

            return response()->json(['message' => 'Your account is disabled. Contact an administrator.'], 401);
        }

        if ($user && $user->must_change_password && ! $request->routeIs('auth.me', 'auth.logout', 'auth.password')) {
            return response()->json(['message' => 'You must change your password before continuing.', 'code' => 'password_change_required'], 423);
        }

        return $next($request);
    }
}
