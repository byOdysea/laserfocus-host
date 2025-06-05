import { Slot } from "@/components/ui/slot";
import { Component, SlotType } from "@/lib/types";
import type { BaseMessage } from "@langchain/core/messages";
import { HumanMessage } from "@langchain/core/messages";
import { useStream } from "@langchain/langgraph-sdk/react";
import { Suspense } from "react";
import "./App.css";
import { AthenaWidget } from "./components/athena/AthenaWidget";
import { CanvasInput } from "./components/CanvasInput";
import { getComponent } from "./components/registry";

const slotOrder: SlotType[] = ['sidebar', 'primary'];

// Define our state type to match the backend EngineState
type AppState = {
  messages: Array<{ role: string; content: string } | BaseMessage>;
  canvas: {
    components: Component[];
  };
};

function App() {
  // Use LangGraph useStream hook for proper integration
  const thread = useStream<AppState>({
    apiUrl: "http://localhost:2024", // Backend URL where LangGraph server is running
    assistantId: "laserfocus_engine", // This should match your backend graph/assistant ID
    messagesKey: "messages",
    // Handle stream events
    onError: (error: unknown) => {
      console.error("LangGraph stream error:", error);
    },
    onFinish: () => {
      console.log("LangGraph stream finished");
    },
  });

  // Handle command submission from CanvasInput
  const handleCommand = (command: string) => {
    console.log("Submitting command:", command);
    
    // Submit message to LangGraph with optimistic updates
    thread.submit(
      { messages: [{ role: "user", content: command }] },
      {
        // Optimistically show user message immediately
        optimisticValues: (prev: AppState | undefined) => {
          const prevMessages = prev?.messages ?? [];
          const newMessage = new HumanMessage(command);
          return {
            ...prev,
            messages: [...prevMessages, newMessage],
          };
        },
      }
    );
  };

  // Get the latest canvas data from the thread values
  const canvas = thread.values?.canvas || { components: [] };
  
  // Show loading state
  const isLoading = thread.isLoading;

  return (
    <main className="flex h-dvh bg-sky-200">
      {slotOrder.map(slot => (
        <Slot key={slot} name={slot}>
          {slot === 'sidebar' ? (
            <>
              {(canvas.components as Component[])
                .filter(c => c.slot === slot)
                .map(c => {
                  const Comp = getComponent(c.type);
                  if (!Comp) return null;
                  return (
                    <div key={c.id} className="w-full h-48 bg-white rounded-lg overflow-clip">
                      <Suspense fallback={<div>Loading…</div>}>
                        <Comp {...c.props} viewMode={slot === 'sidebar' ? 'widget' : 'full'} />
                      </Suspense>
                    </div>
                  );
                })}
              {isLoading && (
                <div className="w-full h-12 bg-white/50 rounded-lg flex items-center justify-center">
                  <div className="text-sm text-gray-500">Processing...</div>
                </div>
              )}
            </>
          ) : slot === 'primary' ? (
            // Dynamic primary content with main-window and input structure
            <>
              {(canvas.components as Component[])
                .filter(c => c.slot === slot)
                .map(c => {
                  const Comp = getComponent(c.type);
                  if (!Comp) return null;
                  return (
                    <div key={c.id} className="main-window w-full flex-1 flex flex-col bg-white rounded-lg overflow-clip">
                      <div className="w-full h-6 text-center">
                        <span className="text-xs font-thin text-stone-500">{c.props?.title ?? c.type ?? "Main Window"}</span>
                      </div>
                      <div className="w-full flex-1">
                        <Suspense fallback={<div>Loading…</div>}>
                          <Comp {...c.props} viewMode="full" />
                        </Suspense>
                      </div>
                    </div>
                  );
                })}
              <CanvasInput onCommand={handleCommand} isLoading={isLoading} />
            </>
          ) : (
            // Default dynamic content for other slots
            (canvas.components as Component[])
              .filter(c => c.slot === slot)
              .map(c => {
                const Comp = getComponent(c.type);
                if (!Comp) return null;
                return (
                  <Suspense fallback={<div>Loading…</div>} key={c.id}>
                    <Comp {...c.props} isWidget={slot === 'sidebar'} />
                  </Suspense>
                );
              })
          )}
        </Slot>
      ))}
      <div className="sidebar-2 w-1/4 p-2 flex flex-col gap-2">
        <AthenaWidget messages={thread.messages || []} isLoading={isLoading} />
        {/* Debug info */}
        {process.env.NODE_ENV === 'development' && (
          <div className="w-full bg-white rounded-lg text-xs">
            <div>Messages: {thread.messages?.length || 0}</div>
            <div>Components: {canvas.components.length}</div>
            <div>Loading: {isLoading ? 'Yes' : 'No'}</div>
            {!!thread.error && (
              <div className="text-red-500">
                Error: {String(thread.error instanceof Error ? thread.error.message : thread.error)}
              </div>
            )}
          </div>
        )}
      </div>
      <div className="overlay hidden fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[80%] h-[90%] bg-white rounded-lg shadow-lg">
        typical Chat UI
      </div>
    </main>
  );
}

export default App;
