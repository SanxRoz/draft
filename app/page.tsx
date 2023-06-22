import Editor from "@/ui/editor";

export default function Page() {
  return (
    <>
      <div className="flex min-h-screen flex-col items-center sm:px-5 sm:py-[5rem]">
        <Editor />
      </div>
      <div className="overlay pointer-events-none z-50">
      </div>
    </>
  );
}
