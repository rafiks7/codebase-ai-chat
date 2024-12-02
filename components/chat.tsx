"use client";

import type { Attachment, ChatRequestOptions, Message } from "ai";
import { useChat } from "ai/react";
import { AnimatePresence } from "framer-motion";
import { useEffect, useState } from "react";
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
import { getChatById } from "@/lib/db/queries";

export function Chat({
  id,
  initialMessages,
  selectedModelId,
  repoUrl,
}: {
  id: string;
  initialMessages: Array<Message>;
  selectedModelId: string;
  repoUrl: string | undefined;
}) {
  const { mutate } = useSWRConfig();

  const [inputRepo, setInputRepo] = useState(repoUrl);

  const [rag, setRag] = useState(false); // State for rag value

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
    body: { id, modelId: selectedModelId, repoUrl: inputRepo, rag: rag },
    initialMessages,
    onFinish: () => {
      mutate("/api/history");
    },
  });

  const [inProgress, setInProgress] = useState(false);

  // Function to handle rag value from child
  const handleRagChange = (ragValue: boolean) => {
    setRag(ragValue);
  };

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

  const handleCloneRepo = async (event: React.FormEvent) => {
    event.preventDefault();
    setInProgress(true);
    console.log("cloning repo...");

    console.log("Repo URL:", inputRepo);

    // call clone repo function
    try {
      const response = await fetch(
        `${window.location.origin}/api/embed-repo?repo_url=${inputRepo}`,
        {
          method: "GET",
          mode: "no-cors",
        }
      );
    } catch (error) {
      console.error("Failed to clone repo", error);
      return;
    }

    setRepoCloned(true);
    setInProgress(false);
  };

  useEffect(() => {
    console.log("inProgress:", inProgress);
  }, [inProgress]);

  return (
    <>
      {!repoCloned && messages.length === 0 ? (
        <div className="flex items-center justify-center h-screen relative">
          {/* Show the loading spinner when inProgress is true */}
          {inProgress ? (
            <div className="absolute flex flex-col justify-center items-center h-screen w-full">
              <p className="mb-4 text-lg text-blue-500">
                This might take a minute...
              </p>
              <div className="border-t-4 border-blue-500 border-solid w-16 h-16 rounded-full animate-spin"></div>
            </div>
          ) : (
            <div className="flex flex-col items-center">
              {/* Add the text message at the top */}
              <p className="mb-10 text-center text-gray-500 text-sm italic">
                Currently optimized for JavaScript/TypeScript, <br></br>but still capable
                of supporting other languages.
              </p>

              <form
                onSubmit={handleCloneRepo}
                className="mb-4 flex flex-col items-center"
              >
                <input
                  type="text"
                  defaultValue={inputRepo}
                  onChange={(e) => setInputRepo(e.target.value)}
                  placeholder="Paste your GitHub URL here."
                  className="border rounded p-4 w-64"
                  required
                />
                <button
                  type="submit"
                  className="mt-4 p-4 bg-blue-500 text-white rounded w-64"
                  disabled={inProgress} // Disable button during loading
                >
                  Clone Repo
                </button>
              </form>
            </div>
          )}
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
              disabled={!repoCloned && messages.length === 0}
              onRagChange={handleRagChange}
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
