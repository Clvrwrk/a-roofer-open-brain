import { TOOL_SLUG, TOOL_VERSION, classifyError } from "./core.mjs";
import { HERMES_MODEL } from "./policy.mjs";
import { composioSendRequestOptions } from "./request-options.mjs";

export async function executeSlackSendOnce({
  composio,
  userId,
  connectedAccountId,
  arguments_,
  store,
  claimName,
  abortSignal,
}) {
  try {
    const result = await composio.tools.execute(
      TOOL_SLUG,
      {
        userId,
        connectedAccountId,
        version: TOOL_VERSION,
        arguments: arguments_,
      },
      composioSendRequestOptions(undefined, abortSignal),
    );
    if (!result?.successful || !result?.data?.ok || !result?.data?.ts) {
      throw new Error("Composio Slack send did not return a confirmed provider timestamp");
    }
    await store.confirm(claimName, result.data.ts, HERMES_MODEL);
    return { state: "confirmed", providerMessageId: result.data.ts };
  } catch (error) {
    const errorClass = classifyError(error);
    await store.ambiguous(claimName, errorClass);
    return { state: "ambiguous", errorClass };
  }
}
