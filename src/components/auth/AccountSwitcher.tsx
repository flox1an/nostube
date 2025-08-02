// NOTE: This file is stable and usually should not be modified.
// It is important that all functionality in this file is preserved, and should only be modified if explicitly requested.

import { ChevronDown, LogOut, UserPlus } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu.tsx';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar.tsx';
import { useNavigate } from 'react-router-dom';
import { imageProxy } from '@/lib/utils';
import { useAccountManager, useActiveAccount } from 'applesauce-react/hooks';
import { useProfile } from '@/hooks/useProfile';
import { getDisplayName } from 'applesauce-core/helpers';

interface AccountSwitcherProps {
  onAddAccountClick: () => void;
}

export function AccountSwitcher({ onAddAccountClick }: AccountSwitcherProps) {
  const activeAccount = useActiveAccount();
  const accountManager = useAccountManager();
  const profile = useProfile(activeAccount ? {pubkey: activeAccount?.pubkey}: undefined)
  const navigate = useNavigate();
  if (!activeAccount) return null;


  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="flex items-center gap-2 py-1 px-3 rounded-full hover:bg-accent transition-all w-full text-foreground">
          <Avatar className="w-10 h-10">
            <AvatarImage
              src={imageProxy(profile?.picture as string)}
              alt={getDisplayName(profile)}
            />
            <AvatarFallback>{getDisplayName(profile)?.charAt(0)}</AvatarFallback>
          </Avatar>
          <div className="flex-1 text-left hidden md:block truncate">
            <p className="font-medium text-sm truncate">{getDisplayName(profile)}</p>
          </div>
          <ChevronDown className="w-4 h-4 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56 p-2 animate-scale-in">
        <DropdownMenuItem
          onClick={() => navigate('/playlists')}
          className="flex items-center gap-2 cursor-pointer p-2 rounded-md"
        >
          <UserPlus className="w-4 h-4" />
          <span>Playlists</span>
        </DropdownMenuItem>
        {/* 
        <div className="font-medium text-sm px-2 py-1.5">Switch Relay</div>
        <RelaySelector className="w-full" />
        */}

        {/* 
        <DropdownMenuSeparator />
        <div className="font-medium text-sm px-2 py-1.5">Switch Account</div>
        {otherUsers.map(user => (
          <DropdownMenuItem
            key={user.id}
            onClick={() => setLogin(user as unknown as Record<string, unknown>)}
            className="flex items-center gap-2 cursor-pointer p-2 rounded-md"
          >
            <Avatar className="w-8 h-8">
              <AvatarImage
                src={imageProxy((user.metadata as Record<string, unknown>).picture as string)}
                alt={getDisplayName(user)}
              />
              <AvatarFallback>{getDisplayName(user)?.charAt(0) || <UserIcon />}</AvatarFallback>
            </Avatar>
            <div className="flex-1 truncate">
              <p className="text-sm font-medium">{getDisplayName(user)}</p>
            </div>
            {user.id === currentUser.id && <div className="w-2 h-2 rounded-full bg-primary"></div>}
          </DropdownMenuItem>
        ))}
          */}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onAddAccountClick} className="flex items-center gap-2 cursor-pointer p-2 rounded-md">
          <UserPlus className="w-4 h-4" />
          <span>Add another account</span>
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => accountManager.removeAccount(activeAccount)}
          className="flex items-center gap-2 cursor-pointer p-2 rounded-md text-red-500"
        >
          <LogOut className="w-4 h-4" />
          <span>Log out</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
