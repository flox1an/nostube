import { useEventModel } from 'applesauce-react/hooks';
import { ContactsModel } from 'applesauce-core/models';
import { useCurrentUser } from './useCurrentUser';
import { useMemo } from 'react';

export function useFollowedAuthors() {
  const { user } = useCurrentUser();

  // Use ContactsModel to get user's contact list
  const contacts = useEventModel(ContactsModel, user?.pubkey ? [user.pubkey] : null) || [];

  const followedPubkeys = useMemo(() => {
    return contacts.map(contact => contact.pubkey);
  }, [contacts]);

  return {
    data: followedPubkeys,
    isLoading: user && contacts.length === 0,
    enabled: !!user?.pubkey,
  };
}
