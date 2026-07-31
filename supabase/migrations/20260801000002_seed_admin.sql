-- =========================================================
-- MIGRATION: 20260801000002_seed_admin.sql
-- DESCRIPTION: Seed default administrator user (admin / admin).
-- Uses Supabase-compatible bcrypt format ($2b$) for password.
-- =========================================================

DO $$
DECLARE
    v_admin_id UUID := '00000000-0000-0000-0000-000000000001'::UUID;
    v_email TEXT := 'admin@system.local';
    v_username TEXT := 'admin';
    v_encrypted_pw TEXT := crypt('admin123', gen_salt('bf'));
BEGIN

    -- Insert into auth.users if not exists
    INSERT INTO auth.users (
        instance_id,
        id,
        aud,
        role,
        email,
        encrypted_password,
        email_confirmed_at,
        confirmation_token,
        recovery_token,
        email_change_token_new,
        email_change,
        raw_app_meta_data,
        raw_user_meta_data,
        created_at,
        updated_at
    )
    SELECT
        '00000000-0000-0000-0000-000000000000',
        v_admin_id,
        'authenticated',
        'authenticated',
        v_email,
        v_encrypted_pw,
        NOW(),
        '',
        '',
        '',
        '',
        '{"provider": "email", "providers": ["email"]}',
        '{"username": "admin", "role": "ADMIN"}',
        NOW(),
        NOW()
    WHERE NOT EXISTS (SELECT 1 FROM auth.users WHERE email = v_email OR id = v_admin_id);

    -- Insert into auth.identities if not exists
    INSERT INTO auth.identities (
        id,
        user_id,
        provider_id,
        identity_data,
        provider,
        last_sign_in_at,
        created_at,
        updated_at
    )
    SELECT
        v_admin_id,
        v_admin_id,
        v_email,
        format('{"sub":"%s","email":"%s"}', v_admin_id, v_email)::jsonb,
        'email',
        NOW(),
        NOW(),
        NOW()
    WHERE NOT EXISTS (SELECT 1 FROM auth.identities WHERE user_id = v_admin_id);

    -- Insert or update profile for Admin
    INSERT INTO public.profiles (
        id,
        username,
        full_name,
        role,
        class_id
    ) VALUES (
        v_admin_id,
        v_username,
        'System Administrator',
        'ADMIN',
        NULL
    )
    ON CONFLICT (id) DO UPDATE SET
        username = EXCLUDED.username,
        role = 'ADMIN';

END $$;
