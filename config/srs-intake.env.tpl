# Environment for the SRS intake (/srs-intake). No secret values live here.
# `op run --env-file=config/srs-intake.env.tpl -- <command>` resolves the op:// reference
# at run time and hands it to the command only. Nothing is written to disk or printed.
#
# The item is the service-role key for the prod brain (project rnhmvcpsvtqjlffpsayu).
# Do NOT point this at the items named SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in the same
# vault: those belong to a different Supabase project (verified 2026-11-10 by the JWT's
# `ref` claim). That mix-up is what broke the local .env.
SUPABASE_URL=https://rnhmvcpsvtqjlffpsayu.supabase.co
SUPABASE_SERVICE_ROLE_KEY=op://Shared with Grok Bot/Supabase Service Role - PE_CC_DEV/credential
