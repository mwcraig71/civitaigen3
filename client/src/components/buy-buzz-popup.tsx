import { useState, useEffect, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Zap, Gift } from 'lucide-react';

interface BuyBuzzPopupProps {
  isAuthenticated: boolean;
}

const FREE_POPUP_SEEN_KEY = 'civiverse_free_popup_seen';

export function BuyBuzzPopup({ isAuthenticated }: BuyBuzzPopupProps) {
  const [isOpen, setIsOpen] = useState(false);
  const wasAuthenticatedRef = useRef(false);

  useEffect(() => {
    if (isAuthenticated && !wasAuthenticatedRef.current) {
      const alreadySeen = localStorage.getItem(FREE_POPUP_SEEN_KEY);
      if (!alreadySeen) {
        setIsOpen(true);
      }
    }
    wasAuthenticatedRef.current = isAuthenticated;
  }, [isAuthenticated]);

  const handleClose = () => {
    localStorage.setItem(FREE_POPUP_SEEN_KEY, '1');
    setIsOpen(false);
  };

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      localStorage.setItem(FREE_POPUP_SEEN_KEY, '1');
    }
    setIsOpen(open);
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 border-slate-600/30">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold text-center text-white">
            CiviVerse is Free!
          </DialogTitle>
        </DialogHeader>
        
        <div className="text-center py-4">
          <div className="flex justify-center mb-4 gap-2">
            <Gift className="h-10 w-10 text-green-400" />
            <Zap className="h-10 w-10 text-yellow-400" />
          </div>
          
          <p className="text-lg text-white mb-4">
            Welcome! CiviVerse is now <span className="font-bold text-green-400">completely free</span> to use.
          </p>
          
          <p className="text-gray-300 mb-4">
            You receive <span className="font-semibold text-yellow-400">500 free Buzz credits</span> every 30 days — automatically topped up when your balance runs low.
          </p>
          
          <p className="text-gray-400 text-sm">
            Add your own CivitAI API key in Settings to get a <strong className="text-green-400">67% discount</strong> on generations (4 credits instead of 12).
          </p>
          
          <div className="flex flex-col gap-3 mt-6">
            <Button
              onClick={handleClose}
              className="bg-green-600 hover:bg-green-500 text-white font-medium py-3"
            >
              Start Creating!
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
