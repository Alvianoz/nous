"use client";

import { useEffect, useState, useRef } from "react";
import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import { collection, query, orderBy, onSnapshot, addDoc, updateDoc, doc, serverTimestamp, getDocs, deleteDoc } from "firebase/firestore";
import { db } from "@/utils/firebase";
import { GoogleGenerativeAI } from "@google/generative-ai";
import ReactMarkdown from "react-markdown";
import gsap from "gsap";
import { LogOut, MessageSquare, Send, Plus, Menu, X, Loader2, User as UserIcon, Trash2 } from "lucide-react";

const genAI = new GoogleGenerativeAI(process.env.NEXT_PUBLIC_GEMINI_API_KEY || process.env.GEMINI_API_KEY || "");

export default function ChatPage() {
  const { user, loading, logout } = useAuth();
  const router = useRouter();

  const [chats, setChats] = useState<any[]>([]);
  const [currentChatId, setCurrentChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [input, setInput] = useState("");
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const mainRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!loading && !user) {
      router.push("/login");
    }
  }, [user, loading, router]);

  // Load user's chat sessions
  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, `users/${user.uid}/chats`), orderBy("updatedAt", "desc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const chatData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setChats(chatData);
      if (chatData.length > 0 && !currentChatId) {
        setCurrentChatId(chatData[0].id);
      }
    });
    return () => unsubscribe();
  }, [user, currentChatId]);

  // Load messages for the current chat
  useEffect(() => {
    if (!user || !currentChatId) {
      setMessages([]);
      return;
    }
    const q = query(collection(db, `users/${user.uid}/chats/${currentChatId}/messages`), orderBy("createdAt", "asc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setMessages(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    return () => unsubscribe();
  }, [user, currentChatId]);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    
    // Animate new messages
    if (messages.length > 0) {
      const lastMsg = document.querySelector(`.msg-${messages[messages.length - 1].id}`);
      if (lastMsg) {
        gsap.fromTo(lastMsg, 
          { opacity: 0, y: 20, scale: 0.95 },
          { opacity: 1, y: 0, scale: 1, duration: 0.4, ease: "power2.out" }
        );
      }
    }
  }, [messages]);

  const toggleSidebar = () => {
    if (isSidebarOpen) {
      gsap.to(sidebarRef.current, { x: "-100%", duration: 0.3, ease: "power2.inOut" });
      gsap.to(mainRef.current, { opacity: 1, pointerEvents: "auto", duration: 0.3 });
    } else {
      gsap.to(sidebarRef.current, { x: 0, duration: 0.3, ease: "power2.inOut" });
      gsap.to(mainRef.current, { opacity: 0.5, pointerEvents: "none", duration: 0.3 });
    }
    setIsSidebarOpen(!isSidebarOpen);
  };

  const createNewChat = async () => {
    if (!user) return;
    const newChatRef = await addDoc(collection(db, `users/${user.uid}/chats`), {
      title: "New Chat",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    setCurrentChatId(newChatRef.id);
    if (window.innerWidth < 768 && isSidebarOpen) toggleSidebar();
  };

  const handleDeleteChat = async (e: React.MouseEvent, chatId: string) => {
    e.stopPropagation();
    if (!user || !confirm("Are you sure you want to delete this conversation?")) return;
    
    try {
      await deleteDoc(doc(db, `users/${user.uid}/chats/${chatId}`));
      if (currentChatId === chatId) {
        setCurrentChatId(null);
        setMessages([]);
      }
    } catch (error) {
      console.error("Failed to delete chat", error);
    }
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || !user || isGenerating) return;

    const userMessage = input.trim();
    setInput("");
    setIsGenerating(true);

    let chatId = currentChatId;

    try {
      // If no active chat, create one
      if (!chatId) {
        const newChatRef = await addDoc(collection(db, `users/${user.uid}/chats`), {
          title: userMessage.substring(0, 30) + (userMessage.length > 30 ? "..." : ""),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        chatId = newChatRef.id;
        setCurrentChatId(chatId);
      } else if (messages.length === 0) {
         await updateDoc(doc(db, `users/${user.uid}/chats/${chatId}`), {
           title: userMessage.substring(0, 30) + (userMessage.length > 30 ? "..." : ""),
           updatedAt: serverTimestamp(),
         });
      }

      // Add user message to Firestore
      await addDoc(collection(db, `users/${user.uid}/chats/${chatId}/messages`), {
        text: userMessage,
        role: "user",
        createdAt: serverTimestamp(),
      });

      // Update chat updatedAt
      await updateDoc(doc(db, `users/${user.uid}/chats/${chatId}`), {
        updatedAt: serverTimestamp(),
      });

      // Call Gemini API
      const model = genAI.getGenerativeModel({ model: "gemini-flash-latest" });
      
      // Build history
      const history = messages.map(m => ({
        role: m.role === "user" ? "user" : "model",
        parts: [{ text: m.text }]
      }));

      const chat = model.startChat({ history });
      const result = await chat.sendMessage(userMessage);
      const responseText = result.response.text();

      // Add AI response to Firestore
      await addDoc(collection(db, `users/${user.uid}/chats/${chatId}/messages`), {
        text: responseText,
        role: "ai",
        createdAt: serverTimestamp(),
      });

      await updateDoc(doc(db, `users/${user.uid}/chats/${chatId}`), {
        updatedAt: serverTimestamp(),
      });

    } catch (error) {
      console.error("Failed to send message:", error);
      // Fallback message for error
      if (chatId) {
         await addDoc(collection(db, `users/${user.uid}/chats/${chatId}/messages`), {
          text: "Sorry, I encountered an error. Please try again.",
          role: "ai",
          createdAt: serverTimestamp(),
        });
      }
    } finally {
      setIsGenerating(false);
    }
  };

  if (loading || !user) {
    return (
      <div className="min-h-screen bg-neutral-950 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-neutral-950 text-neutral-100 overflow-hidden font-sans">
      
      {/* Sidebar */}
      <aside 
        ref={sidebarRef}
        className="fixed inset-y-0 left-0 z-50 w-72 bg-neutral-900/80 backdrop-blur-xl border-r border-neutral-800 flex flex-col transform -translate-x-full md:relative md:translate-x-0 transition-transform duration-300 ease-in-out"
      >
        <div className="p-4 flex items-center justify-between border-b border-neutral-800">
          <h1 className="text-xl font-bold bg-gradient-to-r from-blue-400 to-emerald-400 bg-clip-text text-transparent">Nous AI</h1>
          <button onClick={toggleSidebar} className="md:hidden text-neutral-400 hover:text-white">
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="p-4">
          <button 
            onClick={createNewChat}
            className="w-full flex items-center justify-center gap-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl py-3 px-4 transition-all hover:scale-[1.02] active:scale-95"
          >
            <Plus className="w-5 h-5" />
            <span className="font-medium">New Chat</span>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-2 space-y-1 scrollbar-hide">
          {chats.map(chat => (
            <div key={chat.id} className="relative group">
              <button
                onClick={() => {
                  setCurrentChatId(chat.id);
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
          <button 
            onClick={() => router.push("/profile")}
            className="w-full flex items-center gap-3 px-3 py-2 text-neutral-400 hover:text-white transition-colors rounded-lg hover:bg-white/5"
          >
            <UserIcon className="w-5 h-5" />
            <span className="font-medium text-sm">Profile</span>
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

      {/* Main Chat Area */}
      <main ref={mainRef} className="flex-1 flex flex-col h-full relative">
        {/* Mobile Header */}
        <header className="md:hidden flex items-center justify-between p-4 border-b border-neutral-800 bg-neutral-900/50 backdrop-blur-md sticky top-0 z-40">
          <button onClick={toggleSidebar} className="text-neutral-400 hover:text-white">
            <Menu className="w-6 h-6" />
          </button>
          <h1 className="text-lg font-bold">Nous AI</h1>
          <div className="w-6" /> {/* Spacer */}
        </header>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 md:p-8 space-y-6 scroll-smooth">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center max-w-md mx-auto opacity-50">
              <div className="w-20 h-20 bg-gradient-to-tr from-blue-500 to-emerald-500 rounded-full blur-xl absolute opacity-20 pointer-events-none" />
              <MessageSquare className="w-12 h-12 mb-4 text-neutral-500" />
              <h2 className="text-2xl font-bold mb-2">How can I help you today?</h2>
              <p className="text-neutral-400 text-sm">Send a message to start conversing with Gemini 1.5 Flash.</p>
            </div>
          ) : (
            <div className="max-w-3xl mx-auto space-y-8 pb-20">
              {messages.map((msg) => (
                <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} msg-${msg.id}`}>
                  <div 
                    className={`max-w-[85%] md:max-w-[75%] rounded-2xl px-5 py-4 ${
                      msg.role === 'user' 
                        ? 'bg-blue-600 text-white rounded-br-sm' 
                        : 'bg-neutral-800/50 border border-neutral-700/50 backdrop-blur-sm text-neutral-200 rounded-bl-sm shadow-xl'
                    }`}
                  >
                    {msg.role === 'ai' ? (
                      <div className="prose prose-invert max-w-none prose-p:leading-relaxed prose-pre:bg-neutral-900 prose-pre:border prose-pre:border-neutral-800 text-sm md:text-base">
                        <ReactMarkdown>{msg.text}</ReactMarkdown>
                      </div>
                    ) : (
                      <p className="text-sm md:text-base whitespace-pre-wrap">{msg.text}</p>
                    )}
                  </div>
                </div>
              ))}
              
              {isGenerating && (
                <div className="flex justify-start">
                  <div className="max-w-[85%] rounded-2xl px-5 py-4 bg-neutral-800/50 border border-neutral-700/50 backdrop-blur-sm rounded-bl-sm">
                    <div className="flex space-x-2 items-center h-6">
                      <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                      <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                      <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                    </div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Input Area */}
        <div className="p-4 md:p-6 bg-gradient-to-t from-neutral-950 via-neutral-950 to-transparent sticky bottom-0 z-40">
          <div className="max-w-3xl mx-auto relative">
            <form 
              onSubmit={handleSend}
              className="relative flex items-end bg-neutral-900 border border-neutral-700 rounded-2xl shadow-2xl focus-within:border-blue-500/50 focus-within:ring-1 focus-within:ring-blue-500/50 transition-all overflow-hidden"
            >
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSend(e);
                  }
                }}
                placeholder="Message Gemini..."
                className="w-full max-h-32 bg-transparent text-white px-4 py-4 focus:outline-none resize-none scrollbar-hide min-h-[56px] text-sm md:text-base"
                rows={1}
                style={{ height: 'auto' }}
                onInput={(e) => {
                  const target = e.target as HTMLTextAreaElement;
                  target.style.height = 'auto';
                  target.style.height = target.scrollHeight + 'px';
                }}
              />
              <div className="p-2 shrink-0">
                <button
                  type="submit"
                  disabled={!input.trim() || isGenerating}
                  className="p-2 rounded-xl bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-50 disabled:hover:bg-blue-600 transition-colors flex items-center justify-center"
                >
                  <Send className="w-5 h-5" />
                </button>
              </div>
            </form>
            <p className="text-center text-xs text-neutral-500 mt-3">
              Gemini can make mistakes. Consider verifying important information.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
