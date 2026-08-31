"use client";

import { useEffect, useState, useRef } from "react";
import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import { collection, query, orderBy, onSnapshot, addDoc, serverTimestamp, deleteDoc, doc } from "firebase/firestore";
import { db } from "@/utils/firebase";
import { Folder, Plus, ArrowLeft, Trash2, FolderOpen, Menu } from "lucide-react";
import gsap from "gsap";
import Sidebar from "@/components/Sidebar";

export default function ProjectsDashboard() {
  const { user, loading } = useAuth();
  const router = useRouter();
  
  const [projects, setProjects] = useState<any[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  
  const containerRef = useRef<HTMLDivElement>(null);
  
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

  useEffect(() => {
    if (!loading && !user) {
      router.push("/login");
    }
  }, [user, loading, router]);

  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, `users/${user.uid}/projects`), orderBy("updatedAt", "desc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const projData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setProjects(projData);
    });
    return () => unsubscribe();
  }, [user]);

  useEffect(() => {
    if (user && projects.length > 0) {
      gsap.fromTo(".project-card",
        { y: 20, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.4, stagger: 0.05, ease: "power2.out" }
      );
    }
  }, [user, projects.length]);

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProjectName.trim() || !user || isCreating) return;
    
    setIsCreating(true);
    try {
      const newProjRef = await addDoc(collection(db, `users/${user.uid}/projects`), {
        name: newProjectName.trim(),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setNewProjectName("");
      router.push(`/projects/${newProjRef.id}`);
    } catch (error) {
      console.error("Error creating project:", error);
    } finally {
      setIsCreating(false);
    }
  };

  const handleDeleteProject = async (e: React.MouseEvent, projectId: string) => {
    e.stopPropagation();
    if (!user || !confirm("Are you sure you want to delete this project? All chats inside it will be lost.")) return;
    try {
      await deleteDoc(doc(db, `users/${user.uid}/projects/${projectId}`));
    } catch (error) {
      console.error("Failed to delete project:", error);
    }
  };

  if (loading || !user) {
    return <div className="min-h-screen bg-neutral-950 flex items-center justify-center"><div className="w-8 h-8 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" /></div>;
  }

  return (
    <div className="flex h-screen bg-neutral-950 text-neutral-100 overflow-hidden font-sans">
      <Sidebar 
        sidebarRef={sidebarRef as React.RefObject<HTMLElement>}
        isSidebarOpen={isSidebarOpen}
        toggleSidebar={toggleSidebar}
        isDashboard={true}
      />
      
      <main ref={mainRef} className="flex-1 relative overflow-y-auto p-6 md:p-12">
        {/* Background Effect */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-blue-600/10 blur-[120px] pointer-events-none rounded-full" />
        
        {/* Mobile Header */}
        <header className="md:hidden flex items-center justify-between mb-8">
          <button onClick={toggleSidebar} className="text-neutral-400 hover:text-white">
            <Menu className="w-6 h-6" />
          </button>
          <h1 className="text-xl font-bold bg-gradient-to-r from-blue-400 to-emerald-400 bg-clip-text text-transparent">Nous AI</h1>
          <div className="w-6" />
        </header>

        <div className="max-w-6xl mx-auto relative z-10" ref={containerRef}>
          <div className="flex items-center gap-4 mb-10">
            <button 
              onClick={() => router.push("/")}
              className="p-2.5 bg-neutral-900 border border-neutral-800 rounded-xl text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors hidden md:block"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
          <div>
            <h1 className="text-3xl font-bold text-white">Projects</h1>
            <p className="text-neutral-400 text-sm mt-1">Manage your separate AI workspaces</p>
          </div>
        </div>

        {/* Create New Project Form */}
        <div className="bg-neutral-900/50 border border-neutral-800 border-dashed rounded-2xl p-6 mb-8 transition-colors">
          <form onSubmit={handleCreateProject} className="w-full flex flex-col md:flex-row items-center gap-4">
            <div className="flex-1 w-full relative">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-neutral-500">
                <Folder className="w-5 h-5" />
              </div>
              <input 
                type="text" 
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
                placeholder="Enter new project name..."
                className="w-full bg-neutral-950 border border-neutral-800 rounded-xl pl-12 pr-4 py-3 text-sm focus:outline-none focus:border-blue-500 text-white"
              />
            </div>
            <button 
              type="submit"
              disabled={!newProjectName.trim() || isCreating}
              className="w-full md:w-auto px-8 py-3 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-xl text-sm font-medium transition-colors flex items-center justify-center gap-2 shrink-0"
            >
              {isCreating ? <span className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" /> : <Plus className="w-4 h-4" />}
              Create Project
            </button>
          </form>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-6">
          {/* Project List */}
          {projects.map((project) => (
            <div 
              key={project.id} 
              onClick={() => router.push(`/projects/${project.id}`)}
              className="project-card group bg-neutral-900 border border-neutral-800 rounded-2xl p-6 hover:border-neutral-700 hover:shadow-2xl hover:shadow-blue-900/5 cursor-pointer transition-all flex flex-col h-[200px] relative overflow-hidden"
            >
              <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-bl from-blue-500/10 to-transparent rounded-bl-full pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity" />
              
              <div className="flex items-start justify-between mb-auto">
                <div className="w-12 h-12 bg-neutral-950 border border-neutral-800 rounded-xl flex items-center justify-center text-neutral-400 group-hover:text-blue-400 group-hover:border-blue-900 transition-colors">
                  <FolderOpen className="w-6 h-6" />
                </div>
                <button 
                  onClick={(e) => handleDeleteProject(e, project.id)}
                  className="p-2 text-neutral-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg opacity-0 group-hover:opacity-100 transition-all"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-white group-hover:text-blue-400 transition-colors truncate">{project.name}</h3>
                <p className="text-neutral-500 text-xs mt-1">
                  Updated {project.updatedAt?.toDate ? new Date(project.updatedAt.toDate()).toLocaleDateString() : 'Just now'}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  </div>
  );
}
