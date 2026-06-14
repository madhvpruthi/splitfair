import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { 
  LayoutDashboard, 
  Users, 
  FileUp, 
  User as UserIcon, 
  LogOut, 
  Sparkles,
  Menu,
  X
} from 'lucide-react';

export const Layout = ({ children }) => {
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const navItems = [
    { name: 'Dashboard', path: '/dashboard', icon: LayoutDashboard },
    { name: 'Groups', path: '/groups', icon: Users },
    { name: 'Import CSV', path: '/import', icon: FileUp },
    { name: 'Profile', path: '/profile', icon: UserIcon },
  ];

  // Helper component for Sidebar/Drawer Content to keep things DRY
  const SidebarContent = () => (
    <div className="flex flex-col justify-between h-full w-full">
      <div>
        {/* Logo */}
        <div className="p-6 border-b border-slate-800/80 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="bg-indigo-600 p-2 rounded-xl text-white shadow-lg shadow-indigo-600/30">
              <Sparkles size={20} className="animate-pulse" />
            </div>
            <div>
              <h1 className="font-extrabold text-xl bg-clip-text text-transparent bg-gradient-to-r from-white via-slate-200 to-indigo-400">
                SplitFair
              </h1>
              <p className="text-[10px] text-slate-500 font-bold tracking-wider uppercase">Expenses Manager</p>
            </div>
          </div>
          <button 
            onClick={() => setIsDrawerOpen(false)} 
            className="md:hidden text-slate-400 hover:text-slate-200"
          >
            <X size={20} />
          </button>
        </div>

        {/* Navigation links */}
        <nav className="p-4 space-y-1.5">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname.startsWith(item.path);
            return (
              <Link
                key={item.name}
                to={item.path}
                onClick={() => setIsDrawerOpen(false)}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl font-semibold transition-all duration-300 relative group ${
                  isActive
                    ? 'bg-indigo-600/15 text-indigo-400 border-l-4 border-indigo-500 pl-3 shadow-lg shadow-indigo-600/5'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/30'
                }`}
              >
                <Icon size={18} className={`transition-transform duration-300 group-hover:scale-110 ${isActive ? 'text-indigo-400' : ''}`} />
                <span>{item.name}</span>
              </Link>
            );
          })}
        </nav>
      </div>

      {/* User profile section at the bottom */}
      {user && (
        <div className="p-4 border-t border-slate-800/80 bg-slate-950/40 flex items-center justify-between">
          <div className="flex items-center gap-3 overflow-hidden">
            <div className="bg-indigo-600/30 text-indigo-400 font-extrabold w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border border-indigo-500/20">
              {user.username[0].toUpperCase()}
            </div>
            <div className="overflow-hidden">
              <p className="text-xs font-bold text-slate-200 truncate">{user.username}</p>
              <p className="text-[10px] text-slate-500 truncate">{user.email || 'No email'}</p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="text-slate-400 hover:text-rose-400 p-2 rounded-lg transition-all duration-200 cursor-pointer hover:bg-rose-500/10"
            title="Logout"
          >
            <LogOut size={16} />
          </button>
        </div>
      )}
    </div>
  );

  return (
    <div className="h-screen w-full flex flex-col md:flex-row md:p-4 gap-4 box-border overflow-hidden bg-slate-950">
      
      {/* Mobile Top Header */}
      <header className="md:hidden flex items-center justify-between px-6 py-4 bg-slate-900/50 border-b border-slate-800/80 backdrop-blur-md shrink-0">
        <button 
          onClick={() => setIsDrawerOpen(true)} 
          className="p-2 -ml-2 text-slate-400 hover:text-slate-200 rounded-lg hover:bg-slate-800/40 transition-colors"
        >
          <Menu size={24} />
        </button>
        <div className="flex items-center gap-2">
          <div className="bg-indigo-600 p-1.5 rounded-lg text-white">
            <Sparkles size={16} />
          </div>
          <span className="font-extrabold text-lg bg-clip-text text-transparent bg-gradient-to-r from-white via-slate-200 to-indigo-400">
            SplitFair
          </span>
        </div>
        <Link to="/profile" className="w-8 h-8 rounded-lg bg-indigo-600/30 text-indigo-400 font-bold flex items-center justify-center border border-indigo-500/20 text-xs shadow-md">
          {user?.username?.[0]?.toUpperCase()}
        </Link>
      </header>

      {/* Backdrop for Mobile Drawer */}
      {isDrawerOpen && (
        <div 
          className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-40 md:hidden"
          onClick={() => setIsDrawerOpen(false)}
        />
      )}

      {/* Mobile Drawer */}
      <aside className={`fixed inset-y-0 left-0 w-64 bg-slate-900/95 border-r border-slate-800/80 z-50 transform transition-transform duration-300 ease-in-out md:hidden flex flex-col ${
        isDrawerOpen ? 'translate-x-0' : '-translate-x-full'
      }`}>
        <SidebarContent />
      </aside>

      {/* Desktop Permanent Sidebar */}
      <aside className="hidden md:flex w-64 glass-panel flex-col justify-between shrink-0 h-full overflow-hidden shadow-2xl">
        <SidebarContent />
      </aside>

      {/* Main Content Pane */}
      <main className="flex-1 glass-panel md:rounded-2xl border-t md:border border-slate-800/60 flex flex-col overflow-hidden shadow-2xl h-full bg-slate-900/40">
        {/* Top bar */}
        <header className="h-16 border-b border-slate-800/50 flex items-center justify-between px-6 md:px-8 bg-slate-950/20 backdrop-blur-md shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-[10px] bg-slate-800/80 text-indigo-400 px-2.5 py-1 rounded-full font-bold border border-indigo-500/15 uppercase tracking-wide">
              Secure Sandbox
            </span>
          </div>
          <div className="text-xs font-semibold text-slate-400">
            Logged in as: <span className="text-indigo-400 font-bold bg-indigo-500/5 px-2 py-0.5 rounded border border-indigo-500/10">{user?.username}</span>
          </div>
        </header>

        {/* Page Inner Content */}
        <div className="flex-1 overflow-y-auto p-4 md:p-8">
          <div className="max-w-7xl mx-auto">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
};
