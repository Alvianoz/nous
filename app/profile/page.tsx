"use client";

import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import { updateProfile, updateEmail, updatePassword } from "firebase/auth";
import { ArrowLeft, User, Mail, Lock, Loader2, Key, Activity, Settings as SettingsIcon, Zap, Menu } from "lucide-react";
import gsap from "gsap";
import Sidebar from "@/components/Sidebar";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "@/utils/firebase";

export default function SettingsPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  const [activeTab, setActiveTab] = useState<'profile' | 'api' | 'usage' | 'skills'>('profile');

  // Profile State
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [status, setStatus] = useState<{ type: 'error' | 'success', message: string } | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const sidebarRef = useRef<HTMLElement>(null);
  const mainRef = useRef<HTMLDivElement>(null);

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

  // API Key State
  const [geminiKey, setGeminiKey] = useState("");
  const [openAIKey, setOpenAIKey] = useState("");
  const [apiStatus, setApiStatus] = useState<{ type: 'error' | 'success', message: string } | null>(null);

  // Usage Monitor State
  const [requestsPerMinute, setRequestsPerMinute] = useState(0);
  const [rateLimitStatus, setRateLimitStatus] = useState("Good");

  // Skills State
  const [skills, setSkills] = useState({
    webSearch: true,
    fileSystem: false,
    terminal: false,
    codeExecution: true
  });

  const containerRef = useRef<HTMLDivElement>(null);
  const tabContentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!loading && !user) {
      router.push("/login");
    } else if (user) {
      setDisplayName(user.displayName || "");
      setEmail(user.email || "");
      
      const fetchUserData = async () => {
        try {
          const docRef = doc(db, "users", user.uid);
          const docSnap = await getDoc(docRef);
          if (docSnap.exists()) {
            const data = docSnap.data();
            setGeminiKey(data.geminiApiKey || "");
            setOpenAIKey(data.openaiApiKey || "");
          }
        } catch (error) {
          console.error("Error fetching user data:", error);
        }
      };
      fetchUserData();
      
      const savedSkills = localStorage.getItem('user_skills');
      if (savedSkills) {
        setSkills(JSON.parse(savedSkills));
      }
      
      gsap.fromTo(containerRef.current, 
        { y: 30, opacity: 0 }, 
        { y: 0, opacity: 1, duration: 0.6, ease: "power3.out" }
      );
    }
  }, [user, loading, router]);

  // Handle Tab Switch Animation
  useEffect(() => {
    if (tabContentRef.current) {
      gsap.fromTo(tabContentRef.current,
        { opacity: 0, x: -10 },
        { opacity: 1, x: 0, duration: 0.3, ease: "power2.out" }
      );
    }
  }, [activeTab]);

  // Usage Monitor Logic
  useEffect(() => {
    if (activeTab === 'usage') {
      const calculateUsage = () => {
        const usageHistory = JSON.parse(localStorage.getItem('gemini_usage_history') || '[]');
        const now = Date.now();
        const oneMinuteAgo = now - 60 * 1000;
        const requestsLastMinute = usageHistory.filter((t: number) => t > oneMinuteAgo).length;
        
        setRequestsPerMinute(requestsLastMinute);
        
        // Assuming Gemini 1.5 Flash Free rate limit is 15 RPM
        if (requestsLastMinute >= 15) {
          setRateLimitStatus("Critical");
        } else if (requestsLastMinute >= 10) {
          setRateLimitStatus("Warning");
        } else {
          setRateLimitStatus("Good");
        }
      };
      
      calculateUsage();
      const interval = setInterval(calculateUsage, 2000);
      return () => clearInterval(interval);
    }
  }, [activeTab]);

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    
    setIsSaving(true);
    setStatus(null);

    try {
      const promises = [];
      
      if (displayName !== user.displayName) {
        promises.push(updateProfile(user, { displayName }));
      }
      
      if (email !== user.email) {
        promises.push(updateEmail(user, email));
      }
      
      if (newPassword) {
        promises.push(updatePassword(user, newPassword));
      }
      
      if (promises.length === 0) {
        setStatus({ type: 'success', message: "No changes to save." });
        setIsSaving(false);
        return;
      }

      await Promise.all(promises);
      setStatus({ type: 'success', message: "Profile updated successfully!" });
      setNewPassword(""); 
      
    } catch (error: any) {
      console.error("Failed to update profile", error);
      setStatus({ 
        type: 'error', 
        message: error.message || "Failed to update profile. You may need to log out and log back in to change sensitive information." 
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveApiKeys = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    
    try {
      await setDoc(doc(db, "users", user.uid), {
        geminiApiKey: geminiKey,
        openaiApiKey: openAIKey
      }, { merge: true });
      
      setApiStatus({ type: 'success', message: 'API Keys saved successfully!' });
      setTimeout(() => setApiStatus(null), 3000);
    } catch (error: any) {
      setApiStatus({ type: 'error', message: 'Failed to save API Keys.' });
    }
  };

  const handleToggleSkill = (skill: keyof typeof skills) => {
    const newSkills = { ...skills, [skill]: !skills[skill] };
    setSkills(newSkills);
    localStorage.setItem('user_skills', JSON.stringify(newSkills));
  };

  if (loading || !user) {
    return (
      <div className="min-h-screen bg-neutral-950 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
      </div>
    );
  }

  const tabs = [
    { id: 'profile', label: 'Profile', icon: User },
    { id: 'api', label: 'API Keys', icon: Key },
    { id: 'usage', label: 'Usage Monitor', icon: Activity },
    { id: 'skills', label: 'Skills & MCP', icon: Zap },
  ] as const;

  return (
    <div className="flex h-screen bg-neutral-950 text-neutral-100 overflow-hidden font-sans">
      <Sidebar 
        sidebarRef={sidebarRef as React.RefObject<HTMLElement>}
        isSidebarOpen={isSidebarOpen}
        toggleSidebar={toggleSidebar}
        isDashboard={true}
      />
      <main ref={mainRef} className="flex-1 relative overflow-y-auto flex flex-col">
        {/* Mobile Header */}
        <header className="md:hidden w-full flex items-center justify-between p-4 mb-2">
          <button onClick={toggleSidebar} className="text-neutral-400 hover:text-white">
            <Menu className="w-6 h-6" />
          </button>
          <h1 className="text-xl font-bold bg-gradient-to-r from-blue-400 to-emerald-400 bg-clip-text text-transparent">Settings</h1>
          <div className="w-6" />
        </header>

        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-1/2 bg-blue-600/5 blur-[120px] pointer-events-none rounded-full" />
        
        <div className="w-full z-10 flex-1 flex flex-col">
          <div ref={containerRef} className="bg-neutral-900 shadow-2xl backdrop-blur-xl overflow-hidden flex flex-col md:flex-row flex-1">
          
          {/* Sidebar Tabs */}
          <div className="w-full md:w-64 bg-neutral-950/50 border-b md:border-b-0 md:border-r border-neutral-800 p-4 space-y-2 flex md:flex-col overflow-x-auto md:overflow-x-visible">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all whitespace-nowrap md:whitespace-normal ${
                    isActive 
                      ? 'bg-blue-500/10 text-blue-400 font-medium border border-blue-500/20' 
                      : 'text-neutral-400 hover:text-neutral-200 hover:bg-white/5 border border-transparent'
                  }`}
                >
                  <Icon className="w-5 h-5 shrink-0" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>

          {/* Tab Content */}
          <div className="flex-1 p-6 md:p-8" ref={tabContentRef}>
            
            {activeTab === 'profile' && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-2xl font-bold text-white mb-2">Profile Settings</h2>
                  <p className="text-neutral-400 text-sm">Update your personal information and credentials.</p>
                </div>
                
                {status && (
                  <div className={`p-4 rounded-xl text-sm flex items-center gap-2 ${
                    status.type === 'error' 
                      ? 'bg-red-500/10 border border-red-500/50 text-red-400' 
                      : 'bg-emerald-500/10 border border-emerald-500/50 text-emerald-400'
                  }`}>
                    {status.message}
                  </div>
                )}

                <form onSubmit={handleUpdateProfile} className="space-y-5">
                  <div>
                    <label className="flex items-center gap-2 text-neutral-400 text-sm font-medium mb-2">
                      <User className="w-4 h-4" />
                      Display Name
                    </label>
                    <input 
                      type="text" 
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      className="w-full bg-neutral-950 border border-neutral-800 text-white rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all"
                      placeholder="John Doe"
                    />
                  </div>
                  
                  <div>
                    <label className="flex items-center gap-2 text-neutral-400 text-sm font-medium mb-2">
                      <Mail className="w-4 h-4" />
                      Email Address
                    </label>
                    <input 
                      type="email" 
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full bg-neutral-950 border border-neutral-800 text-white rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all"
                    />
                  </div>

                  <div>
                    <label className="flex items-center gap-2 text-neutral-400 text-sm font-medium mb-2">
                      <Lock className="w-4 h-4" />
                      New Password
                    </label>
                    <input 
                      type="password" 
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      className="w-full bg-neutral-950 border border-neutral-800 text-white rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all placeholder-neutral-600"
                      placeholder="Leave blank to keep current"
                    />
                  </div>

                  <div className="pt-4">
                    <button 
                      type="submit"
                      disabled={isSaving}
                      className="w-full bg-blue-600 hover:bg-blue-500 text-white font-medium rounded-xl px-4 py-3 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      {isSaving ? <><Loader2 className="w-5 h-5 animate-spin" /> Saving...</> : "Save Profile"}
                    </button>
                  </div>
                </form>
              </div>
            )}

            {activeTab === 'api' && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-2xl font-bold text-white mb-2">AI API Keys</h2>
                  <p className="text-neutral-400 text-sm">Configure your personal API keys for custom models.</p>
                </div>
                
                {apiStatus && (
                  <div className={`p-4 rounded-xl text-sm flex items-center gap-2 ${
                    apiStatus.type === 'error' 
                      ? 'bg-red-500/10 border border-red-500/50 text-red-400' 
                      : 'bg-emerald-500/10 border border-emerald-500/50 text-emerald-400'
                  }`}>
                    {apiStatus.message}
                  </div>
                )}

                <form onSubmit={handleSaveApiKeys} className="space-y-5">
                  <div>
                    <label className="flex items-center gap-2 text-neutral-400 text-sm font-medium mb-2">
                      <Key className="w-4 h-4" />
                      Gemini API Key
                    </label>
                    <input 
                      type="password" 
                      value={geminiKey}
                      onChange={(e) => setGeminiKey(e.target.value)}
                      className="w-full bg-neutral-950 border border-neutral-800 text-white rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all"
                      placeholder="AIzaSy..."
                    />
                  </div>
                  
                  <div>
                    <label className="flex items-center gap-2 text-neutral-400 text-sm font-medium mb-2">
                      <Key className="w-4 h-4" />
                      OpenAI API Key
                    </label>
                    <input 
                      type="password" 
                      value={openAIKey}
                      onChange={(e) => setOpenAIKey(e.target.value)}
                      className="w-full bg-neutral-950 border border-neutral-800 text-white rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all"
                      placeholder="sk-..."
                    />
                  </div>

                  <div className="pt-4">
                    <button 
                      type="submit"
                      className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-medium rounded-xl px-4 py-3 transition-colors flex items-center justify-center gap-2"
                    >
                      Save API Keys
                    </button>
                  </div>
                </form>
              </div>
            )}

            {activeTab === 'usage' && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-2xl font-bold text-white mb-2">Token Usage Monitor</h2>
                  <p className="text-neutral-400 text-sm">Monitor your Gemini API rate limits in real-time.</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="bg-neutral-950 border border-neutral-800 rounded-2xl p-6 flex flex-col justify-between">
                    <div className="flex justify-between items-start mb-6">
                      <div>
                        <p className="text-neutral-400 text-sm font-medium">Requests Per Minute (RPM)</p>
                        <p className="text-3xl font-bold text-white mt-1">{requestsPerMinute}</p>
                      </div>
                      <div className={`px-3 py-1 rounded-full text-xs font-medium border ${
                        rateLimitStatus === 'Good' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
                        rateLimitStatus === 'Warning' ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' :
                        'bg-red-500/10 text-red-400 border-red-500/20'
                      }`}>
                        {rateLimitStatus}
                      </div>
                    </div>
                    
                    <div className="w-full bg-neutral-900 rounded-full h-2.5 overflow-hidden">
                      <div 
                        className={`h-2.5 rounded-full transition-all duration-500 ${
                          rateLimitStatus === 'Good' ? 'bg-emerald-500' :
                          rateLimitStatus === 'Warning' ? 'bg-amber-500' :
                          'bg-red-500'
                        }`} 
                        style={{ width: `${Math.min((requestsPerMinute / 15) * 100, 100)}%` }}
                      ></div>
                    </div>
                    <p className="text-xs text-neutral-500 mt-3 text-right">Free tier limit: ~15 RPM</p>
                  </div>
                  
                  <div className="bg-neutral-950 border border-neutral-800 rounded-2xl p-6 flex flex-col justify-center items-center text-center">
                    <Zap className="w-10 h-10 text-amber-500 mb-3 opacity-80" />
                    <h3 className="text-white font-medium mb-1">Live Tracking Active</h3>
                    <p className="text-neutral-400 text-xs px-2">Your requests are being monitored locally to help you stay within rate limits.</p>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'skills' && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-2xl font-bold text-white mb-2">Skills & MCP</h2>
                  <p className="text-neutral-400 text-sm">Enable or disable agentic capabilities and integrations.</p>
                </div>

                <div className="space-y-3">
                  {[
                    { id: 'webSearch', name: 'Web Search', desc: 'Allow the AI to search the internet for up-to-date information.' },
                    { id: 'fileSystem', name: 'File System Access', desc: 'Let the AI read and write files to your local workspace.' },
                    { id: 'terminal', name: 'Terminal Execution', desc: 'Enable the AI to run shell commands on your machine.' },
                    { id: 'codeExecution', name: 'Code Execution (MCP)', desc: 'Use Model Context Protocol to execute code sandboxes.' },
                  ].map((skill) => (
                    <div key={skill.id} className="bg-neutral-950 border border-neutral-800 rounded-xl p-4 flex items-center justify-between">
                      <div>
                        <h3 className="text-white font-medium">{skill.name}</h3>
                        <p className="text-neutral-400 text-xs mt-1">{skill.desc}</p>
                      </div>
                      <button 
                        onClick={() => handleToggleSkill(skill.id as keyof typeof skills)}
                        className={`relative w-12 h-6 rounded-full transition-colors ${skills[skill.id as keyof typeof skills] ? 'bg-blue-600' : 'bg-neutral-700'}`}
                      >
                        <div className={`absolute top-1 left-1 bg-white w-4 h-4 rounded-full transition-transform ${skills[skill.id as keyof typeof skills] ? 'translate-x-6' : 'translate-x-0'}`} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

          </div>
        </div>
        </div>
      </main>
    </div>
  );
}
