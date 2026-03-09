import dynamic from "next/dynamic";

// Disable SSR for the main app (uses browser APIs)
const StudyBuddyApp = dynamic(() => import("../StudyBuddyApp"), { ssr: false });

export default function Home() {
  return <StudyBuddyApp />;
}
