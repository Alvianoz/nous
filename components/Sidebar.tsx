"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { collection, query, orderBy, onSnapshot, deleteDoc, doc } from "firebase/firestore";
import { db } from "@/utils/firebase";
import { MessageSquare, Plus, X, Trash2, Folder, Settings, LogOut, ArrowLeft } from "lucide-react";

interface SidebarProps {
  sidebarRef: React.RefObject<HTMLElement>;
  isSidebarOpen: boolean;
  toggleSidebar: () => void;
  currentChatId?: string | null;
  setCurrentChatId?: (id: string | null) => void;
  projectId?: string;
  isDashboard?: boolean;
}

export default function Sidebar({
  sidebarRef,
  isSidebarOpen,
  toggleSidebar,
  currentChatId,
  setCurrentChatId,
  projectId,
  isDashboard = false
}: SidebarProps) {
  const { user, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [chats, setChats] = useState<any[]>([]);

  const isProjectsPage = pathname.startsWith('/projects');

  useEffect(() => {
    if (!user || isDashboard) return;

    let path = `users/${user.uid}/chats`;
    if (projectId) {
      path = `users/${user.uid}/projects/${projectId}/chats`;
    }

    const q = query(collection(db, path), orderBy("updatedAt", "desc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const chatData = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      setChats(chatData);
      
      // Auto-select first chat if none is selected and we are managing chats
      if (chatData.length > 0 && !currentChatId && setCurrentChatId) {
        setCurrentChatId(chatData[0].id);
      }
    });
    return () => unsubscribe();
  }, [user, projectId, isDashboard]);

  const handleDeleteChat = async (e: React.MouseEvent, chatId: string) => {
    e.stopPropagation();
    if (!user || !confirm("Are you sure you want to delete this conversation?")) return;
    
    try {
      let path = `users/${user.uid}/chats/${chatId}`;
      if (projectId) {
        path = `users/${user.uid}/projects/${projectId}/chats/${chatId}`;
      }
      await deleteDoc(doc(db, path));
      if (currentChatId === chatId && setCurrentChatId) {
        setCurrentChatId(null);
      }
    } catch (error) {
      console.error("Failed to delete chat", error);
    }
  };

  const handleCreateNewChat = () => {
    if (setCurrentChatId) {
      setCurrentChatId("new");
    } else {
      router.push("/");
    }
    if (window.innerWidth < 768 && isSidebarOpen) toggleSidebar();
  };

  return (
    <aside 
      ref={sidebarRef}
      className="fixed inset-y-0 left-0 z-50 w-72 bg-neutral-900/80 backdrop-blur-xl border-r border-neutral-800 flex flex-col transform -translate-x-full md:relative md:translate-x-0 transition-transform duration-300 ease-in-out"
    >
      <div className="p-4 flex items-center justify-between border-b border-neutral-800">
        <div className="flex items-center gap-2">
          {projectId && (
            <button 
              onClick={() => router.push("/projects")}
              className="p-1.5 text-neutral-400 hover:text-white bg-white/5 rounded-lg transition-colors hidden md:block mr-1"
              title="Back to Projects"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
          )}
          <h1 className="text-xl font-bold bg-gradient-to-r from-blue-400 to-emerald-400 bg-clip-text text-transparent">
            {projectId ? "Workspace" : "Nous AI"}
          </h1>
        </div>
        <button onClick={toggleSidebar} className="md:hidden text-neutral-400 hover:text-white">
          <X className="w-6 h-6" />
        </button>
      </div>

      {!isDashboard && (
        <div className="p-4">
          <button 
            onClick={handleCreateNewChat}
            className="w-full flex items-center justify-center gap-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl py-3 px-4 transition-all hover:scale-[1.02] active:scale-95"
          >
            <Plus className="w-5 h-5" />
            <span className="font-medium">New Chat</span>
          </button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-1 scrollbar-hide">
        {!isDashboard && currentChatId === "new" && (
          <div className="relative group">
            <button
              className="w-full text-left flex items-center gap-3 px-3 py-3 rounded-lg transition-colors bg-blue-500/10 text-blue-400"
            >
              <MessageSquare className="w-5 h-5 shrink-0" />
              <span className="truncate text-sm font-medium pr-6">New Chat</span>
            </button>
          </div>
        )}
        {!isDashboard && chats.map(chat => (
          <div key={chat.id} className="relative group">
            <button
              onClick={() => {
                if (setCurrentChatId) setCurrentChatId(chat.id);
                if (window.innerWidth < 768) toggleSidebar();
              }}
              className={`w-full text-left flex items-center gap-3 px-3 py-3 rounded-lg transition-colors ${currentChatId === chat.id ? 'bg-blue-500/10 text-blue-400' : 'hover:bg-white/5 text-neutral-400 hover:text-neutral-200'}`}
            >
              <MessageSquare className="w-5 h-5 shrink-0" />
              <span className="truncate text-sm font-medium pr-6">{chat.title || "New Chat"}</span>
            </button>
            <button
              onClick={(e) => handleDeleteChat(e, chat.id)}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-neutral-500 hover:text-red-400 md:opacity-0 md:group-hover:opacity-100 transition-all rounded-md hover:bg-red-500/10 opacity-100"
              title="Delete Chat"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>

      <div className="p-4 border-t border-neutral-800 space-y-1">
        {isProjectsPage && (
          <button 
            onClick={() => router.push("/")}
            className="w-full flex items-center gap-3 px-3 py-2 text-neutral-400 hover:text-white transition-colors rounded-lg hover:bg-white/5"
          >
            <MessageSquare className="w-5 h-5" />
            <span className="font-medium text-sm">Global Chat</span>
          </button>
        )}
        <button 
          onClick={() => router.push("/projects")}
          className="w-full flex items-center gap-3 px-3 py-2 text-neutral-400 hover:text-white transition-colors rounded-lg hover:bg-white/5"
        >
          <Folder className="w-5 h-5" />
          <span className="font-medium text-sm">Projects</span>
        </button>
        <button 
          onClick={() => router.push("/profile")}
          className="w-full flex items-center gap-3 px-3 py-2 text-neutral-400 hover:text-white transition-colors rounded-lg hover:bg-white/5"
        >
          <Settings className="w-5 h-5" />
          <span className="font-medium text-sm">Settings</span>
        </button>
        <button 
          onClick={logout}
          className="w-full flex items-center gap-3 px-3 py-2 text-neutral-400 hover:text-red-400 transition-colors rounded-lg hover:bg-red-500/10"
        >
          <LogOut className="w-5 h-5" />
          <span className="font-medium text-sm">Log out</span>
        </button>
      </div>
    </aside>
  );
}
