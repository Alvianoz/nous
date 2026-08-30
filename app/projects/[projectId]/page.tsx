"use client";

import { useEffect, useState, useRef } from "react";
import { useAuth } from "@/context/AuthContext";
import { useParams, useRouter } from "next/navigation";
import { collection, query, orderBy, onSnapshot, addDoc, updateDoc, doc, serverTimestamp, getDocs, deleteDoc, getDoc, limit } from "firebase/firestore";
import { db } from "@/utils/firebase";
import { GoogleGenerativeAI } from "@google/generative-ai";
import ReactMarkdown from "react-markdown";
import gsap from "gsap";
import { LogOut, MessageSquare, Send, Plus, Menu, X, Loader2, User as UserIcon, Trash2, Settings, AlertCircle, Copy, Edit2, Check, Folder, ArrowLeft } from "lucide-react";
import Sidebar from "@/components/Sidebar";

const genAI = new GoogleGenerativeAI(process.env.NEXT_PUBLIC_GEMINI_API_KEY || process.env.GEMINI_API_KEY || "");

export default function ProjectChatPage() {
  const { user, loading, logout } = useAuth();
  const router = useRouter();
  const params = useParams();
  const projectId = params.projectId as string;

  const [chats, setChats] = useState<any[]>([]);
  const [currentChatId, setCurrentChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [input, setInput] = useState("");
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [showApiKeyModal, setShowApiKeyModal] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleCopy = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleEdit = (text: string) => {
    setInput(text);
  };

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const mainRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!loading && !user) {
      router.push("/login");
    }
  }, [user, loading, router]);

  // Load messages for the current chat
  useEffect(() => {
    if (!user || !currentChatId || currentChatId === "new" || !projectId) {
      setMessages([]);
      return;
    }
    const q = query(collection(db, `users/${user.uid}/projects/${projectId}/chats/${currentChatId}/messages`), orderBy("createdAt", "asc"));
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

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || !user || isGenerating) return;

    const userMessage = input.trim();
    setInput("");
    setIsGenerating(true);

    try {
      // Check API Key
      const docRef = doc(db, "users", user.uid);
      const docSnap = await getDoc(docRef);
      const apiKey = docSnap.exists() ? docSnap.data().geminiApiKey : null;
      
      if (!apiKey) {
        setShowApiKeyModal(true);
        setIsGenerating(false);
        setInput(userMessage); // restore input
        return;
      }

      let chatId = currentChatId;
      // If no active chat, create one
      if (!chatId || chatId === "new") {
        const newChatRef = await addDoc(collection(db, `users/${user.uid}/projects/${projectId}/chats`), {
          title: userMessage.substring(0, 30) + (userMessage.length > 30 ? "..." : ""),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        chatId = newChatRef.id;
        setCurrentChatId(chatId);
      } else if (messages.length === 0) {
         await updateDoc(doc(db, `users/${user.uid}/projects/${projectId}/chats/${chatId}`), {
           title: userMessage.substring(0, 30) + (userMessage.length > 30 ? "..." : ""),
           updatedAt: serverTimestamp(),
         });
      }

      // Add user message to Firestore
      await addDoc(collection(db, `users/${user.uid}/projects/${projectId}/chats/${chatId}/messages`), {
        text: userMessage,
        role: "user",
        createdAt: serverTimestamp(),
      });

      // Update chat updatedAt
      await updateDoc(doc(db, `users/${user.uid}/projects/${projectId}/chats/${chatId}`), {
        updatedAt: serverTimestamp(),
      });

      // Gather cross-chat context for the project
      let contextBlocks = [];
      try {
        for (const chat of chats) {
          if (chat.id === chatId) continue;
          const msgsQ = query(collection(db, `users/${user.uid}/projects/${projectId}/chats/${chat.id}/messages`), orderBy("createdAt", "desc"), limit(5));
          const msgsSnap = await getDocs(msgsQ);
          if (!msgsSnap.empty) {
            const msgs = msgsSnap.docs.map(d => d.data()).reverse();
            contextBlocks.push(`Chat Topic: ${chat.title}\n` + msgs.map(m => `${m.role === 'user' ? 'User' : 'AI'}: ${m.text}`).join("\n"));
          }
        }
      } catch (e) {
        console.error("Failed to gather project context", e);
      }
      
      const systemContext = contextBlocks.length > 0 
        ? `You are an AI assistant in a unified project workspace. The user might refer to things from other chats in this project. Here is recent context from other chats:\n\n${contextBlocks.join('\n\n---\n\n')}\n\nUse this context if relevant, but answer the user's latest prompt directly.` 
        : `You are a helpful AI assistant.`;

      // Call Gemini API
      const dynamicGenAI = new GoogleGenerativeAI(apiKey);
      const model = dynamicGenAI.getGenerativeModel({ 
        model: "gemini-1.5-flash",
        systemInstruction: systemContext
      });
      
      // Build history
      const history = messages.map(m => ({
        role: m.role === "user" ? "user" : "model",
        parts: [{ text: m.text }]
      }));

      const chat = model.startChat({ history });
      const result = await chat.sendMessage(userMessage);
      const responseText = result.response.text();

      // Track request for rate limit monitoring
      const now = Date.now();
      const usageHistory = JSON.parse(localStorage.getItem('gemini_usage_history') || '[]');
      usageHistory.push(now);
      // Keep only last 24 hours of history
      const twentyFourHoursAgo = now - 24 * 60 * 60 * 1000;
      const filteredHistory = usageHistory.filter((t: number) => t > twentyFourHoursAgo);
      localStorage.setItem('gemini_usage_history', JSON.stringify(filteredHistory));

      // Add AI response to Firestore
      await addDoc(collection(db, `users/${user.uid}/projects/${projectId}/chats/${chatId}/messages`), {
        text: responseText,
        role: "ai",
        createdAt: serverTimestamp(),
      });

      await updateDoc(doc(db, `users/${user.uid}/projects/${projectId}/chats/${chatId}`), {
        updatedAt: serverTimestamp(),
      });

    } catch (error) {
      console.error("Failed to send message:", error);
      // Fallback message for error
      if (chatId) {
         await addDoc(collection(db, `users/${user.uid}/projects/${projectId}/chats/${chatId}/messages`), {
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
      
      <Sidebar 
        sidebarRef={sidebarRef}
        isSidebarOpen={isSidebarOpen}
        toggleSidebar={toggleSidebar}
        currentChatId={currentChatId}
        setCurrentChatId={setCurrentChatId}
        projectId={projectId}
      />

      {/* Main Chat Area */}
      <main ref={mainRef} className="flex-1 flex flex-col h-full relative overflow-y-auto scroll-smooth">
        {/* Mobile Header */}
        <header className="md:hidden flex items-center justify-between p-4 border-b border-neutral-800 bg-neutral-900/50 backdrop-blur-md sticky top-0 z-40">
          <button onClick={toggleSidebar} className="text-neutral-400 hover:text-white">
            <Menu className="w-6 h-6" />
          </button>
          <h1 className="text-lg font-bold">Nous AI</h1>
          <div className="w-6" /> {/* Spacer */}
        </header>

        {/* Messages */}
        <div className="flex-1 p-4 md:p-8 space-y-6">
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
                <div key={msg.id} className={`flex flex-col group ${msg.role === 'user' ? 'items-end' : 'items-start'} msg-${msg.id}`}>
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

                  {/* Action Buttons */}
                  <div className={`flex items-center gap-1 mt-1.5 opacity-0 group-hover:opacity-100 transition-opacity ${msg.role === 'user' ? 'mr-2' : 'ml-2'}`}>
                    <button 
                      onClick={() => handleCopy(msg.id, msg.text)}
                      className="p-1.5 rounded-lg text-neutral-500 hover:text-neutral-200 hover:bg-neutral-800 transition-colors flex items-center gap-1.5 text-xs"
                      title="Copy message"
                    >
                      {copiedId === msg.id ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                    {msg.role === 'user' && (
                      <button 
                        onClick={() => handleEdit(msg.text)}
                        className="p-1.5 rounded-lg text-neutral-500 hover:text-neutral-200 hover:bg-neutral-800 transition-colors flex items-center gap-1.5 text-xs"
                        title="Edit prompt"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
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

      {/* API Key Modal */}
      {showApiKeyModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 md:p-8 shadow-2xl max-w-md w-full animate-in fade-in zoom-in duration-200">
            <div className="flex flex-col items-center text-center space-y-4">
              <div className="w-16 h-16 bg-amber-500/10 rounded-full flex items-center justify-center">
                <AlertCircle className="w-8 h-8 text-amber-500" />
              </div>
              <h2 className="text-2xl font-bold text-white">Missing API Key</h2>
              <p className="text-neutral-400 text-sm">
                You need to set up your Gemini API Key in the settings before you can send a message.
              </p>
              <div className="w-full flex gap-3 mt-4">
                <button 
                  onClick={() => setShowApiKeyModal(false)}
                  className="flex-1 py-3 px-4 rounded-xl font-medium text-neutral-300 bg-neutral-800 hover:bg-neutral-700 transition-colors"
                >
                  Cancel
                </button>
                <button 
                  onClick={() => router.push('/profile')}
                  className="flex-1 py-3 px-4 rounded-xl font-medium text-white bg-blue-600 hover:bg-blue-500 transition-colors"
                >
                  Go to Settings
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
