-- PEC-755: verified webhook ingress and human-approved Maya mirror_refresh also
-- enqueue through this RPC. They run as service_role, never as public app users.
-- Keep pinned search_path and option validation; expose no Vault data to callers.
ALTER FUNCTION public.trigger_acculynx_sync(jsonb) SECURITY DEFINER;
GRANT EXECUTE ON FUNCTION public.trigger_acculynx_sync(jsonb) TO service_role;
