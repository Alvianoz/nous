"use client";

import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import { updateProfile, updateEmail, updatePassword } from "firebase/auth";
import { ArrowLeft, User, Mail, Lock, Loader2 } from "lucide-react";
import gsap from "gsap";

export default function ProfilePage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  
  const [status, setStatus] = useState<{ type: 'error' | 'success', message: string } | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!loading && !user) {
      router.push("/login");
    } else if (user) {
      setDisplayName(user.displayName || "");
      setEmail(user.email || "");
      
      gsap.fromTo(cardRef.current, 
        { y: 30, opacity: 0 }, 
        { y: 0, opacity: 1, duration: 0.6, ease: "power3.out" }
      );
    }
  }, [user, loading, router]);

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
      setNewPassword(""); // Clear password field after success
      
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

  if (loading || !user) {
    return (
      <div className="min-h-screen bg-neutral-950 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-950 flex flex-col items-center justify-center p-4">
      {/* Background Glow */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-1/2 bg-blue-600/5 blur-[120px] pointer-events-none rounded-full" />
      
      <div className="w-full max-w-lg w-full z-10">
        <button 
          onClick={() => router.push("/")}
          className="flex items-center gap-2 text-neutral-400 hover:text-white transition-colors mb-6 group"
        >
          <ArrowLeft className="w-5 h-5 group-hover:-translate-x-1 transition-transform" />
          <span>Back to Chat</span>
        </button>

        <div ref={cardRef} className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 md:p-8 shadow-2xl backdrop-blur-xl">
          <div className="flex items-center gap-4 mb-8 border-b border-neutral-800 pb-6">
            <div className="w-16 h-16 bg-gradient-to-tr from-blue-500 to-emerald-500 rounded-full flex items-center justify-center text-2xl font-bold text-white shadow-lg">
              {displayName ? displayName.charAt(0).toUpperCase() : user.email?.charAt(0).toUpperCase()}
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">Account Settings</h1>
              <p className="text-neutral-400 text-sm">Manage your profile and preferences</p>
            </div>
          </div>

          {status && (
            <div className={`p-4 rounded-xl text-sm mb-6 flex items-center gap-2 ${
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
                {isSaving ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Saving Changes...
                  </>
                ) : (
                  "Save Changes"
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
