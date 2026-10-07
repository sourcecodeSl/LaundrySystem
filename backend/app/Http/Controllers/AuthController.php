<?php

namespace App\Http\Controllers;

use App\Models\ActivityLog;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\Rules\Password;
use Illuminate\Validation\ValidationException;

class AuthController extends Controller
{
    private const MAX_ATTEMPTS = 5;

    private const LOCK_MINUTES = 15;

    /** Hash of a random throwaway string, used to equalise timing for unknown usernames. */
    private const DUMMY_HASH = '$2y$12$xLHo4O0WYxz2m6GB36X3v.elqD2cikHwuhumbgjnLcbCTeGHCO.Vi';

    public function login(Request $request): JsonResponse
    {
        $data = $request->validate([
            'username' => ['required', 'string', 'max:100'],
            'password' => ['required', 'string', 'max:255'],
            'remember' => ['boolean'],
        ]);

        $user = User::with('role', 'branch')->where('username', $data['username'])->orWhere('email', $data['username'])->first();

        if ($user?->isLocked()) {
            throw ValidationException::withMessages(['username' => 'Account temporarily locked after failed attempts. Try again in '.max(1, (int) ceil(now()->diffInMinutes($user->locked_until))).' minute(s).']);
        }

        // Always run a hash check so response timing does not reveal whether the username exists.
        $valid = Hash::check($data['password'], $user?->password ?? self::DUMMY_HASH);

        if (! $user || ! $valid) {
            if ($user) {
                $user->failed_logins++;
                if ($user->failed_logins >= self::MAX_ATTEMPTS) {
                    $user->locked_until = now()->addMinutes(self::LOCK_MINUTES);
                    $user->failed_logins = 0;
                }
                $user->saveQuietly();
                ActivityLog::record('login_failed', $user, null, 'Failed login attempt');
            }
            throw ValidationException::withMessages(['username' => 'Invalid username or password.']);
        }

        if (! $user->is_active || ($user->branch && ! $user->branch->is_active)) {
            throw ValidationException::withMessages(['username' => 'Your account is disabled. Contact an administrator.']);
        }

        Auth::guard('web')->login($user, (bool) ($data['remember'] ?? false));
        $request->session()->regenerate(); // prevent session fixation

        $user->forceFill(['failed_logins' => 0, 'locked_until' => null, 'last_login_at' => now(), 'last_login_ip' => $request->ip()])->saveQuietly();
        if (Hash::needsRehash($user->password)) {
            $user->forceFill(['password' => $data['password']])->saveQuietly();
        }
        ActivityLog::record('login', $user, null, 'Signed in');

        return response()->json($this->payload($user));
    }

    public function me(Request $request): JsonResponse
    {
        return response()->json($this->payload($request->user()->load('role', 'branch')));
    }

    public function logout(Request $request): JsonResponse
    {
        ActivityLog::record('logout', $request->user(), null, 'Signed out');
        Auth::guard('web')->logout();
        $request->session()->invalidate();
        $request->session()->regenerateToken();

        return response()->json(['message' => 'Signed out']);
    }

    public function changePassword(Request $request): JsonResponse
    {
        $user = $request->user();
        if (! $user->isSuper() && $user->branch && ! $user->branch->allow_password_change && ! $user->must_change_password) {
            abort(403, 'Password changes are disabled for your branch. Ask an administrator to reset it.');
        }

        $data = $request->validate([
            'current_password' => ['required', 'current_password:web'],
            'password' => ['required', 'confirmed', 'different:current_password', Password::defaults()],
        ]);

        $user->forceFill([
            'password' => $data['password'],
            'must_change_password' => false,
            'password_changed_at' => now(),
            'remember_token' => null,
        ])->save();

        // Sign out every other device that used the old password.
        Auth::guard('web')->logoutOtherDevices($data['password']);
        $request->session()->regenerate();
        ActivityLog::record('password_changed', $user, null, 'Password changed');

        return response()->json(['message' => 'Password updated.']);
    }

    private function payload(User $user): array
    {
        return [
            'user' => $user->only(['id', 'name', 'username', 'email', 'mobile', 'branch_id', 'must_change_password', 'last_login_at']),
            'role' => $user->role?->only(['id', 'name', 'is_super']),
            'branch' => $user->branch?->only(['id', 'code', 'name', 'allow_password_change']),
            'permissions' => $user->permissions(),
            'all_branches' => $user->canAccessAllBranches(),
        ];
    }
}
