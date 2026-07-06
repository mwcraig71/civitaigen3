import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useLocation } from 'wouter';
import { User } from '@/types';
import { Bell, Coins, Menu, X, LogIn, LogOut, ChevronDown, Gift, Flame } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
// Removed 3.7MB logo image import for performance
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';

// Primary destinations stay visible; creation tools collapse into one menu.
const PRIMARY_NAV = [
  { href: '/fip-fap', label: 'Fip Fap', testId: 'nav-fip-fap' },
  { href: '/generate', label: 'Generate', testId: 'nav-generate' },
  { href: '/easy-mode', label: 'Easy Mode', testId: 'nav-easy-mode' },
  { href: '/generations', label: 'My Gallery', testId: 'nav-gallery' },
  { href: '/community', label: 'Community', testId: 'nav-community' },
];

const TOOLS_NAV = [
  { href: '/transform', label: 'Transform Studio', testId: 'nav-transform' },
  { href: '/characters', label: 'Characters', testId: 'nav-characters' },
  { href: '/scene-builder', label: 'Scene Builder', testId: 'nav-scene' },
  { href: '/events', label: 'Events', testId: 'nav-events' },
  { href: '/saved-prompts', label: 'Saved Prompts', testId: 'nav-prompts' },
  { href: '/models', label: 'Models', testId: 'nav-models' },
];

export default function Header() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const { user, isAuthenticated, isLoading } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [location] = useLocation();
  
  // Check if user has their own API key to determine credit pricing
  const { data: apiKeyData } = useQuery<{ hasApiKey: boolean }>({
    queryKey: ['/api/user/api-key-status'],
    enabled: isAuthenticated,
  });

  // Daily reward status + claim
  const { data: dailyReward } = useQuery<{ canClaim: boolean; streak: number; nextReward: number }>({
    queryKey: ['/api/rewards/daily-status'],
    enabled: isAuthenticated,
    refetchInterval: 60 * 60 * 1000, // re-check hourly for the UTC rollover
  });
  const claimMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('POST', '/api/rewards/daily-claim');
      return response.json();
    },
    onSuccess: (data: { reward: number; streak: number }) => {
      queryClient.invalidateQueries({ queryKey: ['/api/rewards/daily-status'] });
      queryClient.invalidateQueries({ queryKey: ['/api/auth/user'] });
      toast({
        title: `+${data.reward} Buzz claimed!`,
        description: data.streak > 1
          ? `🔥 ${data.streak}-day streak — keep it going for bigger rewards.`
          : 'Come back tomorrow to start a streak and earn more.',
      });
    },
  });
  
  // Helper function to check if a link is active
  const isActive = (href: string, exact = false) => {
    return exact ? location === href : location === href || location.startsWith(href + '/');
  };
  
  // Helper function to get navigation link classes
  const navLinkClass = (href: string, baseClasses: string) => {
    const active = isActive(href);
    return active 
      ? `${baseClasses} text-[hsl(180,100%,50%)] font-semibold`
      : `${baseClasses} text-[hsl(180,30%,60%)] hover:text-[hsl(180,100%,70%)]`;
  };
  
  // Fallback to demo user if not authenticated (for development)
  const { data: demoUser } = useQuery<User>({
    queryKey: ['/api/user'],
    enabled: !isAuthenticated && !isLoading,
  });
  
  const currentUser = (user as User) || demoUser;

  // Fetch notifications for authenticated users
  const { data: notifications = [] } = useQuery<any[]>({
    queryKey: ['/api/notifications'],
    enabled: isAuthenticated,
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  // Fetch unread notification count
  const { data: unreadCount = { count: 0 } } = useQuery<{ count: number }>({
    queryKey: ['/api/notifications/unread-count'],
    enabled: isAuthenticated,
    refetchInterval: 30000,
  });

  // Mark notification as read
  const markAsRead = useMutation({
    mutationFn: (notificationId: string) => apiRequest('POST', `/api/notifications/${notificationId}/mark-read`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/notifications'] });
      queryClient.invalidateQueries({ queryKey: ['/api/notifications/unread-count'] });
    },
  });

  // Mark all notifications as read
  const markAllAsRead = useMutation({
    mutationFn: () => apiRequest('POST', '/api/notifications/mark-all-read'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/notifications'] });
      queryClient.invalidateQueries({ queryKey: ['/api/notifications/unread-count'] });
    },
  });

  return (
    <header className="bg-[hsl(240,25%,6%)] border-b border-[hsl(180,50%,20%)] sticky top-0 z-50 shadow-[0_0_20px_rgba(0,255,255,0.1)]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-20 md:h-16">
          {/* Logo */}
          <div className="flex items-center space-x-4">
            <Link href="/" className="flex items-center">
              <div className="text-2xl md:text-3xl font-bold font-[Orbitron,sans-serif] tracking-wider uppercase bg-gradient-to-r from-[hsl(180,100%,50%)] via-[hsl(320,100%,60%)] to-[hsl(270,100%,65%)] bg-clip-text text-transparent animate-pulse" style={{textShadow: '0 0 10px rgba(0,255,255,0.5)'}}>
                CiviVerse
              </div>
            </Link>
            
            {/* Desktop Navigation */}
            <nav className="hidden md:flex items-center space-x-1 text-sm">
              {PRIMARY_NAV.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={navLinkClass(item.href, "px-2.5 py-2 rounded-md transition-colors whitespace-nowrap hover:bg-dark-bg/60")}
                  data-testid={item.testId}
                  aria-current={isActive(item.href) ? "page" : undefined}
                >
                  {item.label}
                </Link>
              ))}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className={`flex items-center px-2.5 py-2 rounded-md transition-colors whitespace-nowrap hover:bg-dark-bg/60 ${
                      TOOLS_NAV.some((item) => isActive(item.href))
                        ? 'text-[hsl(180,100%,50%)] font-semibold'
                        : 'text-[hsl(180,30%,60%)] hover:text-[hsl(180,100%,70%)]'
                    }`}
                    data-testid="nav-tools"
                  >
                    Create
                    <ChevronDown className="h-3.5 w-3.5 ml-1" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="bg-dark-card border-dark-border w-48">
                  {TOOLS_NAV.map((item) => (
                    <DropdownMenuItem key={item.href} asChild>
                      <Link
                        href={item.href}
                        className={`w-full cursor-pointer ${isActive(item.href) ? 'text-[hsl(180,100%,50%)] font-semibold' : ''}`}
                        data-testid={item.testId}
                      >
                        {item.label}
                      </Link>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </nav>
          </div>

          {/* User Actions */}
          <div className="flex items-center space-x-1 sm:space-x-2 md:space-x-4">
            {currentUser && dailyReward && (
              dailyReward.canClaim ? (
                <button
                  onClick={() => claimMutation.mutate()}
                  disabled={claimMutation.isPending}
                  className="flex items-center gap-1.5 min-h-[36px] bg-gradient-to-r from-amber-500/20 to-pink-500/20 border border-amber-400/50 px-2.5 py-1.5 rounded-md text-amber-300 hover:border-amber-300 hover:shadow-[0_0_10px_rgba(251,191,36,0.3)] transition-all animate-pulse"
                  title={`Claim your daily +${dailyReward.nextReward} Buzz`}
                  data-testid="button-daily-claim"
                >
                  <Gift className="h-4 w-4" />
                  <span className="text-sm font-semibold whitespace-nowrap">+{dailyReward.nextReward}</span>
                </button>
              ) : dailyReward.streak > 1 ? (
                <div
                  className="hidden sm:flex items-center gap-1 px-2 py-1.5 text-orange-400"
                  title={`${dailyReward.streak}-day streak — come back tomorrow for +${dailyReward.nextReward} Buzz`}
                  data-testid="text-streak"
                >
                  <Flame className="h-4 w-4" />
                  <span className="text-sm font-semibold">{dailyReward.streak}</span>
                </div>
              ) : null
            )}
            {currentUser && (
              <Link href="/settings">
                <div className="hidden sm:flex items-center space-x-2 bg-[hsl(240,25%,8%)] border border-[hsl(180,50%,20%)] px-3 py-2 rounded hover:border-[hsl(180,100%,50%)] hover:shadow-[0_0_10px_rgba(0,255,255,0.2)] transition-all cursor-pointer">
                  <Coins className="h-4 w-4 text-[hsl(60,100%,50%)]" />
                  <span className="font-medium" data-testid="text-credits">
                    {currentUser.buzzCredits.toLocaleString()}
                  </span>
                  <span className="text-slate-400 text-sm">
                    Buzz
                    {currentUser.id === 'demo_user_fixed_id' && currentUser.buzzCredits > 0 && (
                      <span className="ml-1 text-orange-400">
                        (~{Math.floor(currentUser.buzzCredits / (apiKeyData?.hasApiKey ? 4 : 12))} left)
                      </span>
                    )}
                  </span>
                </div>
              </Link>
            )}
            
            {/* Mobile Credits - Ultra Compact */}
            {currentUser && (
              <Link href="/settings" className="sm:hidden">
                <div className="flex items-center space-x-1 px-1.5 py-1 rounded hover:bg-dark-bg/50 transition-colors cursor-pointer">
                  <Coins className="h-3.5 w-3.5 text-yellow-500" />
                  <span className="font-medium text-xs" data-testid="mobile-credits">
                    {currentUser.buzzCredits.toLocaleString()}
                  </span>
                </div>
              </Link>
            )}
            
            {/* Authentication Buttons */}
            {isAuthenticated ? (
              <>
                <Popover open={notificationsOpen} onOpenChange={setNotificationsOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="hover:bg-dark-bg relative h-8 w-8 min-h-[32px] min-w-[32px] md:min-h-[36px] md:min-w-[36px]"
                      data-testid="button-notifications"
                    >
                      <Bell className="h-4 w-4 text-slate-400" />
                      {unreadCount.count > 0 && (
                        <span className="absolute -top-0.5 -right-0.5 h-4 w-4 rounded-full bg-red-500 text-white text-[10px] flex items-center justify-center font-medium">
                          {unreadCount.count > 9 ? '9+' : unreadCount.count}
                        </span>
                      )}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-80 p-0 bg-dark-card border-dark-border" align="end">
                    <div className="p-4 border-b border-dark-border">
                      <div className="flex items-center justify-between">
                        <h3 className="font-medium text-white">Notifications</h3>
                        {notifications.length > 0 && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => markAllAsRead.mutate()}
                            className="text-xs text-slate-400 hover:text-white"
                          >
                            Mark all read
                          </Button>
                        )}
                      </div>
                    </div>
                    <ScrollArea className="max-h-96">
                      {notifications.length === 0 ? (
                        <div className="p-4 text-center text-slate-400">
                          No notifications
                        </div>
                      ) : (
                        <div className="divide-y divide-dark-border">
                          {notifications.map((notification: any) => (
                            <div
                              key={notification.id}
                              className={`p-4 hover:bg-dark-bg cursor-pointer transition-colors ${
                                !notification.read ? 'bg-blue-500/10' : ''
                              }`}
                              onClick={() => {
                                if (!notification.read) {
                                  markAsRead.mutate(notification.id);
                                }
                              }}
                            >
                              <div className="flex items-start gap-3">
                                <div className="flex-1">
                                  <h4 className={`text-sm font-medium ${
                                    notification.read ? 'text-slate-400' : 'text-white'
                                  }`}>
                                    {notification.title}
                                  </h4>
                                  <p className="text-xs text-slate-500 mt-1">
                                    {notification.message}
                                  </p>
                                  <p className="text-xs text-slate-600 mt-2">
                                    {new Date(notification.createdAt).toLocaleDateString()}
                                  </p>
                                </div>
                                {!notification.read && (
                                  <div className="w-2 h-2 rounded-full bg-blue-500 mt-1"></div>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </ScrollArea>
                  </PopoverContent>
                </Popover>
                <Link href="/profile">
                  <Avatar className="w-7 h-7 sm:w-8 sm:h-8 md:w-8 md:h-8 cursor-pointer hover:opacity-80 transition-opacity">
                    <AvatarImage src={currentUser?.profileImageUrl || ''} />
                    <AvatarFallback className="bg-gradient-to-r from-primary-500 to-secondary-500">
                      <span className="text-xs sm:text-sm font-semibold" data-testid="text-user-initial">
                        {currentUser?.username?.charAt(0).toUpperCase() || 'U'}
                      </span>
                    </AvatarFallback>
                  </Avatar>
                </Link>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => window.open("/api/logout", "_blank", "noopener,noreferrer")}
                  className="hidden sm:flex items-center space-x-1 text-slate-400 hover:text-white"
                  data-testid="button-logout"
                >
                  <LogOut className="h-4 w-4" />
                  <span>Logout</span>
                </Button>
              </>
            ) : (
              <Button
                variant="default"
                size="sm"
                onClick={() => window.open("/api/login", "_blank", "noopener,noreferrer")}
                className="flex items-center space-x-1"
                data-testid="button-login"
              >
                <LogIn className="h-4 w-4" />
                <span>Login</span>
              </Button>
            )}
            
            {/* Mobile Menu Button - Compact */}
            <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
              <SheetTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="md:hidden hover:bg-dark-bg h-8 min-h-[32px] px-2 py-1 border border-dark-border bg-dark-bg/50"
                  data-testid="button-mobile-menu"
                >
                  <Menu className="h-5 w-5 text-white" />
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="bg-dark-card border-dark-border w-80 flex flex-col">
                <SheetHeader className="flex-shrink-0">
                  <SheetTitle className="text-white flex items-center">
                    <div className="text-xl font-bold bg-gradient-to-r from-purple-400 to-pink-600 bg-clip-text text-transparent mr-2">
                      CiviVerse
                    </div>
                  </SheetTitle>
                </SheetHeader>
                <nav className="flex flex-col mt-6 overflow-y-auto flex-1 pr-2">
                  {PRIMARY_NAV.map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={navLinkClass(item.href, "text-slate-400 hover:text-white transition-colors px-4 py-3 min-h-[44px] rounded-lg hover:bg-dark-bg")}
                      data-testid={`mobile-${item.testId}`}
                      onClick={() => setMobileMenuOpen(false)}
                      aria-current={isActive(item.href) ? "page" : undefined}
                    >
                      {item.label}
                    </Link>
                  ))}

                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 px-4 pt-5 pb-1">
                    Create
                  </p>
                  {TOOLS_NAV.map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={navLinkClass(item.href, "text-slate-400 hover:text-white transition-colors px-4 py-3 min-h-[44px] rounded-lg hover:bg-dark-bg")}
                      data-testid={`mobile-${item.testId}`}
                      onClick={() => setMobileMenuOpen(false)}
                      aria-current={isActive(item.href) ? "page" : undefined}
                    >
                      {item.label}
                    </Link>
                  ))}

                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 px-4 pt-5 pb-1">
                    Account
                  </p>
                  <Link
                    href="/profile"
                    className={navLinkClass("/profile", "text-slate-400 hover:text-white transition-colors px-4 py-3 min-h-[44px] rounded-lg hover:bg-dark-bg")}
                    data-testid="mobile-nav-profile"
                    onClick={() => setMobileMenuOpen(false)}
                    aria-current={isActive("/profile") ? "page" : undefined}
                  >
                    Profile
                  </Link>
                  <Link
                    href="/feedback"
                    className={navLinkClass("/feedback", "text-slate-400 hover:text-white transition-colors px-4 py-3 min-h-[44px] rounded-lg hover:bg-dark-bg")}
                    data-testid="mobile-nav-feedback"
                    onClick={() => setMobileMenuOpen(false)}
                    aria-current={isActive("/feedback") ? "page" : undefined}
                  >
                    Feedback
                  </Link>
                  
                  {/* Buy More Buzz — hidden (free tier) */}
                  
                  {/* Mobile Credits Display */}
                  {currentUser && (
                    <Link href="/settings" onClick={() => setMobileMenuOpen(false)}>
                      <div className="flex items-center space-x-2 bg-dark-bg px-4 py-3 rounded-lg mt-4 hover:bg-opacity-80 transition-colors cursor-pointer">
                        <Coins className="h-4 w-4 text-yellow-500" />
                        <span className="font-medium text-white">
                          {currentUser.buzzCredits.toLocaleString()}
                        </span>
                        <span className="text-slate-400 text-sm">Buzz</span>
                      </div>
                    </Link>
                  )}
                  
                  {/* Mobile Authentication */}
                  {isAuthenticated ? (
                    <Button
                      variant="ghost"
                      onClick={() => {
                        setMobileMenuOpen(false);
                        window.location.href = "/api/logout";
                      }}
                      className="flex items-center space-x-2 text-slate-400 hover:text-white px-4 py-3 rounded-lg hover:bg-dark-bg mt-4 w-full justify-start"
                      data-testid="mobile-button-logout"
                    >
                      <LogOut className="h-4 w-4" />
                      <span>Logout</span>
                    </Button>
                  ) : (
                    <Button
                      variant="default"
                      onClick={() => {
                        setMobileMenuOpen(false);
                        window.location.href = "/api/login";
                      }}
                      className="flex items-center space-x-2 px-4 py-3 rounded-lg mt-4 w-full justify-center"
                      data-testid="mobile-button-login"
                    >
                      <LogIn className="h-4 w-4" />
                      <span>Login</span>
                    </Button>
                  )}
                </nav>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </div>
    </header>
  );
}
