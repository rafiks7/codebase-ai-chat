"use client";

import type { Attachment, Message } from "ai";
import { useChat } from "ai/react";
import { AnimatePresence } from "framer-motion";
import { useState } from "react";
import useSWR, { useSWRConfig } from "swr";
import { useWindowSize } from "usehooks-ts";

import { ChatHeader } from "@/components/chat-header";
import { PreviewMessage, ThinkingMessage } from "@/components/message";
import { useScrollToBottom } from "@/components/use-scroll-to-bottom";
import type { Vote } from "@/lib/db/schema";
import { fetcher } from "@/lib/utils";

import { Block, type UIBlock } from "./block";
import { BlockStreamHandler } from "./block-stream-handler";
import { MultimodalInput } from "./multimodal-input";
import { Overview } from "./overview";

export function Chat({
  id,
  initialMessages,
  selectedModelId,
}: {
  id: string;
  initialMessages: Array<Message>;
  selectedModelId: string;
}) {
  const { mutate } = useSWRConfig();

  const {
    messages,
    setMessages,
    handleSubmit,
    input,
    setInput,
    append,
    isLoading,
    stop,
    data: streamingData,
  } = useChat({
    body: { id, modelId: selectedModelId },
    initialMessages,
    onFinish: () => {
      mutate("/api/history");
    },
  });

  const { width: windowWidth = 1920, height: windowHeight = 1080 } =
    useWindowSize();

  const [block, setBlock] = useState<UIBlock>({
    documentId: "init",
    content: "",
    title: "",
    status: "idle",
    isVisible: false,
    boundingBox: {
      top: windowHeight / 4,
      left: windowWidth / 4,
      width: 250,
      height: 50,
    },
  });

  const { data: votes } = useSWR<Array<Vote>>(
    `/api/vote?chatId=${id}`,
    fetcher
  );

  const [messagesContainerRef, messagesEndRef] =
    useScrollToBottom<HTMLDivElement>();

  const [attachments, setAttachments] = useState<Array<Attachment>>([]);

  const [repoCloned, setRepoCloned] = useState(false);
  const [repoUrl, setRepoUrl] = useState("");

  const handleNewChatSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    console.log("cloning repo...");

    console.log("Repo URL:", repoUrl);

    // call clone repo function
    try {
      const response = await fetch(
        `http://localhost:5000/api/embed-repo?repo_url=${repoUrl}`,
        {
          method: 'GET',
          mode: 'no-cors',
        }
      );
    } catch (error) {
      console.error("Failed to clone repo", error);
      return;
    }
    // parse code

    // insert embeddings to pinecone

    setRepoCloned(true);
    setRepoUrl("");
  };

  return (
    <>
      {!repoCloned && messages.length === 0 ? (
        <div className="flex items-center justify-center h-screen">
          <form
            onSubmit={handleNewChatSubmit}
            className="mb-4 flex flex-col items-center"
          >
            <input
              type="text"
              value={repoUrl}
              onChange={(e) => setRepoUrl(e.target.value)}
              placeholder="paste your GitHub url here."
              className="border rounded p-4 w-64"
              required
            />
            <button
              type="submit"
              className="mt-4 p-4 bg-blue-500 text-white rounded w-64"
            >
              Clone Repo
            </button>
          </form>
        </div>
      ) : (
        <div className="flex flex-col min-w-0 h-dvh bg-background">
          <ChatHeader selectedModelId={selectedModelId} />
          <div
            ref={messagesContainerRef}
            className="flex flex-col min-w-0 gap-6 flex-1 overflow-y-scroll pt-4"
          >
            {messages.length === 0 && <Overview />}

            {messages.map((message, index) => (
              <PreviewMessage
                key={message.id}
                chatId={id}
                message={message}
                block={block}
                setBlock={setBlock}
                isLoading={isLoading && messages.length - 1 === index}
                vote={
                  votes
                    ? votes.find((vote) => vote.messageId === message.id)
                    : undefined
                }
              />
            ))}

            {isLoading &&
              messages.length > 0 &&
              messages[messages.length - 1].role === "user" && (
                <ThinkingMessage />
              )}

            <div
              ref={messagesEndRef}
              className="shrink-0 min-w-[24px] min-h-[24px]"
            />
          </div>
          <form className="flex mx-auto px-4 bg-background pb-4 md:pb-6 gap-2 w-full md:max-w-3xl">
            <MultimodalInput
              chatId={id}
              input={input}
              setInput={setInput}
              handleSubmit={handleSubmit}
              isLoading={isLoading}
              stop={stop}
              attachments={attachments}
              setAttachments={setAttachments}
              messages={messages}
              setMessages={setMessages}
              append={append}
              disabled={!repoCloned}
            />
          </form>
        </div>
      )}

      <AnimatePresence>
        {block?.isVisible && (
          <Block
            chatId={id}
            input={input}
            setInput={setInput}
            handleSubmit={handleSubmit}
            isLoading={isLoading}
            stop={stop}
            attachments={attachments}
            setAttachments={setAttachments}
            append={append}
            block={block}
            setBlock={setBlock}
            messages={messages}
            setMessages={setMessages}
            votes={votes}
          />
        )}
      </AnimatePresence>

      <BlockStreamHandler streamingData={streamingData} setBlock={setBlock} />
    </>
  );
}
