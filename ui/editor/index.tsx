"use client";

import { useEffect, useRef, useState } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import { TiptapEditorProps } from "./props";
import { TiptapExtensions } from "./extensions";
import useLocalStorage from "@/lib/hooks/use-local-storage";
import { useDebouncedCallback } from "use-debounce";
import { useCompletion } from "ai/react";
import { toast } from "sonner";
import va from "@vercel/analytics";
import DEFAULT_EDITOR_CONTENT from "./default-content";
import clipboardCopy from "clipboard-copy";

import { EditorBubbleMenu } from "./components";

export default function Editor() {
  const [content, setContent] = useLocalStorage(
    "content",
    DEFAULT_EDITOR_CONTENT,
  );
  const [saveStatus, setSaveStatus] = useState("Saved");

  const [hydrated, setHydrated] = useState(false);

  const debouncedUpdates = useDebouncedCallback(async ({ editor }) => {
    const json = editor.getJSON();
    setSaveStatus("Saving...");
    setContent(json);
    // Simulate a delay in saving.
    setTimeout(() => {
      setSaveStatus("Saved");
    }, 500);
  }, 750);

  const editor = useEditor({
    extensions: TiptapExtensions,
    editorProps: TiptapEditorProps,
    onUpdate: (e) => {
      setSaveStatus("Unsaved");
      const selection = e.editor.state.selection;
      const lastTwo = e.editor.state.doc.textBetween(
        selection.from - 2,
        selection.from,
        "\n",
      );
      if (lastTwo === "++" && !isLoading) {
        e.editor.commands.deleteRange({
          from: selection.from - 2,
          to: selection.from,
        });
        e.editor.commands.insertContent("🤖...");
        complete(e.editor.getText());
        va.track("Autocomplete Shortcut Used");
      } else {
        debouncedUpdates(e);
      }
    },
    autofocus: "end",
  });

  const [copySuccess, setCopySuccess] = useState("");

  const textToCopy = editor ? editor.getHTML() : "";

  const handleCopyClick = async () => {
    try {
      await clipboardCopy(textToCopy);
      setCopySuccess("Copied!");
    } catch (err) {
      setCopySuccess("Failed to copy text");
    }
  };

  const { complete, completion, isLoading, stop } = useCompletion({
    id: "novel",
    api: "/api/generate",
    onResponse: (response) => {
      if (response.status === 429) {
        toast.error("You have reached your request limit for the day.");
        va.track("Rate Limit Reached");
        return;
      }
    },
    onFinish: (_prompt, completion) => {
      editor?.commands.setTextSelection({
        from: editor.state.selection.from - completion.length,
        to: editor.state.selection.from,
      });
    },
    onError: () => {
      toast.error("Something went wrong.");
    },
  });

  const prev = useRef("");

  // Insert chunks of the generated text
  useEffect(() => {
    // remove 🤖... and insert the generated text
    if (
      completion.length > 0 &&
      editor?.state.doc.textBetween(
        editor.state.selection.from - 5,
        editor.state.selection.from,
        "\n",
      ) === "🤖..."
    ) {
      editor?.commands.deleteRange({
        from: editor.state.selection.from - 5,
        to: editor.state.selection.from,
      });
    }
    const diff = completion.slice(prev.current.length);
    prev.current = completion;
    editor?.commands.insertContent(diff, {
      parseOptions: {
        preserveWhitespace: "full",
      },
    });
  }, [isLoading, editor, completion]);

  useEffect(() => {
    // if user presses escape or cmd + z and it's loading,
    // stop the request, delete the completion, and insert back the "++"
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" || (e.metaKey && e.key === "z")) {
        stop();
        if (e.key === "Escape") {
          editor?.commands.deleteRange({
            from: editor.state.selection.from - completion.length,
            to: editor.state.selection.from,
          });
        }
        editor?.commands.insertContent("++");
      }
    };
    if (isLoading) {
      document.addEventListener("keydown", onKeyDown);
    }
    return () => {
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [stop, isLoading, editor, completion.length]);

  // Hydrate the editor with the content from localStorage.
  useEffect(() => {
    if (editor && content && !hydrated) {
      editor.commands.setContent(content);
      setHydrated(true);
    }
  }, [editor, content, hydrated]);
  return (
    <>
      <div
        onClick={() => {
          editor?.chain().run();
        }}
        className="editor relative flex w-[90%] min-w-[60%] flex-col gap-4 rounded-2xl border border-[#363636] bg-[#282828] p-4 sm:max-w-[60%]"
      >
        <div className="flexf gap-4f">
          <input
            className="w-full rounded-2xl bg-[#1e1e1e] p-4 placeholder:text-[#ffffffcf]"
            type="text"
            placeholder="from"
          />
          <input
            className="w-full rounded-2xl bg-[#1e1e1e] p-4 placeholder:text-[#ffffffcf]"
            type="text"
            placeholder="to"
          />
        </div>

        {editor ? (
          <>
            <EditorContent editor={editor} />
            <EditorBubbleMenu editor={editor} />
          </>
        ) : (
          <></>
        )}
        <button
          onClick={handleCopyClick}
          className="w-full rounded-2xl bg-[#000] p-4 font-bold"
        >
          Send
        </button>
      </div>
    </>
  );
}
