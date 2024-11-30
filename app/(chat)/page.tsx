import { cookies } from "next/headers";

import { Chat } from "@/components/chat";
import { DEFAULT_MODEL_NAME, models } from "@/lib/ai/models";
import { generateUUID } from "@/lib/utils";
import { getChatById } from "@/lib/db/queries";

export default async function Page() {
  const id = generateUUID();

  const cookieStore = await cookies();
  const modelIdFromCookie = cookieStore.get("model-id")?.value;

  const selectedModelId =
    models.find((model) => model.id === modelIdFromCookie)?.id ||
    DEFAULT_MODEL_NAME;

  const chat = await getChatById({ id });

  let repoUrl;
  if (chat) {
    repoUrl = chat.repoUrl;
  }
  return (
    <Chat
      key={id}
      id={id}
      initialMessages={[]}
      selectedModelId={selectedModelId}
      repoUrl={repoUrl || undefined}
    />
  );
}
